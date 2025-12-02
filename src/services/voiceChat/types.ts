/**
 * Типы для голосового чата
 */

// Web Speech API types
export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
}

// VAD state
export interface VADState {
  isSpeaking: boolean;
  speechStartTime: number;
  lastSoundTime: number;
  silenceStartTime: number;
  audioBuffer: Blob[];
  isBlockedByTTS: boolean;
}

// TTS Progress
export interface TTSProgress {
  startTime: number;
  text: string;
  duration: number;
  words: string[];
  currentWordIndex: number;
}

// Interim Processing State
export interface InterimProcessingState {
  lastInterimText: string;
  lastInterimTime: number;
  processingTimer: NodeJS.Timeout | null;
  maxDelayTimer: NodeJS.Timeout | null;
  lastScheduleTime: number;
}

// Orb States
export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking';

// Voice Chat State
export interface VoiceChatState {
  isRecording: boolean;
  isTranscribing: boolean;
  isGeneratingResponse: boolean;
  isSpeaking: boolean;
  isMicEnabled: boolean;
  isSoundEnabled: boolean;
  useFallbackTranscription: boolean;
}

// User Profile
export interface UserProfile {
  learning_style?: string;
  difficulty_level?: string;
  interests?: string[];
}

// Global Window Extension
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
    mozSpeechRecognition?: new () => SpeechRecognition;
    interruptionRecordingTimeout?: NodeJS.Timeout;
  }
}

