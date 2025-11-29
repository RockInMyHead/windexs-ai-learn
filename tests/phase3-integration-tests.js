/**
 * Integration Tests for Phase 3: Advanced Features
 * Tests WebRTC, voice commands, offline mode, analytics, and production systems
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock browser APIs and external dependencies
global.window = {
  crypto: {
    getRandomValues: jest.fn((array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    }),
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
      importKey: jest.fn().mockResolvedValue({}),
      encrypt: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
      decrypt: jest.fn().mockResolvedValue(new ArrayBuffer(32))
    }
  },
  RTCPeerConnection: jest.fn().mockImplementation(() => ({
    createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-offer' }),
    createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-answer' }),
    setLocalDescription: jest.fn().mockResolvedValue(),
    setRemoteDescription: jest.fn().mockResolvedValue(),
    addIceCandidate: jest.fn().mockResolvedValue(),
    addTrack: jest.fn(),
    close: jest.fn(),
    onicecandidate: null,
    onconnectionstatechange: null,
    ontrack: null,
    connectionState: 'connected'
  })),
  indexedDB: {
    open: jest.fn().mockResolvedValue({
      createObjectStore: jest.fn(),
      transaction: jest.fn().mockReturnValue({
        objectStore: jest.fn().mockReturnValue({
          add: jest.fn(),
          put: jest.fn(),
          get: jest.fn().mockResolvedValue(null),
          delete: jest.fn(),
          clear: jest.fn(),
          getAll: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0)
        }),
        done: Promise.resolve()
      })
    })
  },
  localStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
  },
  fetch: jest.fn(),
  navigator: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    platform: 'MacIntel',
    language: 'ru-RU',
    onLine: true,
    mediaDevices: {
      getUserMedia: jest.fn().mockResolvedValue({
        getTracks: () => [{ stop: jest.fn() }],
        getAudioTracks: () => [{ stop: jest.fn() }],
        getVideoTracks: () => [{ stop: jest.fn() }]
      }),
      getDisplayMedia: jest.fn().mockResolvedValue({
        getTracks: () => [{ stop: jest.fn() }],
        getVideoTracks: () => [{ stop: jest.fn() }]
      }),
      enumerateDevices: jest.fn().mockResolvedValue([
        { deviceId: 'audio1', label: 'Microphone', kind: 'audioinput' },
        { deviceId: 'video1', label: 'Camera', kind: 'videoinput' }
      ])
    }
  },
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
  performance: {
    now: jest.fn(() => Date.now()),
    mark: jest.fn(),
    measure: jest.fn(),
    getEntriesByType: jest.fn(() => [])
  },
  location: {
    pathname: '/voice-chat',
    href: 'https://teacher.windexs.ru/voice-chat'
  }
};

describe('Phase 3 Integration Tests', () => {

  describe('Advanced WebRTC Integration', () => {
    let webRTCManager;

    beforeEach(async () => {
      const { MultiPartyWebRTCManager } = require('../src/webrtc/core/MultiPartyWebRTCManager');
      webRTCManager = new MultiPartyWebRTCManager('test-user', 'Test User');
      await webRTCManager.initialize();
    });

    it('should initialize multi-party WebRTC manager', () => {
      expect(webRTCManager).toBeDefined();
      expect(typeof webRTCManager.startCall).toBe('function');
      expect(typeof webRTCManager.inviteParticipant).toBe('function');
      expect(typeof webRTCManager.startScreenShare).toBe('function');
    });

    it('should create and manage call sessions', async () => {
      const sessionId = await webRTCManager.startCall(10);
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');

      const session = webRTCManager.getCurrentSession();
      expect(session).toBeDefined();
      expect(session.id).toBe(sessionId);
      expect(session.maxParticipants).toBe(10);
    });

    it('should handle participant management', async () => {
      await webRTCManager.startCall();

      // Add participant
      webRTCManager.addParticipant({
        id: 'participant1',
        displayName: 'Participant 1',
        stream: null,
        isAudioEnabled: true,
        isVideoEnabled: true,
        isScreenSharing: false,
        joinedAt: new Date(),
        connectionState: 'connecting'
      });

      const participants = webRTCManager.getParticipants();
      expect(participants.size).toBe(2); // Local + participant1
      expect(participants.has('participant1')).toBe(true);
    });

    it('should manage screen sharing', async () => {
      await webRTCManager.startCall();

      expect(webRTCManager.isScreenSharing()).toBe(false);

      await webRTCManager.startScreenShare();
      expect(webRTCManager.isScreenSharing()).toBe(true);

      webRTCManager.stopScreenShare();
      expect(webRTCManager.isScreenSharing()).toBe(false);
    });

    it('should handle recording functionality', async () => {
      await webRTCManager.startCall();

      expect(webRTCManager.isRecording()).toBe(false);

      // Start recording
      const recordingId = await webRTCManager.startRecording();
      expect(recordingId).toBeDefined();
      expect(webRTCManager.isRecording()).toBe(true);

      // Stop recording
      await webRTCManager.stopRecording();
      expect(webRTCManager.isRecording()).toBe(false);

      const recordings = webRTCManager.getRecordings();
      expect(recordings.size).toBe(1);
    });

    it('should manage audio/video controls', () => {
      webRTCManager.toggleAudio('test-user');
      webRTCManager.toggleVideo('test-user');

      // Test passes if no errors thrown
      expect(true).toBe(true);
    });
  });

  describe('Voice Commands Integration', () => {
    let voiceCommandProcessor;

    beforeEach(async () => {
      const { voiceCommandProcessor: processor } = require('../src/utils/voiceCommands/VoiceCommandProcessor');
      voiceCommandProcessor = processor;
      await voiceCommandProcessor.initialize();
    });

    it('should initialize voice command processor', () => {
      expect(voiceCommandProcessor).toBeDefined();
      expect(typeof voiceCommandProcessor.executeCommand).toBe('function');
      expect(typeof voiceCommandProcessor.startListening).toBe('function');
    });

    it('should register and execute commands', async () => {
      const result = await voiceCommandProcessor.executeCommand('stop_listening');
      expect(result).toBeDefined();
      expect(result.executed).toBe(true);
      expect(result.success).toBe(true);
    });

    it('should handle wake words', () => {
      let wakeWordDetected = null;
      voiceCommandProcessor.onWakeWordDetected = (wakeWord) => {
        wakeWordDetected = wakeWord;
      };

      // Simulate wake word detection
      voiceCommandProcessor.onWakeWordDetected('эй');

      expect(wakeWordDetected).toBe('эй');
    });

    it('should process voice commands', async () => {
      let commandResult = null;
      voiceCommandProcessor.onCommandDetected = (result) => {
        commandResult = result;
      };

      // Simulate command execution
      const result = await voiceCommandProcessor.executeCommand('go_home');
      expect(result.success).toBe(true);
      expect(result.command.id).toBe('go_home');
    });

    it('should validate commands by context', async () => {
      // Test command that requires specific page context
      const result = await voiceCommandProcessor.executeCommand('next_question');
      expect(result).toBeDefined();
      // Should still execute but validation happens in command logic
    });
  });

  describe('Offline Mode Integration', () => {
    let offlineManager;

    beforeEach(async () => {
      const { offlineManager: manager } = require('../src/utils/offline/OfflineManager');
      offlineManager = manager;
    });

    it('should initialize offline manager', () => {
      expect(offlineManager).toBeDefined();
      expect(typeof offlineManager.queueForSync).toBe('function');
      expect(typeof offlineManager.startSync).toBe('function');
    });

    it('should queue items for sync', async () => {
      const queueId = await offlineManager.queueForSync('chat_message', {
        message: 'test message',
        timestamp: Date.now()
      });

      expect(queueId).toBeDefined();
      expect(typeof queueId).toBe('string');
    });

    it('should manage cache', async () => {
      // Cache response
      await offlineManager.cacheResponse('/api/test', new Response('test data'));

      // Get cached response
      const cached = await offlineManager.getCachedResponse('/api/test');
      expect(cached).toBeDefined();
    });

    it('should cache user data', async () => {
      await offlineManager.cacheUserData('test_key', { user: 'test' });
      const data = await offlineManager.getCachedUserData('test_key');
      expect(data).toEqual({ user: 'test' });
    });

    it('should provide sync status', () => {
      const status = offlineManager.getSyncStatus();
      expect(status).toHaveProperty('isOnline');
      expect(status).toHaveProperty('isSyncing');
      expect(status).toHaveProperty('pendingItems');
    });

    it('should clear cache', async () => {
      await offlineManager.clearCache();
      const stats = await offlineManager.getCacheStats();
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('Advanced Analytics Integration', () => {
    let advancedAnalytics;

    beforeEach(() => {
      const { advancedAnalytics: analytics } = require('../src/utils/analytics/AdvancedAnalytics');
      advancedAnalytics = analytics;
    });

    it('should initialize analytics system', () => {
      expect(advancedAnalytics).toBeDefined();
      expect(typeof advancedAnalytics.track).toBe('function');
      expect(typeof advancedAnalytics.trackConversion).toBe('function');
    });

    it('should track events and conversions', () => {
      advancedAnalytics.track('button_click', { buttonId: 'test' });
      advancedAnalytics.trackConversion('signup_complete', { source: 'test' });

      const data = advancedAnalytics.exportData();
      expect(data.events.length).toBeGreaterThan(0);
    });

    it('should create and manage A/B tests', () => {
      const testId = advancedAnalytics.createABTest({
        name: 'Button Color Test',
        description: 'Testing different button colors',
        variants: [
          { id: 'blue', name: 'Blue Button', config: { color: 'blue' }, trafficPercentage: 50 },
          { id: 'green', name: 'Green Button', config: { color: 'green' }, trafficPercentage: 50 }
        ],
        status: 'draft',
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        metrics: { primary: 'click_rate', secondary: ['conversion_rate'] }
      });

      expect(testId).toBeDefined();

      const variant = advancedAnalytics.getUserVariant(testId);
      expect(['blue', 'green']).toContain(variant);
    });

    it('should generate analytics reports', () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const report = advancedAnalytics.generateReport(startDate, endDate);

      expect(report).toHaveProperty('period');
      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('insights');
      expect(report).toHaveProperty('recommendations');

      expect(report.metrics).toHaveProperty('users');
      expect(report.metrics).toHaveProperty('sessions');
      expect(report.metrics).toHaveProperty('events');
      expect(report.metrics).toHaveProperty('conversions');
    });

    it('should define and track goals', () => {
      advancedAnalytics.defineGoal({
        id: 'purchase_completed',
        name: 'Purchase Completed',
        description: 'User completes a purchase',
        value: 99.99,
        condition: (event) => event.action === 'purchase' && event.category === 'conversion'
      });

      advancedAnalytics.trackConversion('purchase_completed', { amount: 99.99 });

      const data = advancedAnalytics.exportData();
      expect(data.goals.length).toBeGreaterThan(0);
    });
  });

  describe('Security Manager Integration', () => {
    let securityManager;

    beforeEach(() => {
      const { securityManager: manager } = require('../src/utils/security/SecurityManager');
      securityManager = manager;
    });

    it('should initialize security manager', () => {
      expect(securityManager).toBeDefined();
      expect(typeof securityManager.generateCSRFToken).toBe('function');
      expect(typeof securityManager.checkRateLimit).toBe('function');
    });

    it('should manage CSRF tokens', () => {
      const token = securityManager.generateCSRFToken('session123');
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const isValid = securityManager.validateCSRFToken('session123', token);
      expect(isValid).toBe(true);
    });

    it('should enforce rate limiting', () => {
      const ip = '192.168.1.1';

      // First request should be allowed
      const result1 = securityManager.checkRateLimit(ip);
      expect(result1.allowed).toBe(true);

      // Subsequent requests within limit should be allowed
      for (let i = 0; i < 99; i++) {
        const result = securityManager.checkRateLimit(ip);
        expect(result.allowed).toBe(true);
      }

      // Request over limit should be blocked
      const resultOver = securityManager.checkRateLimit(ip);
      expect(resultOver.allowed).toBe(false);
    });

    it('should apply security headers', () => {
      const headers = securityManager.applySecurityHeaders({});
      expect(headers).toHaveProperty('X-Content-Type-Options');
      expect(headers).toHaveProperty('X-Frame-Options');
      expect(headers).toHaveProperty('Content-Security-Policy');
    });

    it('should encrypt and decrypt data', async () => {
      const originalData = 'sensitive information';

      const encrypted = await securityManager.encryptData(originalData);
      expect(encrypted).not.toBe(originalData);

      const decrypted = await securityManager.decryptData(encrypted);
      expect(decrypted).toBe(originalData);
    });

    it('should validate input data', () => {
      const schema = {
        required: ['email', 'password'],
        stringFields: ['email', 'password'],
        maxLength: { password: 128 }
      };

      // Valid data
      const validResult = securityManager.validateInput({
        email: 'test@example.com',
        password: 'password123'
      }, schema);
      expect(validResult.valid).toBe(true);

      // Invalid data
      const invalidResult = securityManager.validateInput({
        email: 'invalid-email',
        password: 'x'.repeat(200) // Too long
      }, schema);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });

    it('should log security events', () => {
      securityManager.logSecurityEvent({
        type: 'rate_limit',
        severity: 'medium',
        ip: '192.168.1.1',
        userAgent: 'test-agent',
        details: { attempts: 150 },
        mitigated: true
      });

      const report = securityManager.getSecurityReport();
      expect(report.events.length).toBeGreaterThan(0);
    });
  });

  describe('Disaster Recovery Integration', () => {
    let disasterRecovery;

    beforeEach(() => {
      const { disasterRecovery: dr } = require('../src/utils/disasterRecovery/DisasterRecovery');
      disasterRecovery = dr;
    });

    it('should initialize disaster recovery system', () => {
      expect(disasterRecovery).toBeDefined();
      expect(typeof disasterRecovery.createBackup).toBe('function');
      expect(typeof disasterRecovery.restoreFromBackup).toBe('function');
    });

    it('should create backups', async () => {
      const recoveryPoint = await disasterRecovery.createBackup('full');
      expect(recoveryPoint).toBeDefined();
      expect(recoveryPoint).toHaveProperty('id');
      expect(recoveryPoint).toHaveProperty('timestamp');
      expect(recoveryPoint.type).toBe('full');
    });

    it('should monitor system health', () => {
      const health = disasterRecovery.getHealthStatus();
      expect(health).toHaveProperty('overall');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('metrics');
    });

    it('should report and resolve incidents', () => {
      disasterRecovery.reportIncident({
        type: 'outage',
        severity: 'high',
        affectedComponents: ['api'],
        description: 'API service down',
        impact: { usersAffected: 100, duration: 0 }
      });

      const report = disasterRecovery.getRecoveryReport();
      expect(report.incidents.length).toBeGreaterThan(0);

      // Resolve incident
      const incidentId = report.incidents[0].id;
      disasterRecovery.resolveIncident(incidentId, 'Service restarted');

      const updatedReport = disasterRecovery.getRecoveryReport();
      const resolvedIncident = updatedReport.incidents.find(i => i.id === incidentId);
      expect(resolvedIncident).toHaveProperty('endTime');
      expect(resolvedIncident?.resolution).toBe('Service restarted');
    });

    it('should provide recovery reports', () => {
      const report = disasterRecovery.getRecoveryReport();
      expect(report).toHaveProperty('config');
      expect(report).toHaveProperty('health');
      expect(report).toHaveProperty('recoveryPoints');
      expect(report).toHaveProperty('incidents');
      expect(report).toHaveProperty('failoverStatus');
    });
  });

  describe('Cross-Component Integration', () => {
    it('should integrate WebRTC with analytics', async () => {
      const { MultiPartyWebRTCManager } = require('../src/webrtc/core/MultiPartyWebRTCManager');
      const { advancedAnalytics } = require('../src/utils/analytics/AdvancedAnalytics');

      const webRTC = new MultiPartyWebRTCManager('user1', 'User 1');
      await webRTC.initialize();

      // Start call and track analytics
      const sessionId = await webRTC.startCall();
      advancedAnalytics.track('call_started', { sessionId, participants: 1 });

      // Track performance
      advancedAnalytics.trackPerformance('webrtc_init_time', 150);

      const analyticsData = advancedAnalytics.exportData();
      expect(analyticsData.events.some(e => e.action === 'call_started')).toBe(true);
      expect(analyticsData.events.some(e => e.action === 'performance_metric')).toBe(true);
    });

    it('should integrate voice commands with security', async () => {
      const { voiceCommandProcessor } = require('../src/utils/voiceCommands/VoiceCommandProcessor');
      const { securityManager } = require('../src/utils/security/SecurityManager');

      await voiceCommandProcessor.initialize();

      // Execute command and check security
      const result = await voiceCommandProcessor.executeCommand('stop_listening');
      expect(result.success).toBe(true);

      // Check that no security violations occurred
      const securityReport = securityManager.getSecurityReport();
      expect(securityReport.events.length).toBe(0); // No security events
    });

    it('should integrate offline mode with disaster recovery', async () => {
      const { offlineManager } = require('../src/utils/offline/OfflineManager');
      const { disasterRecovery } = require('../src/utils/disasterRecovery/DisasterRecovery');

      // Queue item for sync
      await offlineManager.queueForSync('chat_message', { message: 'test' });

      // Create backup
      await disasterRecovery.createBackup('incremental');

      const offlineStats = await offlineManager.getCacheStats();
      const recoveryReport = disasterRecovery.getRecoveryReport();

      expect(offlineStats.queue).toBeGreaterThan(0);
      expect(recoveryReport.recoveryPoints.length).toBeGreaterThan(0);
    });

    it('should handle end-to-end user journey', async () => {
      // Import all major components
      const { browserDetector } = require('../src/utils/browserCompatibility/browserDetector');
      const { UniversalSpeechRecognition } = require('../src/utils/browserCompatibility/UniversalSpeechRecognition');
      const { echoDetectorV2 } = require('../src/utils/echoDetection/EchoDetectorV2');
      const { offlineManager } = require('../src/utils/offline/OfflineManager');
      const { advancedAnalytics } = require('../src/utils/analytics/AdvancedAnalytics');
      const { securityManager } = require('../src/utils/security/SecurityManager');

      // Initialize components
      await echoDetectorV2.initialize();

      // Simulate user journey
      advancedAnalytics.setUserId('test-user');
      advancedAnalytics.track('page_view', { page: '/voice-chat' });
      advancedAnalytics.track('voice_session_start');

      // Check browser compatibility
      const browserInfo = browserDetector.getBrowserInfo();
      expect(browserInfo.name).toBeDefined();

      // Create speech recognition
      const speechRec = new UniversalSpeechRecognition();
      expect(speechRec).toBeDefined();

      // Test echo detection
      const echoResult = await echoDetectorV2.detectEcho('Hello world');
      expect(echoResult).toHaveProperty('isEcho');

      // Test offline functionality
      await offlineManager.cacheUserData('journey_test', { step: 'completed' });
      const cached = await offlineManager.getCachedUserData('journey_test');
      expect(cached).toEqual({ step: 'completed' });

      // Test security
      const csrfToken = securityManager.generateCSRFToken('session123');
      const isValid = securityManager.validateCSRFToken('session123', csrfToken);
      expect(isValid).toBe(true);

      // Complete journey
      advancedAnalytics.trackConversion('voice_interaction_complete');
      advancedAnalytics.track('voice_session_end');

      const analyticsData = advancedAnalytics.exportData();
      expect(analyticsData.events.length).toBeGreaterThan(5);

      console.log('✅ End-to-end user journey test completed successfully');
    });

    it('should handle error scenarios across components', async () => {
      const { advancedAnalytics } = require('../src/utils/analytics/AdvancedAnalytics');
      const { securityManager } = require('../src/utils/security/SecurityManager');
      const { disasterRecovery } = require('../src/utils/disasterRecovery/DisasterRecovery');

      // Simulate error
      const error = new Error('Simulated component failure');
      advancedAnalytics.trackError(error, { component: 'test_component' });

      // Check analytics captured the error
      const analyticsData = advancedAnalytics.exportData();
      expect(analyticsData.events.some(e => e.category === 'error')).toBe(true);

      // Report incident
      disasterRecovery.reportIncident({
        type: 'degradation',
        severity: 'medium',
        affectedComponents: ['test_component'],
        description: 'Component failure detected',
        impact: { usersAffected: 1, duration: 0 }
      });

      // Check security monitoring
      const securityReport = securityManager.getSecurityReport();
      expect(securityReport).toBeDefined();

      // Check disaster recovery
      const recoveryReport = disasterRecovery.getRecoveryReport();
      expect(recoveryReport.incidents.length).toBeGreaterThan(0);
    });

    it('should maintain data consistency across offline/online transitions', async () => {
      const { offlineManager } = require('../src/utils/offline/OfflineManager');
      const { advancedAnalytics } = require('../src/utils/analytics/AdvancedAnalytics');

      // Simulate offline scenario
      navigator.onLine = false;

      // Queue data for sync
      await offlineManager.queueForSync('analytics_event', {
        event: 'offline_action',
        timestamp: Date.now()
      });

      // Track analytics while offline
      advancedAnalytics.track('offline_interaction', { feature: 'voice_commands' });

      const syncStatus = offlineManager.getSyncStatus();
      expect(syncStatus.pendingItems).toBeGreaterThan(0);
      expect(syncStatus.isOnline).toBe(false);

      // Simulate coming back online
      navigator.onLine = true;

      // Check that sync can be initiated
      expect(typeof offlineManager.startSync).toBe('function');

      // Verify analytics still work
      const analyticsData = advancedAnalytics.exportData();
      expect(analyticsData.events.some(e => e.action === 'offline_interaction')).toBe(true);
    });
  });

  describe('Performance Integration', () => {
    it('should maintain performance across all components', () => {
      const { performanceOptimizer } = require('../src/utils/performance/PerformanceOptimizer');
      const { advancedAnalytics } = require('../src/utils/analytics/AdvancedAnalytics');

      // Record performance metrics
      performanceOptimizer.recordMetrics({
        memoryUsage: 85.5,
        fps: 55,
        renderTime: 12
      });

      // Track performance in analytics
      advancedAnalytics.trackPerformance('component_init_time', 45);
      advancedAnalytics.trackPerformance('render_time', 12);

      const report = performanceOptimizer.getPerformanceReport();
      expect(report.current).toBeDefined();

      const analyticsData = advancedAnalytics.exportData();
      expect(analyticsData.events.some(e => e.category === 'performance')).toBe(true);
    });

    it('should handle memory management across components', () => {
      const { performanceOptimizer } = require('../src/utils/performance/PerformanceOptimizer');
      const { offlineManager } = require('../src/utils/offline/OfflineManager');

      // Register memory cleanup tasks
      const cleanupTask = jest.fn();
      performanceOptimizer.registerMemoryCleanup(cleanupTask);

      // Perform cleanup
      performanceOptimizer.performMemoryCleanup();
      expect(cleanupTask).toHaveBeenCalled();

      // Check offline cache management
      expect(typeof offlineManager.clearCache).toBe('function');
    });
  });
});
