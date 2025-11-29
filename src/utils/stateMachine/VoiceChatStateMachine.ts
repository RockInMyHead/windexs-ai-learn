/**
 * Voice Chat State Machine
 * Manages complex voice chat states and transitions
 */

export type VoiceChatState =
  | 'idle'                    // Начальное состояние, ничего не происходит
  | 'initializing'           // Инициализация компонентов
  | 'listening'              // Прослушивание речи пользователя
  | 'processing_speech'      // Обработка речи (транскрибация)
  | 'generating_response'    // Генерация ответа AI
  | 'speaking'               // Воспроизведение ответа
  | 'error'                  // Состояние ошибки
  | 'call_active'            // Активный видеозвонок
  | 'call_connecting'        // Подключение к звонку
  | 'call_ended';            // Звонок завершен

export interface VoiceChatContext {
  // Speech Recognition
  isRecording: boolean;
  isTranscribing: boolean;
  transcript: string;
  lastTranscript: string;

  // AI Response Generation
  isGeneratingResponse: boolean;
  currentResponse: string;

  // TTS
  isSpeaking: boolean;
  isPlayingAudio: boolean;
  audioQueue: ArrayBuffer[];
  ttsProgress: TTSProgress | null;

  // Audio Context & Analysis
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  microphoneSource: MediaStreamAudioSourceNode | null;

  // Media Recording (fallback)
  isMediaRecording: boolean;
  mediaRecorder: MediaRecorder | null;
  audioChunks: Blob[];
  mediaStream: MediaStream | null;

  // User Settings
  isMicEnabled: boolean;
  isSoundEnabled: boolean;
  useFallbackTranscription: boolean;

  // Call State
  activeCallId: string | null;
  callParticipants: string[];

  // Error Handling
  error: VoiceChatError | null;
  retryCount: number;

  // Generation tracking
  generationId: number;
}

export interface TTSProgress {
  startTime: number;
  text: string;
  duration: number;
  words: string[];
  currentWordIndex: number;
}

export interface VoiceChatError {
  code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
  context?: any;
}

export type VoiceChatEvent =
  | 'start_listening'
  | 'speech_detected'
  | 'speech_ended'
  | 'transcript_received'
  | 'response_generated'
  | 'start_speaking'
  | 'speech_completed'
  | 'error_occurred'
  | 'call_started'
  | 'call_ended'
  | 'mic_toggled'
  | 'sound_toggled'
  | 'reset';

export class VoiceChatStateMachine {
  private currentState: VoiceChatState = 'idle';
  private context: VoiceChatContext;
  private listeners: Map<VoiceChatEvent, Set<(data?: any) => void>> = new Map();
  private transitionHistory: Array<{
    from: VoiceChatState;
    to: VoiceChatState;
    event: VoiceChatEvent;
    timestamp: number;
    context: Partial<VoiceChatContext>;
  }> = [];

  constructor(initialContext?: Partial<VoiceChatContext>) {
    this.context = {
      // Speech Recognition
      isRecording: false,
      isTranscribing: false,
      transcript: '',
      lastTranscript: '',

      // AI Response Generation
      isGeneratingResponse: false,
      currentResponse: '',

      // TTS
      isSpeaking: false,
      isPlayingAudio: false,
      audioQueue: [],
      ttsProgress: null,

      // Audio Context & Analysis
      audioContext: null,
      analyser: null,
      microphoneSource: null,

      // Media Recording (fallback)
      isMediaRecording: false,
      mediaRecorder: null,
      audioChunks: [],
      mediaStream: null,

      // User Settings
      isMicEnabled: true,
      isSoundEnabled: true,
      useFallbackTranscription: false,

      // Call State
      activeCallId: null,
      callParticipants: [],

      // Error Handling
      error: null,
      retryCount: 0,

      // Generation tracking
      generationId: 0,

      ...initialContext
    };
  }

  /**
   * Get current state
   */
  getState(): VoiceChatState {
    return this.currentState;
  }

  /**
   * Get current context
   */
  getContext(): VoiceChatContext {
    return { ...this.context };
  }

  /**
   * Check if transition is valid
   */
  canTransition(event: VoiceChatEvent): boolean {
    const validTransitions = this.getValidTransitions(this.currentState);
    return validTransitions.includes(event);
  }

  /**
   * Transition to new state
   */
  transition(event: VoiceChatEvent, data?: Partial<VoiceChatContext>): boolean {
    if (!this.canTransition(event)) {
      console.warn(`Invalid transition: ${this.currentState} -> ${event}`);
      return false;
    }

    const newState = this.calculateNewState(event);
    const oldState = this.currentState;

    // Update context
    if (data) {
      this.context = { ...this.context, ...data };
    }

    // Perform state-specific actions
    this.performStateActions(oldState, newState, event);

    // Update state
    this.currentState = newState;

    // Record transition
    this.transitionHistory.push({
      from: oldState,
      to: newState,
      event,
      timestamp: Date.now(),
      context: data || {}
    });

    // Notify listeners
    this.notifyListeners(event, { oldState, newState, context: this.context });

    console.log(`🎯 State transition: ${oldState} -> ${newState} (${event})`);

    return true;
  }

