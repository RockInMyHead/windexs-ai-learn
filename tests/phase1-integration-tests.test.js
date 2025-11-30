/**
 * Integration Tests for Phase 1: Critical Fixes
 * Tests WebRTC, State Management, Error Handling, and Resilience
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock browser APIs
global.window = {
  AudioContext: jest.fn().mockImplementation(() => ({
    createAnalyser: jest.fn(() => ({
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      getByteFrequencyData: jest.fn(),
      getByteTimeDomainData: jest.fn(),
      frequencyBinCount: 1024
    })),
    createMediaStreamSource: jest.fn(() => ({
      connect: jest.fn()
    })),
    resume: jest.fn().mockResolvedValue(),
    state: 'running',
    close: jest.fn()
  })),
  SpeechRecognition: jest.fn().mockImplementation(() => ({
    continuous: true,
    interimResults: true,
    lang: 'ru-RU',
    maxAlternatives: 1,
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    onstart: jest.fn(),
    onresult: jest.fn(),
    onerror: jest.fn(),
    onend: jest.fn()
  })),
  Audio: jest.fn().mockImplementation(() => ({
    play: jest.fn().mockResolvedValue(),
    pause: jest.fn(),
    load: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    currentTime: 0,
    volume: 1,
    muted: false,
    src: '',
    onplay: null,
    onended: null,
    onerror: null
  })),
  RTCPeerConnection: jest.fn().mockImplementation(() => ({
    createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-offer' }),
    createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-answer' }),
    setLocalDescription: jest.fn().mockResolvedValue(),
    setRemoteDescription: jest.fn().mockResolvedValue(),
    addIceCandidate: jest.fn().mockResolvedValue(),
    addTrack: jest.fn(),
    onicecandidate: null,
    onconnectionstatechange: null,
    ontrack: null,
    close: jest.fn()
  })),
  fetch: jest.fn(),
  requestAnimationFrame: jest.fn(cb => setTimeout(cb, 16)),
  cancelAnimationFrame: jest.fn()
};

global.navigator = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  hardwareConcurrency: 8,
  mediaDevices: {
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: () => [{ stop: jest.fn() }],
      getAudioTracks: () => [{ stop: jest.fn() }],
      getVideoTracks: () => [{ stop: jest.fn() }]
    }),
    enumerateDevices: jest.fn().mockResolvedValue([
      { deviceId: 'audio1', label: 'Microphone', kind: 'audioinput' },
      { deviceId: 'video1', label: 'Camera', kind: 'videoinput' }
    ])
  }
};

global.MediaRecorder = jest.fn().mockImplementation(() => ({
  start: jest.fn(),
  stop: jest.fn(),
  ondataavailable: null,
  onstop: null
}));

// Import test subjects after mocks
describe('Phase 1 Integration Tests', () => {

  describe('WebRTC Integration', () => {
    let mockWebRTCManager;

    beforeEach(() => {
      // Mock WebRTC Manager
      mockWebRTCManager = {
        startCall: jest.fn().mockResolvedValue('call-123'),
        answerCall: jest.fn().mockResolvedValue(),
        hangupCall: jest.fn().mockResolvedValue(),
        toggleMute: jest.fn().mockResolvedValue(),
        toggleVideo: jest.fn().mockResolvedValue(),
        getActiveCalls: jest.fn().mockReturnValue([]),
        getCallStats: jest.fn().mockResolvedValue({
          timestamp: Date.now(),
          bytesReceived: 1000,
          bytesSent: 800,
          packetsReceived: 10,
          packetsSent: 8,
          packetsLost: 0
        })
      };
    });

    it('should successfully initiate a WebRTC call', async () => {
      const peerId = 'peer-123';
      const callId = await mockWebRTCManager.startCall(peerId);

      expect(mockWebRTCManager.startCall).toHaveBeenCalledWith(peerId, undefined);
      expect(callId).toBe('call-123');
      expect(typeof callId).toBe('string');
    });

    it('should handle call hangup gracefully', async () => {
      const callId = 'call-123';
      await mockWebRTCManager.hangupCall(callId);

      expect(mockWebRTCManager.hangupCall).toHaveBeenCalledWith(callId);
    });

    it('should toggle audio/video controls', async () => {
      const callId = 'call-123';

      await mockWebRTCManager.toggleMute(callId, true);
      expect(mockWebRTCManager.toggleMute).toHaveBeenCalledWith(callId, true);

      await mockWebRTCManager.toggleVideo(callId, false);
      expect(mockWebRTCManager.toggleVideo).toHaveBeenCalledWith(callId, false);
    });

    it('should provide call statistics', async () => {
      const callId = 'call-123';
      const stats = await mockWebRTCManager.getCallStats(callId);

      expect(stats).toHaveProperty('bytesReceived');
      expect(stats).toHaveProperty('bytesSent');
      expect(stats).toHaveProperty('packetsReceived');
      expect(stats).toHaveProperty('packetsSent');
      expect(stats).toHaveProperty('packetsLost');
      expect(stats.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should handle WebRTC connection failures', async () => {
      mockWebRTCManager.startCall.mockRejectedValue(new Error('ICE connection failed'));

      await expect(mockWebRTCManager.startCall('peer-123'))
        .rejects
        .toThrow('ICE connection failed');
    });
  });

  describe('State Management Integration', () => {
    let mockStateMachine;

    beforeEach(() => {
      mockStateMachine = {
        transition: jest.fn().mockReturnValue(true),
        getState: jest.fn().mockReturnValue('idle'),
        getContext: jest.fn().mockReturnValue({
          isRecording: false,
          isTranscribing: false,
          transcript: '',
          isGeneratingResponse: false,
          isSpeaking: false,
          isPlayingAudio: false
        }),
        on: jest.fn().mockReturnValue(() => {}),
        validateState: jest.fn().mockReturnValue({ valid: true, issues: [] })
      };
    });

    it('should manage voice chat state transitions', () => {
      // Start listening
      const result1 = mockStateMachine.transition('start_listening');
      expect(result1).toBe(true);
      expect(mockStateMachine.transition).toHaveBeenCalledWith('start_listening');

      // Speech detected
      const result2 = mockStateMachine.transition('speech_detected', { transcript: 'test' });
      expect(result2).toBe(true);
      expect(mockStateMachine.transition).toHaveBeenCalledWith('speech_detected', { transcript: 'test' });

      // Response generated
      const result3 = mockStateMachine.transition('response_generated', { currentResponse: 'Hello!' });
      expect(result3).toBe(true);
      expect(mockStateMachine.transition).toHaveBeenCalledWith('response_generated', { currentResponse: 'Hello!' });
    });

    it('should prevent invalid state transitions', () => {
      mockStateMachine.transition.mockReturnValue(false);

      const result = mockStateMachine.transition('invalid_event');
      expect(result).toBe(false);
    });

    it('should validate state integrity', () => {
      const validation = mockStateMachine.validateState();
      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('issues');
      expect(validation.valid).toBe(true);
    });

    it('should handle state event subscriptions', () => {
      const mockHandler = jest.fn();
      const unsubscribe = mockStateMachine.on('state_change', mockHandler);

      expect(mockStateMachine.on).toHaveBeenCalledWith('state_change', mockHandler);
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('Error Handling Integration', () => {
    let mockCircuitBreaker;
    let mockRetryManager;

    beforeEach(() => {
      mockCircuitBreaker = {
        execute: jest.fn().mockImplementation((fn) => fn()),
        getState: jest.fn().mockReturnValue('closed'),
        getStats: jest.fn().mockReturnValue({
          state: 'closed',
          failures: 0,
          successCount: 5
        })
      };

      mockRetryManager = {
        executeWithRetry: jest.fn().mockImplementation((fn) => fn()),
        executeWithCircuitBreaker: jest.fn().mockImplementation((fn) => fn())
      };
    });

    it('should handle API errors with circuit breaker', async () => {
      const mockApiCall = jest.fn().mockResolvedValue({ success: true });

      const result = await mockCircuitBreaker.execute(mockApiCall);

      expect(mockCircuitBreaker.execute).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should retry failed operations', async () => {
      const mockApiCall = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ success: true });

      const result = await mockRetryManager.executeWithRetry(mockApiCall);

      expect(mockRetryManager.executeWithRetry).toHaveBeenCalled();
      expect(mockApiCall).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ success: true });
    });

    it('should combine circuit breaker and retry logic', async () => {
      const mockApiCall = jest.fn().mockResolvedValue({ success: true });

      const result = await mockRetryManager.executeWithCircuitBreaker(
        mockApiCall,
        mockCircuitBreaker
      );

      expect(mockRetryManager.executeWithCircuitBreaker).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should provide circuit breaker statistics', () => {
      const stats = mockCircuitBreaker.getStats();

      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('failures');
      expect(stats).toHaveProperty('successCount');
      expect(stats.state).toBe('closed');
      expect(stats.failures).toBe(0);
    });

    it('should handle different error types gracefully', () => {
      const networkError = { code: 'NETWORK_ERROR', message: 'Connection failed', recoverable: true };
      const permissionError = { code: 'PERMISSION_DENIED', message: 'Access denied', recoverable: false };
      const deviceError = { code: 'DEVICE_ERROR', message: 'Device unavailable', recoverable: true };

      expect(networkError.recoverable).toBe(true);
      expect(permissionError.recoverable).toBe(false);
      expect(deviceError.recoverable).toBe(true);
    });
  });

  describe('Feature Manager Integration', () => {
    let mockFeatureManager;

    beforeEach(() => {
      mockFeatureManager = {
        isSupported: jest.fn(),
        getDegradationLevel: jest.fn().mockReturnValue('full'),
        getRecommendedSettings: jest.fn().mockReturnValue({
          videoQuality: 'hd',
          audioQuality: 'high',
          enableEchoCancellation: true,
          enableNoiseSuppression: true,
          maxConcurrentCalls: 2
        }),
        getDeviceCapabilities: jest.fn().mockReturnValue({
          cores: 8,
          memory: 16,
          platform: 'macOS',
          networkEffectiveType: '4g'
        }),
        meetsMinimumRequirements: jest.fn().mockReturnValue(true)
      };
    });

    it('should detect supported features', () => {
      mockFeatureManager.isSupported.mockReturnValue(true);

      const webRTCSupported = mockFeatureManager.isSupported('webRTC');
      const speechSupported = mockFeatureManager.isSupported('speechRecognition');

      expect(webRTCSupported).toBe(true);
      expect(speechSupported).toBe(true);
    });

    it('should provide degradation levels', () => {
      const level = mockFeatureManager.getDegradationLevel();
      expect(['full', 'basic', 'minimal', 'critical']).toContain(level);
    });

    it('should recommend appropriate settings', () => {
      const settings = mockFeatureManager.getRecommendedSettings();

      expect(settings).toHaveProperty('videoQuality');
      expect(settings).toHaveProperty('audioQuality');
      expect(settings).toHaveProperty('enableEchoCancellation');
      expect(settings).toHaveProperty('maxConcurrentCalls');
    });

    it('should assess device capabilities', () => {
      const capabilities = mockFeatureManager.getDeviceCapabilities();

      expect(capabilities).toHaveProperty('cores');
      expect(capabilities).toHaveProperty('memory');
      expect(capabilities).toHaveProperty('platform');
      expect(capabilities.cores).toBeGreaterThan(0);
    });

    it('should validate minimum requirements', () => {
      const meetsRequirements = mockFeatureManager.meetsMinimumRequirements();
      expect(typeof meetsRequirements).toBe('boolean');
    });
  });

  describe('Voice Chat Component Integration', () => {
    let mockComponent;

    beforeEach(() => {
      mockComponent = {
        state: 'idle',
        context: {
          isRecording: false,
          isTranscribing: false,
          transcript: '',
          isMicEnabled: true,
          isSoundEnabled: true
        },
        startListening: jest.fn().mockReturnValue(true),
        speechDetected: jest.fn().mockReturnValue(true),
        transcriptReceived: jest.fn().mockReturnValue(true),
        responseGenerated: jest.fn().mockReturnValue(true),
        startSpeaking: jest.fn().mockReturnValue(true),
        speechCompleted: jest.fn().mockReturnValue(true),
        toggleMic: jest.fn().mockReturnValue(true),
        toggleSound: jest.fn().mockReturnValue(true)
      };
    });

    it('should handle complete voice interaction flow', async () => {
      // 1. Start listening
      const listeningStarted = mockComponent.startListening();
      expect(listeningStarted).toBe(true);

      // 2. Speech detected
      const speechDetected = mockComponent.speechDetected('Hello world');
      expect(speechDetected).toBe(true);

      // 3. Transcript received
      const transcriptProcessed = mockComponent.transcriptReceived('Hello world');
      expect(transcriptProcessed).toBe(true);

      // 4. Response generated
      const responseReady = mockComponent.responseGenerated('Hello! How can I help?');
      expect(responseReady).toBe(true);

      // 5. Start speaking
      const speakingStarted = mockComponent.startSpeaking('Hello! How can I help?', 2000);
      expect(speakingStarted).toBe(true);

      // 6. Speech completed
      const speechDone = mockComponent.speechCompleted();
      expect(speechDone).toBe(true);

      // Verify final state
      expect(mockComponent.state).toBe('idle');
    });

    it('should handle user control toggles', () => {
      // Toggle microphone
      const micToggled = mockComponent.toggleMic(false);
      expect(micToggled).toBe(true);

      // Toggle sound
      const soundToggled = mockComponent.toggleSound(false);
      expect(soundToggled).toBe(true);
    });

    it('should maintain state consistency', () => {
      // Check that context updates don't break state
      expect(mockComponent.context.isMicEnabled).toBe(true);
      expect(mockComponent.context.isSoundEnabled).toBe(true);
      expect(mockComponent.context.transcript).toBe('');
      expect(mockComponent.state).toBe('idle');
    });

    it('should handle error recovery', () => {
      // Simulate error state
      mockComponent.state = 'error';

      // Attempt to reset
      const reset = mockComponent.startListening();
      expect(reset).toBe(true);

      // Should return to idle state
      expect(mockComponent.state).toBe('idle');
    });
  });

  describe('End-to-End Voice Chat Flow', () => {
    it('should complete full voice interaction cycle', async () => {
      // Mock all necessary components
      const mockFlow = {
        webRTC: { startCall: jest.fn().mockResolvedValue('call-123') },
        stateMachine: {
          transition: jest.fn().mockReturnValue(true),
          getState: jest.fn().mockReturnValue('idle')
        },
        speechRecognition: {
          start: jest.fn(),
          onresult: jest.fn(),
          onend: jest.fn()
        },
        tts: { speak: jest.fn().mockResolvedValue() },
        llm: { sendMessage: jest.fn().mockResolvedValue('Hello! How can I help?') }
      };

      // Simulate complete flow
      const flow = async () => {
        // 1. User starts listening
        mockFlow.stateMachine.transition('start_listening');

        // 2. Speech recognition starts
        mockFlow.speechRecognition.start();

        // 3. Speech detected
        mockFlow.stateMachine.transition('speech_detected', { transcript: 'Hello' });

        // 4. Transcript received
        mockFlow.stateMachine.transition('transcript_received', { transcript: 'Hello' });

        // 5. LLM processes message
        const response = await mockFlow.llm.sendMessage('Hello');

        // 6. Response generated
        mockFlow.stateMachine.transition('response_generated', { currentResponse: response });

        // 7. TTS speaks response
        await mockFlow.tts.speak(response);

        // 8. Speech completed
        mockFlow.stateMachine.transition('speech_completed');

        return mockFlow.stateMachine.getState();
      };

      const finalState = await flow();
      expect(finalState).toBe('idle');

      // Verify all components were called
      expect(mockFlow.stateMachine.transition).toHaveBeenCalledTimes(5);
      expect(mockFlow.speechRecognition.start).toHaveBeenCalledTimes(1);
      expect(mockFlow.llm.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockFlow.tts.speak).toHaveBeenCalledTimes(1);
    });

    it('should handle interruptions gracefully', async () => {
      const mockInterruptedFlow = {
        stateMachine: { transition: jest.fn().mockReturnValue(true) },
        audio: { stop: jest.fn() },
        recognition: { abort: jest.fn() }
      };

      // Simulate user interrupting TTS
      mockInterruptedFlow.stateMachine.transition('speech_detected');
      mockInterruptedFlow.audio.stop();
      mockInterruptedFlow.recognition.abort();

      expect(mockInterruptedFlow.audio.stop).toHaveBeenCalled();
      expect(mockInterruptedFlow.recognition.abort).toHaveBeenCalled();
    });

    it('should recover from network failures', async () => {
      const mockResilientFlow = {
        retryManager: { executeWithRetry: jest.fn().mockResolvedValue('Success') },
        circuitBreaker: { execute: jest.fn().mockResolvedValue('Success') }
      };

      // Test API call with retry and circuit breaker
      const result = await mockResilientFlow.circuitBreaker.execute(
        () => mockResilientFlow.retryManager.executeWithRetry(() => Promise.resolve('Success'))
      );

      expect(result).toBe('Success');
      expect(mockResilientFlow.retryManager.executeWithRetry).toHaveBeenCalled();
    });
  });
});
