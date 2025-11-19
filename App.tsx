import React, { useState } from 'react';
import { useLiveInterview } from './hooks/useLiveInterview';
import InterviewSession from './components/InterviewSession';
import FeedbackCard from './components/FeedbackCard';
import { InterviewConfig, FeedbackAnalysis } from './types';
import { generateFeedback } from './utils/feedback';

type ViewState = 'setup' | 'interview' | 'loading-feedback' | 'feedback';

export default function App() {
  const [view, setView] = useState<ViewState>('setup');
  const [config, setConfig] = useState<InterviewConfig>({
    targetRole: 'Frontend Engineer',
    experienceLevel: 'Mid-Level (2-5 years)',
    companyType: 'Tech Startup',
    jobDescription: '',
    resumeText: '',
    interviewerPersona: 'Friendly & Encouraging'
  });
  const [feedback, setFeedback] = useState<FeedbackAnalysis | null>(null);

  const { 
    connect, 
    disconnect, 
    connectionState, 
    mediaStream, 
    sendVideoFrame, 
    volume, 
    aiVolume,
    error,
    transcript 
  } = useLiveInterview();

  const handleStart = async () => {
    setView('interview');
    await connect(config);
  };

  const handleEnd = async () => {
    // Capture current transcript before disconnecting
    const currentTranscript = [...transcript];
    
    disconnect();
    
    if (currentTranscript.length > 0) {
      setView('loading-feedback');
      const analysis = await generateFeedback(config, currentTranscript);
      setFeedback(analysis);
      setView('feedback');
    } else {
      // If almost no interaction happened, just go back to setup
      setView('setup');
    }
  };

  const handleRestart = () => {
    setFeedback(null);
    setView('setup');
  };

  const handleConfigChange = (field: keyof InterviewConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setConfig(prev => ({ ...prev, resumeText: text }));
    } catch (err) {
      console.error("Error reading file", err);
      alert("Could not read file. Please upload a text-based file (.txt, .md) or paste text.");
    }
  };

  if (view === 'loading-feedback') {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-4 text-center font-inter">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <h2 className="text-xl font-bold text-white mb-2">Generating Feedback...</h2>
        <p className="text-slate-400 max-w-md">Analyzing your responses, technical accuracy, and communication style. This may take a moment.</p>
      </div>
    );
  }

  if (view === 'feedback' && feedback) {
    return (
      <FeedbackCard 
        feedback={feedback} 
        onRestart={handleRestart} 
        transcript={transcript}
      />
    );
  }

  if (view === 'setup') {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 font-inter">
        <div className="w-full max-w-lg bg-[#0b1121] border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          
          {/* Subtle Top Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-2 bg-blue-500/20 blur-xl"></div>

          <h1 className="text-2xl font-bold text-white mb-6">Setup Interview</h1>

          <div className="space-y-5">
            
            {/* Target Role */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Target Role
              </label>
              <input 
                type="text"
                value={config.targetRole}
                onChange={(e) => handleConfigChange('targetRole', e.target.value)}
                className="w-full bg-[#020617] border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="e.g. Product Manager"
              />
            </div>

            {/* Experience Level */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Experience Level
              </label>
              <div className="relative">
                <select 
                  value={config.experienceLevel}
                  onChange={(e) => handleConfigChange('experienceLevel', e.target.value)}
                  className="w-full bg-[#020617] border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors appearance-none cursor-pointer"
                >
                  <option value="Intern">Intern</option>
                  <option value="Junior (0-2 years)">Junior (0-2 years)</option>
                  <option value="Mid-Level (2-5 years)">Mid-Level (2-5 years)</option>
                  <option value="Senior (5+ years)">Senior (5+ years)</option>
                  <option value="Staff / Principal">Staff / Principal</option>
                  <option value="Executive / Manager">Executive / Manager</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Company Type */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                Company Type
              </label>
              <input 
                type="text"
                value={config.companyType}
                onChange={(e) => handleConfigChange('companyType', e.target.value)}
                className="w-full bg-[#020617] border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="e.g. FAANG"
              />
            </div>

             {/* Interviewer Persona */}
             <div className="space-y-2">
              <label className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Interviewer Persona
              </label>
              <div className="relative">
                <select 
                  value={config.interviewerPersona}
                  onChange={(e) => handleConfigChange('interviewerPersona', e.target.value)}
                  className="w-full bg-[#020617] border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors appearance-none cursor-pointer"
                >
                  <option value="Friendly & Encouraging">Friendly & Encouraging (Default)</option>
                  <option value="Strict & Professional">Strict & Professional</option>
                  <option value="Technical Deep-Dive">Technical Deep-Dive</option>
                  <option value="Behavioral Specialist">Behavioral Specialist</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Context Tabs - Simple Stack */}
            <div className="space-y-4 pt-2 border-t border-slate-800">
                
                {/* Resume Upload */}
                <div className="space-y-2">
                    <label className="flex items-center justify-between text-slate-400 text-sm font-medium">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Resume Content
                        </div>
                        <div className="relative overflow-hidden">
                             <button className="text-xs bg-slate-800 hover:bg-slate-700 text-blue-400 px-2 py-1 rounded border border-slate-700 transition-colors">
                                Upload File
                             </button>
                             <input 
                                type="file" 
                                accept=".txt,.md,.json"
                                onChange={handleFileUpload}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                             />
                        </div>
                    </label>
                    <textarea 
                        value={config.resumeText}
                        onChange={(e) => handleConfigChange('resumeText', e.target.value)}
                        className="w-full bg-[#020617] border border-slate-800 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors h-24 resize-none text-sm placeholder-slate-600"
                        placeholder="Paste resume text here or upload a file..."
                    />
                </div>

                {/* Job Description */}
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Job Description <span className="text-slate-600 text-xs">(Optional)</span>
                    </label>
                    <textarea 
                        value={config.jobDescription}
                        onChange={(e) => handleConfigChange('jobDescription', e.target.value)}
                        className="w-full bg-[#020617] border border-slate-800 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors h-20 resize-none text-sm placeholder-slate-600"
                        placeholder="Paste Job Description here..."
                    />
                </div>
            </div>

            {/* Submit Button */}
            <button 
              onClick={handleStart}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3.5 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 mt-2"
            >
              Start Mock Interview
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>

            <p className="text-center text-slate-600 text-xs mt-2">
              Requires camera and microphone access.
            </p>

          </div>
        </div>
      </div>
    );
  }

  return (
    <InterviewSession
      connectionState={connectionState}
      mediaStream={mediaStream}
      sendVideoFrame={sendVideoFrame}
      onEndSession={handleEnd}
      volume={volume}
      aiVolume={aiVolume}
      error={error}
      transcript={transcript}
    />
  );
}