  /**
   * Subscribe to state change events
   */
  on(event: VoiceChatEvent, listener: (data?: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)!.add(listener);

    return () => {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(listener);
      }
    };
  }

  /**
   * Force reset to idle state
   */
  reset(): void {
    this.transition('reset', {
      isRecording: false,
      isTranscribing: false,
      isGeneratingResponse: false,
      isSpeaking: false,
      isPlayingAudio: false,
      transcript: '',
      currentResponse: '',
      audioQueue: [],
      ttsProgress: null,
      error: null,
      retryCount: 0,
      activeCallId: null,
      callParticipants: []
    });
  }

  /**
   * Get transition history for debugging
   */
  getTransitionHistory(): typeof this.transitionHistory {
    return [...this.transitionHistory];
  }

  /**
   * Validate current state integrity
   */
  validateState(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check state-specific invariants
    switch (this.currentState) {
      case 'listening':
        if (!this.context.isRecording) {
          issues.push('Listening state requires isRecording=true');
        }
        break;

      case 'processing_speech':
        if (!this.context.isTranscribing && !this.context.isMediaRecording) {
          issues.push('Processing state requires active transcription or recording');
        }
        break;

      case 'speaking':
        if (!this.context.isSpeaking && !this.context.isPlayingAudio) {
          issues.push('Speaking state requires active audio playback');
        }
        break;

      case 'call_active':
        if (!this.context.activeCallId || this.context.callParticipants.length === 0) {
          issues.push('Call active state requires call ID and participants');
        }
        break;
    }

    return { valid: issues.length === 0, issues };
  }

  // Private methods

  private getValidTransitions(state: VoiceChatState): VoiceChatEvent[] {
    const transitions: Record<VoiceChatState, VoiceChatEvent[]> = {
      idle: ['start_listening', 'call_started', 'error_occurred'],
      initializing: ['start_listening', 'error_occurred'],
      listening: ['speech_detected', 'speech_ended', 'error_occurred', 'mic_toggled'],
      processing_speech: ['transcript_received', 'error_occurred'],
      generating_response: ['response_generated', 'error_occurred'],
      speaking: ['speech_completed', 'start_listening', 'error_occurred', 'sound_toggled'],
      error: ['reset'],
      call_active: ['call_ended', 'start_listening', 'error_occurred'],
      call_connecting: ['call_started', 'call_ended', 'error_occurred'],
      call_ended: ['idle', 'call_started']
    };

    return transitions[state] || [];
  }

  private calculateNewState(event: VoiceChatEvent): VoiceChatState {
    const stateMap: Record<VoiceChatEvent, VoiceChatState> = {
      start_listening: 'listening',
      speech_detected: 'processing_speech',
      transcript_received: 'generating_response',
      response_generated: 'speaking',
      speech_completed: 'idle',
      start_speaking: 'speaking',
      error_occurred: 'error',
      call_started: 'call_active',
      call_ended: 'call_ended',
      reset: 'idle',
      speech_ended: 'processing_speech',
      mic_toggled: 'listening',
      sound_toggled: 'speaking'
    };

    return stateMap[event] || this.currentState;
  }

  private performStateActions(oldState: VoiceChatState, newState: VoiceChatState, event: VoiceChatEvent): void {
    // Cleanup actions for leaving states
    switch (oldState) {
      case 'listening':
        this.context.isRecording = false;
        break;

      case 'processing_speech':
        this.context.isTranscribing = false;
        this.context.isMediaRecording = false;
        break;

      case 'generating_response':
        this.context.isGeneratingResponse = false;
        break;

      case 'speaking':
        this.context.isSpeaking = false;
        this.context.isPlayingAudio = false;
        this.context.ttsProgress = null;
        break;
    }

    // Setup actions for entering states
    switch (newState) {
      case 'listening':
        this.context.isRecording = true;
        this.context.transcript = '';
        break;

      case 'processing_speech':
        if (event === 'speech_detected') {
          this.context.isTranscribing = true;
        }
        break;

      case 'generating_response':
        this.context.isGeneratingResponse = true;
        this.context.generationId++;
        break;

      case 'speaking':
        this.context.isSpeaking = true;
        this.context.isPlayingAudio = true;
        break;

      case 'idle':
        // Full cleanup
        this.context.isRecording = false;
        this.context.isTranscribing = false;
        this.context.isGeneratingResponse = false;
        this.context.isSpeaking = false;
        this.context.isPlayingAudio = false;
        this.context.error = null;
        this.context.retryCount = 0;
        break;
    }
  }

  private notifyListeners(event: VoiceChatEvent, data: any): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }
}
