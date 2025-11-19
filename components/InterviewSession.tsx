import React, { useEffect, useRef, useState } from 'react';
import { ConnectionState } from '../types';
import AudioVisualizer from './AudioVisualizer';

interface InterviewSessionProps {
  connectionState: ConnectionState;
  mediaStream: MediaStream | null;
  sendVideoFrame: (base64: string) => void;
  onEndSession: () => void;
  volume: number;
  error: string | null;
}

const InterviewSession: React.FC<InterviewSessionProps> = ({
  connectionState,
  mediaStream,
  sendVideoFrame,
  onEndSession,
  volume,
  error
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);

  // Timer logic
  useEffect(() => {
    let interval: number;
    if (connectionState === ConnectionState.CONNECTED) {
      interval = window.setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [connectionState]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle Video Stream display
  useEffect(() => {
    if (videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream;
    }
  }, [mediaStream]);

  // Toggle Mute
  useEffect(() => {
    if (mediaStream) {
      mediaStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted, mediaStream]);

  // Frame Extraction Loop for Video Stream to API
  useEffect(() => {
    if (connectionState !== ConnectionState.CONNECTED) return;
    
    let intervalId: number;
    const FPS = 5; // 5 frames per second for smoother visual context

    const captureFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (video && canvas) {
        // Use a reasonable resolution for the model
        const scale = 0.5;
        canvas.width = video.videoWidth * scale || 640;
        canvas.height = video.videoHeight * scale || 480;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          // Send as JPEG
          const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
          sendVideoFrame(base64);
        }
      }
    };

    intervalId = window.setInterval(captureFrame, 1000 / FPS);

    return () => clearInterval(intervalId);
  }, [connectionState, sendVideoFrame]);

  // Helper for status visual configuration
  const getStatusConfig = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTED:
        return {
          pillClass: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
          dotClass: 'bg-emerald-500',
          animation: 'animate-pulse',
          text: 'Live',
          avatarBorder: 'border-emerald-500'
        };
      case ConnectionState.CONNECTING:
        return {
          pillClass: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
          dotClass: 'bg-blue-500',
          animation: 'animate-ping',
          text: 'Connecting...',
          avatarBorder: 'border-blue-500'
        };
      case ConnectionState.ERROR:
        return {
          pillClass: 'bg-red-500/10 border-red-500/20 text-red-400',
          dotClass: 'bg-red-500',
          animation: '',
          text: 'Error',
          avatarBorder: 'border-red-500'
        };
      default:
        return {
          pillClass: 'bg-slate-500/10 border-slate-500/20 text-slate-400',
          dotClass: 'bg-slate-500',
          animation: '',
          text: 'Disconnected',
          avatarBorder: 'border-slate-500'
        };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4 font-inter">
      {/* Header */}
      <div className="w-full max-w-5xl flex justify-between items-center mb-6">
        
        {/* Left: Status Pill */}
        <div className="flex-1 flex justify-start">
          <div className={`flex items-center gap-3 px-4 py-2 rounded-full border transition-all duration-300 ${statusConfig.pillClass}`}>
              <div className="relative flex h-2.5 w-2.5">
                {(connectionState === ConnectionState.CONNECTING || connectionState === ConnectionState.CONNECTED) && (
                   <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${statusConfig.dotClass} ${statusConfig.animation}`}></span>
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusConfig.dotClass}`}></span>
              </div>
              <span className="font-medium text-sm tracking-wide">
                {statusConfig.text}
              </span>
          </div>
        </div>

        {/* Center: Timer */}
        <div className="flex-1 flex justify-center">
          <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 px-5 py-2 rounded-lg shadow-sm">
             <span className="font-mono text-slate-200 text-lg font-medium tracking-widest">
               {formatDuration(duration)}
             </span>
          </div>
        </div>

        {/* Right: End Button */}
        <div className="flex-1 flex justify-end">
          <button 
            onClick={onEndSession}
            className={`px-4 py-2 rounded-lg text-sm transition-all font-medium border ${connectionState === ConnectionState.ERROR ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700' : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30'}`}
          >
            {connectionState === ConnectionState.ERROR ? 'Back to Setup' : 'End Interview'}
          </button>
        </div>
      </div>

      {/* Error Message Banner */}
      {error && (
        <div className="w-full max-w-5xl mb-4 p-4 bg-red-900/20 border border-red-800 rounded-xl flex items-center gap-3 text-red-200 animate-in fade-in slide-in-from-top-2">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl h-[70vh]">
        
        {/* Video Feed (Left/Center) */}
        <div className="md:col-span-2 relative bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl ring-1 ring-white/5">
            <video 
                ref={videoRef}
                autoPlay
                playsInline
                muted // Locally muted to prevent echo
                className="w-full h-full object-cover transform scale-x-[-1]" 
            />
            
            {/* User Label */}
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10 shadow-lg">
                <div className={`w-2 h-2 rounded-full ${isMuted ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                <span className="text-xs text-white font-medium">You (Candidate)</span>
                {isMuted && (
                  <svg className="w-3 h-3 text-white/70 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" crossOrigin="anonymous"/>
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                )}
            </div>

            <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* AI Interface (Right) */}
        <div className="md:col-span-1 flex flex-col gap-4 h-full">
            
            {/* AI Avatar Card */}
            <div className="flex-1 bg-slate-800/40 rounded-2xl border border-slate-700/50 flex flex-col items-center justify-center p-6 relative overflow-hidden backdrop-blur-sm">
                {/* Background pulsing effect */}
                <div className={`absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-purple-500/5 transition-opacity duration-500 ${connectionState === ConnectionState.CONNECTED ? 'opacity-100' : 'opacity-30'}`}></div>
                
                <div className="relative z-10 flex flex-col items-center">
                  {/* Avatar Circle */}
                  <div className="relative mb-6">
                    <div className={`w-28 h-28 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-2xl transition-all duration-500 ${connectionState === ConnectionState.CONNECTED ? 'scale-100 ring-4 ring-indigo-500/20' : 'scale-95 opacity-80 grayscale'}`}>
                        <svg className="w-14 h-14 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    
                    {/* Status Indicator on Avatar */}
                    <div className={`absolute bottom-1 right-1 w-7 h-7 rounded-full border-4 border-slate-800 flex items-center justify-center bg-slate-900`}>
                         <div className={`w-full h-full rounded-full ${statusConfig.dotClass} ${connectionState === ConnectionState.CONNECTING ? 'animate-ping opacity-75' : ''}`}></div>
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-bold text-white tracking-tight">Interviewer</h3>
                  
                  {/* Dynamic Status Text */}
                  <p className={`text-sm text-center mt-2 px-4 font-medium transition-colors duration-300 ${connectionState === ConnectionState.ERROR ? 'text-red-400' : 'text-slate-400'}`}>
                      {connectionState === ConnectionState.CONNECTED ? "Listening..." : 
                       connectionState === ConnectionState.CONNECTING ? "Connecting..." : 
                       connectionState === ConnectionState.ERROR ? "Connection Failed" :
                       "Waiting to start"}
                  </p>
                </div>

                {/* Volume Visualizer */}
                <div className="mt-auto h-16 w-full flex items-center justify-center z-10">
                    <AudioVisualizer volume={volume} isActive={connectionState === ConnectionState.CONNECTED} />
                </div>
            </div>

            {/* Controls */}
            <div className="bg-slate-800/40 rounded-2xl border border-slate-700/50 p-4 flex justify-center gap-4 backdrop-blur-sm">
                <button 
                    onClick={() => setIsMuted(!isMuted)}
                    disabled={connectionState !== ConnectionState.CONNECTED}
                    className={`p-4 rounded-full transition-all duration-200 shadow-lg ${isMuted ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30' : 'bg-slate-700 text-white hover:bg-slate-600 border border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                    title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                >
                    {isMuted ? (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth={2} />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default InterviewSession;