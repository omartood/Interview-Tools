import React from 'react';
import { FeedbackAnalysis } from '../types';

interface FeedbackCardProps {
  feedback: FeedbackAnalysis;
  onRestart: () => void;
}

const FeedbackCard: React.FC<FeedbackCardProps> = ({ feedback, onRestart }) => {
  // Determine color based on score
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 border-emerald-500/50';
    if (score >= 60) return 'text-yellow-400 border-yellow-500/50';
    return 'text-red-400 border-red-500/50';
  };

  const scoreColor = getScoreColor(feedback.score);

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 font-inter">
      <div className="w-full max-w-3xl bg-[#0b1121] border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        
        {/* Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-2 bg-blue-500/20 blur-xl"></div>

        <div className="flex flex-col md:flex-row gap-8 items-start mb-8">
            {/* Score Circle */}
            <div className="flex-shrink-0 mx-auto md:mx-0">
                <div className={`w-32 h-32 rounded-full border-4 ${scoreColor} flex items-center justify-center bg-slate-900/50 shadow-[0_0_30px_rgba(0,0,0,0.3)]`}>
                    <div className="text-center">
                        <span className={`text-4xl font-bold ${scoreColor.split(' ')[0]}`}>{feedback.score}</span>
                        <span className="block text-slate-500 text-xs uppercase tracking-wider mt-1">Score</span>
                    </div>
                </div>
            </div>

            {/* Summary */}
            <div className="flex-1 text-center md:text-left">
                <h2 className="text-2xl font-bold text-white mb-2">Interview Evaluation</h2>
                <p className="text-slate-300 leading-relaxed">{feedback.summary}</p>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Strengths */}
            <div className="bg-emerald-900/10 border border-emerald-900/30 rounded-xl p-5">
                <h3 className="flex items-center gap-2 text-emerald-400 font-semibold mb-4">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Key Strengths
                </h3>
                <ul className="space-y-3">
                    {feedback.strengths.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-slate-300 text-sm">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                            {item}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Improvements */}
            <div className="bg-amber-900/10 border border-amber-900/30 rounded-xl p-5">
                <h3 className="flex items-center gap-2 text-amber-400 font-semibold mb-4">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Areas for Improvement
                </h3>
                <ul className="space-y-3">
                    {feedback.improvements.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-slate-300 text-sm">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>
                            {item}
                        </li>
                    ))}
                </ul>
            </div>
        </div>

        <button 
            onClick={onRestart}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-3.5 rounded-lg transition-all border border-slate-700 flex items-center justify-center gap-2"
        >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Start New Interview
        </button>

      </div>
    </div>
  );
};

export default FeedbackCard;