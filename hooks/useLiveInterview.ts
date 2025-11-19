import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState, InterviewConfig, TranscriptItem } from '../types';
import { createPcmBlob, decode, decodeAudioData } from '../utils/audio';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const TRANSCRIPT_STORAGE_KEY = 'interview_transcript_backup';

export const useLiveInterview = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(0); // User Mic Volume
  const [aiVolume, setAiVolume] = useState<number>(0); // AI Output Volume
  const [transcript, setTranscript] = useState<TranscriptItem[]>(() => {
    // Initialize from local storage if available
    try {
      const saved = localStorage.getItem(TRANSCRIPT_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputAnalyzerRef = useRef<AnalyserNode | null>(null);
  
  const nextStartTimeRef = useRef<number>(0);
  const scheduledSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const aiVolumeIntervalRef = useRef<number | null>(null);
  
  // Transcription accumulation refs
  const currentInputRef = useRef('');
  const currentOutputRef = useRef('');

  // Persist transcript changes to local storage
  useEffect(() => {
    localStorage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify(transcript));
  }, [transcript]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting session...');
    
    if (aiVolumeIntervalRef.current) {
      window.clearInterval(aiVolumeIntervalRef.current);
      aiVolumeIntervalRef.current = null;
    }

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
    setAiVolume(0);
  }, []);

  const connect = useCallback(async (config: InterviewConfig) => {
    // Prevent multiple connections
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) return;

    try {
      setConnectionState(ConnectionState.CONNECTING);
      setError(null);
      setTranscript([]); // Clear previous transcript for new session
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

      // Setup Output Analyzer for AI Volume
      const analyzer = outputAudioContextRef.current.createAnalyser();
      analyzer.fftSize = 256;
      outputAnalyzerRef.current = analyzer;

      // Start AI Volume polling
      aiVolumeIntervalRef.current = window.setInterval(() => {
        if (outputAnalyzerRef.current) {
          const dataArray = new Uint8Array(outputAnalyzerRef.current.frequencyBinCount);
          outputAnalyzerRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (const a of dataArray) sum += a * a;
          const rms = Math.sqrt(sum / dataArray.length) / 255;
          // Amplify slightly for better visual
          setAiVolume(Math.min(rms * 3, 1)); 
        }
      }, 100);

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
      const jdString = config.jobDescription 
        ? `\n[Specific Job Context/Requirements]:\n${config.jobDescription}` 
        : '';
      
      const resumeString = config.resumeText 
        ? `\n[Candidate Resume/Background]:\n${config.resumeText}\nUse this resume to ask specific questions about their past experience and projects.` 
        : '';

      // Map persona to specific behavioral instructions
      let personaInstructions = "";
      switch (config.interviewerPersona) {
        case "Strict & Professional":
          personaInstructions = "You are a strict, formal, and no-nonsense interviewer. Focus on accuracy, efficiency, and technical depth. Do not give hints easily. Challenge the candidate's assumptions. Keep a neutral, professional tone.";
          break;
        case "Technical Deep-Dive":
          personaInstructions = "You are a Senior Principal Engineer. Focus heavily on system internals, scalability, edge cases, and optimization. Ask 'why' repeatedly to probe depth of understanding. Use technical jargon appropriate for the role.";
          break;
        case "Behavioral Specialist":
          personaInstructions = "You are an HR Manager focused on culture fit and soft skills. Focus on team dynamics, conflict resolution, and communication. Use the STAR method framework to evaluate answers. Be empathetic but probing.";
          break;
        case "Friendly & Encouraging":
        default:
          personaInstructions = "You are a friendly, supportive, and encouraging interviewer. Create a low-stress environment to help the candidate perform their best. If they struggle, offer small hints or reframe the question. Be warm and conversational.";
          break;
      }

      const systemInstructionText = `
      You are an expert Technical Recruiter and Senior Engineer at a ${config.companyType}.
      You are conducting a behavioral and technical interview for a ${config.targetRole} position.
      The candidate is at a ${config.experienceLevel} level.
      
      ${jdString}
      ${resumeString}

      [Interviewer Persona]:
      ${personaInstructions}

      Your goal is to assess the candidate's soft skills, problem-solving abilities, and technical knowledge suitable for a ${config.experienceLevel} ${config.targetRole}, while strictly adhering to your assigned persona.

      Protocol:
      1. Start by welcoming the candidate to the interview for the ${config.targetRole} position at your ${config.companyType}.
      2. If a resume is provided, reference a specific detail from it in your opening or first question to show you've read it (e.g., "I see you worked on X...").
      3. Ask one relevant follow-up or new question at a time.
      4. If the user answers well, acknowledge it according to your persona and move to the next deeper question.
      5. Keep your responses concise and conversational (under 4 sentences usually) to maintain a natural flow.
      6. Maintain the tone defined by your persona (e.g., strict vs friendly) throughout the session.
      7. Speak clearly and with a measured pace. Use distinct, natural pauses between sentences to ensure the candidate can process the questions effectively.
      `;
      
      // 5. Start Session
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
              
              // User Volume calculation
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
                
                // Connect to Analyzer (for visualization) then Destination (for hearing)
                if (outputAnalyzerRef.current) {
                  source.connect(outputAnalyzerRef.current);
                  outputAnalyzerRef.current.connect(ctx.destination);
                } else {
                  source.connect(ctx.destination);
                }
                
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
            // Only update state if we are not already disconnected to avoid race conditions
            setConnectionState(prev => {
               if (prev === ConnectionState.CONNECTED || prev === ConnectionState.CONNECTING) {
                 return ConnectionState.DISCONNECTED;
               }
               return prev;
            });
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
      
      // Wait for session to effectively start
      await sessionPromise;

    } catch (err: any) {
      console.error("Connection Failed", err);
      setError(err.message || "Failed to connect to Gemini Live API");
      setConnectionState(ConnectionState.ERROR);
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
    aiVolume,
    transcript
  };
};