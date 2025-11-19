export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface AudioConfig {
  sampleRate: number;
}

export interface VideoConfig {
  frameRate: number;
  quality: number;
}

export interface InterviewConfig {
  targetRole: string;
  experienceLevel: string;
  companyType: string;
}

export interface TranscriptItem {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export interface FeedbackAnalysis {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
}