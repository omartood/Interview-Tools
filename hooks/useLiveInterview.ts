import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState, InterviewConfig, TranscriptItem } from '../types';
import { createPcmBlob, decode, decodeAudioData } from '../utils/audio';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

export const useLiveInterview = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(0);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const scheduledSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  
  // Transcription accumulation refs
  const currentInputRef = useRef('');
  const currentOutputRef = useRef('');

  const disconnect = useCallback(() => {
    console.log('Disconnecting session...');
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }

    scheduledSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    scheduledSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (sessionPromiseRef.current) {
      // Attempt to close if the promise resolved successfully
      sessionPromiseRef.current.then(session => {
         if (session && session.close) session.close();
      }).catch(() => {
        // Ignore errors if closing a failed session
      });
      sessionPromiseRef.current = null;
    }

    setConnectionState(ConnectionState.DISCONNECTED);
    setVolume(0);
  }, []);

  const connect = useCallback(async (config: InterviewConfig) => {
    // Prevent multiple connections
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) return;

    try {
      setConnectionState(ConnectionState.CONNECTING);
      setError(null);
      setTranscript([]); // Clear previous transcript
      currentInputRef.current = '';
      currentOutputRef.current = '';

      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error("API Key not found in environment.");
      }

      // 1. Setup Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: INPUT_SAMPLE_RATE });
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: OUTPUT_SAMPLE_RATE });

      // Resume contexts if suspended (browser requirement)
      if (inputAudioContextRef.current.state === 'suspended') {
        await inputAudioContextRef.current.resume();
      }
      if (outputAudioContextRef.current.state === 'suspended') {
        await outputAudioContextRef.current.resume();
      }

      // 2. Get Media Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      mediaStreamRef.current = stream;

      // 3. Initialize Gemini Client
      const ai = new GoogleGenAI({ apiKey });

      // 4. Generate System Instruction based on Config
      const systemInstructionText = `
      You are an expert Technical Recruiter and Senior Engineer at a ${config.companyType}.
      You are conducting a behavioral and technical interview for a ${config.targetRole} position.
      The candidate is at a ${config.experienceLevel} level.

      Your goal is to assess the candidate's soft skills, problem-solving abilities, and technical knowledge suitable for a ${config.experienceLevel} ${config.targetRole}.

      Protocol:
      1. Start by welcoming the candidate to the interview for the ${config.targetRole} position at your ${config.companyType} and ask them to introduce themselves.
      2. Listen to their response.
      3. Ask one relevant follow-up or new question at a time.
      4. If the user answers well, provide brief positive reinforcement and move to the next deeper question.
      5. If the user struggles, offer a small hint or rephrase the question.
      6. Keep your responses concise and conversational (under 4 sentences usually) to maintain a natural flow.
      7. Maintain a professional, encouraging, but objective tone suitable for a ${config.companyType} environment.
      `;
      
      // 5. Start Session
      // Note: Using object format for systemInstruction is more robust for the Live API
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: systemInstructionText }] },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            console.log("Session Opened");
            setConnectionState(ConnectionState.CONNECTED);
            
            if (!inputAudioContextRef.current || !mediaStreamRef.current) return;
            
            const source = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
            inputSourceRef.current = source;
            
            const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Volume calculation
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / inputData.length);
              setVolume(Math.min(rms * 5, 1));

              const pcmBlob = createPcmBlob(inputData);
              
              // Send audio only if session is active
              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then(session => {
                  try {
                    session.sendRealtimeInput({ media: pcmBlob });
                  } catch (e) {
                    console.error("Error sending audio input", e);
                  }
                }).catch(err => {
                    // Suppress errors from cancelled sessions
                });
              }
            };

            source.connect(processor);
            processor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // 1. Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              try {
                const audioBuffer = await decodeAudioData(
                  decode(base64Audio),
                  ctx,
                  OUTPUT_SAMPLE_RATE,
                  1
                );
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                
                source.onended = () => {
                  scheduledSourcesRef.current.delete(source);
                };
                
                source.start(nextStartTimeRef.current);
                scheduledSourcesRef.current.add(source);
                
                nextStartTimeRef.current += audioBuffer.duration;
              } catch (err) {
                console.error("Error decoding audio", err);
              }
            }

            // 2. Handle Interruption
            if (message.serverContent?.interrupted) {
              scheduledSourcesRef.current.forEach(source => source.stop());
              scheduledSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }

            // 3. Handle Transcription
            if (message.serverContent?.inputTranscription) {
                currentInputRef.current += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
                currentOutputRef.current += message.serverContent.outputTranscription.text;
            }

            // 4. Handle Turn Completion (Commit Transcript)
            if (message.serverContent?.turnComplete) {
                const userText = currentInputRef.current.trim();
                const aiText = currentOutputRef.current.trim();
                
                if (userText || aiText) {
                   setTranscript(prev => [
                       ...prev,
                       ...(userText ? [{ role: 'user', text: userText, timestamp: Date.now() } as TranscriptItem] : []),
                       ...(aiText ? [{ role: 'ai', text: aiText, timestamp: Date.now() } as TranscriptItem] : [])
                   ]);
                }
                
                currentInputRef.current = '';
                currentOutputRef.current = '';
            }
          },
          onclose: () => {
            console.log("Session Closed");
            if (connectionState === ConnectionState.CONNECTED) {
               setConnectionState(ConnectionState.DISCONNECTED);
            }
          },
          onerror: (err: any) => {
            console.error("Session Error", err);
            const msg = err.message || "Connection error occurred";
            setError(msg);
            setConnectionState(ConnectionState.ERROR);
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;
      
      // Wait for session to effectively start to catch initial connection errors
      await sessionPromise;

    } catch (err: any) {
      console.error("Connection Failed", err);
      setError(err.message || "Failed to connect to Gemini Live API");
      setConnectionState(ConnectionState.ERROR);
      // Do not disconnect immediately here to allow the user to see the error state
      // but ensure clean up of streams
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  }, [connectionState]);

  const sendVideoFrame = useCallback((base64Image: string) => {
    if (connectionState === ConnectionState.CONNECTED && sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => {
        try {
          session.sendRealtimeInput({
            media: {
              mimeType: 'image/jpeg',
              data: base64Image
            }
          });
        } catch (e) {
          console.error("Error sending video frame", e);
        }
      });
    }
  }, [connectionState]);

  return {
    connect,
    disconnect,
    connectionState,
    error,
    mediaStream: mediaStreamRef.current,
    sendVideoFrame,
    volume,
    transcript
  };
};