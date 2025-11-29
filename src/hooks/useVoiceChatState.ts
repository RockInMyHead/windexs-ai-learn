/**
 * Voice Chat State Hook
 * React hook for managing voice chat state machine
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { VoiceChatStateMachine, VoiceChatState, VoiceChatContext, VoiceChatEvent, VoiceChatError } from '@/utils/stateMachine/VoiceChatStateMachine';

interface UseVoiceChatStateReturn {
  // Current state
  state: VoiceChatState;
  context: VoiceChatContext;

  // State transitions
  startListening: () => boolean;
  speechDetected: (transcript?: string) => boolean;
  speechEnded: () => boolean;
  transcriptReceived: (transcript: string) => boolean;
  responseGenerated: (response: string) => boolean;
  startSpeaking: (text: string, duration: number) => boolean;
  speechCompleted: () => boolean;
  setError: (error: VoiceChatError) => boolean;
  toggleMic: (enabled: boolean) => boolean;
  toggleSound: (enabled: boolean) => boolean;
  startCall: (callId: string, participants: string[]) => boolean;
  endCall: () => boolean;
  reset: () => boolean;

  // State checks
  canStartListening: boolean;
  canProcessSpeech: boolean;
  canGenerateResponse: boolean;
  canSpeak: boolean;
  isInError: boolean;
  isInCall: boolean;

  // Context updates
  updateContext: (updates: Partial<VoiceChatContext>) => void;

  // Event subscription
  onStateChange: (listener: (data: { oldState: VoiceChatState; newState: VoiceChatState; context: VoiceChatContext }) => void) => () => void;
  onEvent: (event: VoiceChatEvent, listener: (data?: any) => void) => () => void;

  // Validation
  validateState: () => { valid: boolean; issues: string[] };

  // Debug
  getTransitionHistory: () => Array<{
    from: VoiceChatState;
    to: VoiceChatState;
    event: VoiceChatEvent;
    timestamp: number;
    context: Partial<VoiceChatContext>;
  }>;
}

export function useVoiceChatState(initialContext?: Partial<VoiceChatContext>): UseVoiceChatStateReturn {
  const stateMachineRef = useRef<VoiceChatStateMachine>(
    new VoiceChatStateMachine(initialContext)
  );

  const [state, setState] = useState<VoiceChatState>(stateMachineRef.current.getState());
  const [context, setContext] = useState<VoiceChatContext>(stateMachineRef.current.getContext());

  // Update local state when state machine changes
  useEffect(() => {
    const unsubscribe = stateMachineRef.current.on('start_listening' as VoiceChatEvent, updateLocalState);
    const unsubscribe2 = stateMachineRef.current.on('speech_detected' as VoiceChatEvent, updateLocalState);
    const unsubscribe3 = stateMachineRef.current.on('speech_ended' as VoiceChatEvent, updateLocalState);
    const unsubscribe4 = stateMachineRef.current.on('transcript_received' as VoiceChatEvent, updateLocalState);
    const unsubscribe5 = stateMachineRef.current.on('response_generated' as VoiceChatEvent, updateLocalState);
    const unsubscribe6 = stateMachineRef.current.on('start_speaking' as VoiceChatEvent, updateLocalState);
    const unsubscribe7 = stateMachineRef.current.on('speech_completed' as VoiceChatEvent, updateLocalState);
    const unsubscribe8 = stateMachineRef.current.on('error_occurred' as VoiceChatEvent, updateLocalState);
    const unsubscribe9 = stateMachineRef.current.on('call_started' as VoiceChatEvent, updateLocalState);
    const unsubscribe10 = stateMachineRef.current.on('call_ended' as VoiceChatEvent, updateLocalState);
    const unsubscribe11 = stateMachineRef.current.on('mic_toggled' as VoiceChatEvent, updateLocalState);
    const unsubscribe12 = stateMachineRef.current.on('sound_toggled' as VoiceChatEvent, updateLocalState);
    const unsubscribe13 = stateMachineRef.current.on('reset' as VoiceChatEvent, updateLocalState);

    return () => {
      unsubscribe();
      unsubscribe2();
      unsubscribe3();
      unsubscribe4();
      unsubscribe5();
      unsubscribe6();
      unsubscribe7();
      unsubscribe8();
      unsubscribe9();
      unsubscribe10();
      unsubscribe11();
      unsubscribe12();
      unsubscribe13();
    };
  }, []);

  const updateLocalState = useCallback(() => {
    setState(stateMachineRef.current.getState());
    setContext(stateMachineRef.current.getContext());
  }, []);

  // Transition methods
  const startListening = useCallback((): boolean => {
    return stateMachineRef.current.transition('start_listening');
  }, []);

  const speechDetected = useCallback((transcript = ''): boolean => {
    return stateMachineRef.current.transition('speech_detected', {
      transcript,
      isTranscribing: true
    });
  }, []);

  const speechEnded = useCallback((): boolean => {
    return stateMachineRef.current.transition('speech_ended');
  }, []);

  const transcriptReceived = useCallback((transcript: string): boolean => {
    return stateMachineRef.current.transition('transcript_received', {
      transcript,
      lastTranscript: transcript,
      isTranscribing: false
    });
  }, []);

  const responseGenerated = useCallback((response: string): boolean => {
    return stateMachineRef.current.transition('response_generated', {
      currentResponse: response,
      isGeneratingResponse: false
    });
  }, []);

  const startSpeaking = useCallback((text: string, duration: number): boolean => {
    const words = text.split(' ');
    return stateMachineRef.current.transition('start_speaking', {
      ttsProgress: {
        startTime: Date.now(),
        text,
        duration,
        words,
        currentWordIndex: 0
      }
    });
  }, []);

  const speechCompleted = useCallback((): boolean => {
    return stateMachineRef.current.transition('speech_completed', {
      isSpeaking: false,
      isPlayingAudio: false,
      ttsProgress: null
    });
  }, []);

  const setError = useCallback((error: VoiceChatError): boolean => {
    return stateMachineRef.current.transition('error_occurred', {
      error,
      retryCount: context.retryCount + 1
    });
  }, [context.retryCount]);

  const toggleMic = useCallback((enabled: boolean): boolean => {
    return stateMachineRef.current.transition('mic_toggled', {
      isMicEnabled: enabled
    });
  }, []);

  const toggleSound = useCallback((enabled: boolean): boolean => {
    return stateMachineRef.current.transition('sound_toggled', {
      isSoundEnabled: enabled
    });
  }, []);

  const startCall = useCallback((callId: string, participants: string[]): boolean => {
    return stateMachineRef.current.transition('call_started', {
      activeCallId: callId,
      callParticipants: participants
    });
  }, []);

  const endCall = useCallback((): boolean => {
    return stateMachineRef.current.transition('call_ended', {
      activeCallId: null,
      callParticipants: []
    });
  }, []);

  const reset = useCallback((): boolean => {
    return stateMachineRef.current.transition('reset');
  }, []);

  // Context updates
  const updateContext = useCallback((updates: Partial<VoiceChatContext>) => {
    // Direct context update without state transition
    const currentContext = stateMachineRef.current.getContext();
    const newContext = { ...currentContext, ...updates };

    // Update the state machine's context directly
    (stateMachineRef.current as any).context = newContext;

    // Update local state
    setContext(newContext);
  }, []);

  // Event subscription
  const onStateChange = useCallback((listener: (data: any) => void) => {
    // Subscribe to all state change events
    const unsubscribers = [
      stateMachineRef.current.on('start_listening' as VoiceChatEvent, listener),
      stateMachineRef.current.on('speech_detected' as VoiceChatEvent, listener),
      stateMachineRef.current.on('speech_ended' as VoiceChatEvent, listener),
      stateMachineRef.current.on('transcript_received' as VoiceChatEvent, listener),
      stateMachineRef.current.on('response_generated' as VoiceChatEvent, listener),
      stateMachineRef.current.on('start_speaking' as VoiceChatEvent, listener),
      stateMachineRef.current.on('speech_completed' as VoiceChatEvent, listener),
      stateMachineRef.current.on('error_occurred' as VoiceChatEvent, listener),
      stateMachineRef.current.on('call_started' as VoiceChatEvent, listener),
      stateMachineRef.current.on('call_ended' as VoiceChatEvent, listener),
      stateMachineRef.current.on('mic_toggled' as VoiceChatEvent, listener),
      stateMachineRef.current.on('sound_toggled' as VoiceChatEvent, listener),
      stateMachineRef.current.on('reset' as VoiceChatEvent, listener)
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, []);

  const onEvent = useCallback((event: VoiceChatEvent, listener: (data?: any) => void) => {
    return stateMachineRef.current.on(event, listener);
  }, []);

  // Computed state checks
  const canStartListening = ['idle', 'speaking', 'call_active'].includes(state);
  const canProcessSpeech = state === 'listening';
  const canGenerateResponse = state === 'processing_speech';
  const canSpeak = state === 'generating_response';
  const isInError = state === 'error';
  const isInCall = ['call_active', 'call_connecting'].includes(state);

  const validateState = useCallback(() => {
    return stateMachineRef.current.validateState();
  }, []);

  const getTransitionHistory = useCallback(() => {
    return stateMachineRef.current.getTransitionHistory();
  }, []);

  return {
    // Current state
    state,
    context,

    // State transitions
    startListening,
    speechDetected,
    speechEnded,
    transcriptReceived,
    responseGenerated,
    startSpeaking,
    speechCompleted,
    setError,
    toggleMic,
    toggleSound,
    startCall,
    endCall,
    reset,

    // State checks
    canStartListening,
    canProcessSpeech,
    canGenerateResponse,
    canSpeak,
    isInError,
    isInCall,

    // Context updates
    updateContext,

    // Event subscription
    onStateChange,
    onEvent,

    // Validation
    validateState,

    // Debug
    getTransitionHistory
  };
}
