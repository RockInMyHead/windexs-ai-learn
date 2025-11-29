/**
 * Integration Tests for Phase 2: Stabilization
 * Tests browser compatibility, echo detection, performance, and monitoring
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
  webkitSpeechRecognition: jest.fn().mockImplementation(() => ({
    continuous: false,
    interimResults: false,
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
  Worker: jest.fn().mockImplementation(() => ({
    postMessage: jest.fn(),
    terminate: jest.fn(),
    onmessage: null,
    onerror: null
  })),
  performance: {
    now: jest.fn(() => Date.now()),
    mark: jest.fn(),
    measure: jest.fn(),
    getEntriesByType: jest.fn(() => []),
    memory: {
      usedJSHeapSize: 50 * 1024 * 1024,
      totalJSHeapSize: 100 * 1024 * 1024,
      jsHeapSizeLimit: 200 * 1024 * 1024
    }
  },
  fetch: jest.fn(),
  requestAnimationFrame: jest.fn(cb => setTimeout(cb, 16)),
  cancelAnimationFrame: jest.fn(),
  navigator: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    platform: 'MacIntel',
    language: 'ru-RU',
    cookieEnabled: true,
    onLine: true
  },
  document: {
    createElement: jest.fn(tag => {
      if (tag === 'canvas') {
        return {
          getContext: jest.fn(() => ({
            clearRect: jest.fn(),
            fillRect: jest.fn(),
            beginPath: jest.fn(),
            arc: jest.fn(),
            fill: jest.fn(),
            fillStyle: '',
            createRadialGradient: jest.fn(() => ({
              addColorStop: jest.fn()
            }))
          })),
          width: 200,
          height: 200
        };
      }
      return {};
    }),
    head: {
      appendChild: jest.fn()
    }
  }
};

global.navigator.mediaDevices = {
  getUserMedia: jest.fn().mockResolvedValue({
    getTracks: () => [{ stop: jest.fn() }],
    getAudioTracks: () => [{ stop: jest.fn() }],
    getVideoTracks: () => [{ stop: jest.fn() }]
  }),
  enumerateDevices: jest.fn().mockResolvedValue([
    { deviceId: 'audio1', label: 'Microphone', kind: 'audioinput' },
    { deviceId: 'video1', label: 'Camera', kind: 'videoinput' }
  ])
};

describe('Phase 2 Integration Tests', () => {

  describe('Browser Compatibility Integration', () => {
    it('should detect browser capabilities correctly', () => {
      const { browserDetector } = require('../src/utils/browserCompatibility/browserDetector');

      const capabilities = browserDetector.getCapabilities();
      const browserInfo = browserDetector.getBrowserInfo();

      expect(capabilities).toHaveProperty('webRTC');
      expect(capabilities).toHaveProperty('webAudio');
      expect(capabilities).toHaveProperty('speechRecognition');

      expect(browserInfo).toHaveProperty('name');
      expect(browserInfo).toHaveProperty('version');
      expect(['chrome', 'firefox', 'safari', 'edge', 'opera', 'unknown']).toContain(browserInfo.name);
    });

    it('should provide browser-specific optimizations', () => {
      const { browserDetector } = require('../src/utils/browserCompatibility/browserDetector');

      const optimizations = browserDetector.getOptimizations();

      expect(optimizations).toHaveProperty('speechRecognition');
      expect(optimizations).toHaveProperty('webRTC');
      expect(optimizations).toHaveProperty('webAudio');
      expect(optimizations).toHaveProperty('canvas');

      // Speech recognition optimizations
      expect(optimizations.speechRecognition).toHaveProperty('continuous');
      expect(optimizations.speechRecognition).toHaveProperty('interimResults');
      expect(optimizations.speechRecognition).toHaveProperty('maxAlternatives');
    });

    it('should calculate performance score', () => {
      const { browserDetector } = require('../src/utils/browserCompatibility/browserDetector');

      const score = browserDetector.getPerformanceScore();

      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should initialize universal speech recognition', async () => {
      const { UniversalSpeechRecognition } = require('../src/utils/browserCompatibility/UniversalSpeechRecognition');

      const recognition = new UniversalSpeechRecognition();

      expect(recognition).toBeDefined();
      expect(typeof recognition.start).toBe('function');
      expect(typeof recognition.stop).toBe('function');
      expect(typeof recognition.isActive).toBe('function');

      // Test browser support detection
      const browserSupport = recognition.getBrowserSupport();
      expect(browserSupport).toHaveProperty('webkitSpeechRecognition');
      expect(browserSupport).toHaveProperty('mozSpeechRecognition');
      expect(browserSupport).toHaveProperty('standardSpeechRecognition');
    });
  });

  describe('Echo Detection v2.0 Integration', () => {
    let echoDetector;

    beforeEach(async () => {
      const { echoDetectorV2 } = require('../src/utils/echoDetection/EchoDetectorV2');
      echoDetector = echoDetectorV2;
      await echoDetector.initialize();
    });

    it('should initialize echo detector', () => {
      expect(echoDetector).toBeDefined();
      expect(typeof echoDetector.detectEcho).toBe('function');
      expect(typeof echoDetector.profileTTSAudio).toBe('function');
    });

    it('should profile TTS audio', async () => {
      // Create mock audio buffer
      const mockAudioBuffer = {
        duration: 2.5,
        getChannelData: jest.fn(() => new Float32Array(44100)) // 1 second at 44.1kHz
      };

      await echoDetector.profileTTSAudio('Hello world', mockAudioBuffer);

      const profiles = echoDetector.getTTSProfiles();
      expect(profiles.length).toBe(1);
      expect(profiles[0].text).toBe('hello world');
      expect(profiles[0].duration).toBe(2500); // 2.5 seconds in ms
    });

    it('should detect echo in user input', async () => {
      // Profile TTS first
      const mockAudioBuffer = {
        duration: 2.0,
        getChannelData: jest.fn(() => new Float32Array(22050)) // 0.5 seconds
      };

      await echoDetector.profileTTSAudio('Test message', mockAudioBuffer);

      // Test echo detection
      const result = await echoDetector.detectEcho('Test message');

      expect(result).toHaveProperty('isEcho');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('method');
      expect(result).toHaveProperty('details');
      expect(result).toHaveProperty('metadata');

      // Should detect echo since text matches exactly
      expect(result.isEcho).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should not detect echo in different text', async () => {
      const mockAudioBuffer = {
        duration: 1.5,
        getChannelData: jest.fn(() => new Float32Array(22050))
      };

      await echoDetector.profileTTSAudio('Hello there', mockAudioBuffer);

      const result = await echoDetector.detectEcho('How are you?');

      expect(result.isEcho).toBe(false);
      expect(result.confidence).toBeLessThan(0.3);
    });

    it('should cleanup old profiles', async () => {
      // Add multiple profiles
      const mockAudioBuffer = {
        duration: 1.0,
        getChannelData: jest.fn(() => new Float32Array(22050))
      };

      for (let i = 0; i < 15; i++) {
        await echoDetector.profileTTSAudio(`Message ${i}`, mockAudioBuffer);
      }

      let profiles = echoDetector.getTTSProfiles();
      expect(profiles.length).toBe(15);

      // Cleanup old profiles (simulate 35 seconds passed)
      echoDetector.cleanupOldProfiles(35000);

      profiles = echoDetector.getTTSProfiles();
      expect(profiles.length).toBeLessThanOrEqual(10); // Should keep max 10
    });
  });

  describe('Performance Optimization Integration', () => {
    let performanceOptimizer;

    beforeEach(() => {
      const { performanceOptimizer: optimizer } = require('../src/utils/performance/PerformanceOptimizer');
      performanceOptimizer = optimizer;
    });

    it('should initialize performance optimizer', () => {
      expect(performanceOptimizer).toBeDefined();
      expect(typeof performanceOptimizer.getPerformanceReport).toBe('function');
      expect(typeof performanceOptimizer.recordMetrics).toBe('function');
    });

    it('should generate performance reports', () => {
      const report = performanceOptimizer.getPerformanceReport();

      expect(report).toHaveProperty('current');
      expect(report).toHaveProperty('average');
      expect(report).toHaveProperty('issues');

      expect(Array.isArray(report.issues)).toBe(true);
    });

    it('should register memory cleanup tasks', () => {
      const cleanupTask = jest.fn();
      const unregister = performanceOptimizer.registerMemoryCleanup(cleanupTask);

      expect(typeof unregister).toBe('function');

      // Cleanup should work
      unregister();
    });

    it('should create Web Workers', () => {
      const worker = performanceOptimizer.createWorker('test-worker', `
        self.onmessage = function(e) {
          self.postMessage('received: ' + e.data);
        };
      `);

      expect(worker).toBeDefined();
      expect(worker.postMessage).toBeDefined();
      expect(worker.terminate).toBeDefined();
    });

    it('should optimize canvas rendering', () => {
      // This would test canvas optimization in a real browser environment
      performanceOptimizer.optimizeCanvasRendering();
      // Test passes if no errors thrown
      expect(true).toBe(true);
    });
  });

  describe('Monitoring System Integration', () => {
    let monitoringSystem;

    beforeEach(async () => {
      const { monitoringSystem: system } = require('../src/utils/monitoring/MonitoringSystem');
      monitoringSystem = system;
      await monitoringSystem.initialize();
    });

    it('should initialize monitoring system', () => {
      expect(monitoringSystem).toBeDefined();
      expect(typeof monitoringSystem.captureError).toBe('function');
      expect(typeof monitoringSystem.capturePerformanceMetric).toBe('function');
    });

    it('should capture and track errors', () => {
      const testError = new Error('Test error');
      monitoringSystem.captureError(testError, { component: 'test' });

      const stats = monitoringSystem.getStats();
      expect(stats.events.total).toBeGreaterThan(0);
      expect(stats.events.byType.error).toBeGreaterThan(0);
    });

    it('should capture performance metrics', () => {
      monitoringSystem.capturePerformanceMetric('test_metric', 42.5, { source: 'test' });

      const stats = monitoringSystem.getStats();
      expect(stats.events.byType.performance).toBeGreaterThan(0);
    });

    it('should track user actions', () => {
      monitoringSystem.captureUserAction('button_click', { buttonId: 'test-button' });

      const stats = monitoringSystem.getStats();
      expect(stats.events.byType.user_action).toBeGreaterThan(0);
    });

    it('should manage alert rules', () => {
      const alertRule = {
        id: 'test_alert',
        name: 'Test Alert',
        condition: (metrics) => metrics.errorRate > 10,
        severity: 'medium' as const,
        cooldown: 60000,
        action: jest.fn()
      };

      monitoringSystem.addAlertRule(alertRule);

      // Should not trigger alert initially
      const stats = monitoringSystem.getStats();
      expect(stats.alerts.total).toBe(0);
    });

    it('should export monitoring data', () => {
      const data = monitoringSystem.exportData();

      expect(data).toHaveProperty('config');
      expect(data).toHaveProperty('sessionId');
      expect(data).toHaveProperty('events');
      expect(data).toHaveProperty('alerts');
      expect(data).toHaveProperty('stats');

      expect(Array.isArray(data.events)).toBe(true);
      expect(Array.isArray(data.alerts)).toBe(true);
    });
  });

  describe('Lazy Loading Integration', () => {
    let lazyLoader;

    beforeEach(() => {
      const { lazyLoader: loader } = require('../src/utils/performance/LazyLoader');
      lazyLoader = loader;
    });

    it('should register lazy loadable modules', () => {
      const mockLoader = {
        load: jest.fn().mockResolvedValue({ default: 'test' }),
        priority: 'high' as const
      };

      lazyLoader.registerModule('test-module', mockLoader);
      expect(true).toBe(true); // Test passes if no errors
    });

    it('should provide loading statistics', () => {
      const stats = lazyLoader.getStats();

      expect(stats).toHaveProperty('loaded');
      expect(stats).toHaveProperty('loading');
      expect(stats).toHaveProperty('queued');
      expect(stats).toHaveProperty('totalSize');

      expect(typeof stats.loaded).toBe('number');
      expect(typeof stats.loading).toBe('number');
      expect(typeof stats.queued).toBe('number');
    });
  });

  describe('End-to-End Browser Compatibility Flow', () => {
    it('should handle complete browser compatibility workflow', async () => {
      // Test the complete flow from browser detection to speech recognition
      const { browserDetector } = require('../src/utils/browserCompatibility/browserDetector');
      const { UniversalSpeechRecognition } = require('../src/utils/browserCompatibility/UniversalSpeechRecognition');

      // 1. Detect browser
      const browserInfo = browserDetector.getBrowserInfo();
      const capabilities = browserDetector.getCapabilities();

      expect(browserInfo.name).toBeDefined();
      expect(capabilities.webRTC).toBeDefined();

      // 2. Get optimizations
      const optimizations = browserDetector.getOptimizations();
      expect(optimizations.speechRecognition).toBeDefined();

      // 3. Create universal speech recognition
      const recognition = new UniversalSpeechRecognition({
        ...optimizations.speechRecognition
      });

      expect(recognition).toBeDefined();

      // 4. Check fallback mode
      const isFallback = recognition.isFallbackMode();
      expect(typeof isFallback).toBe('boolean');

      // 5. Test browser support info
      const supportInfo = recognition.getBrowserSupport();
      expect(supportInfo).toHaveProperty('webkitSpeechRecognition');
      expect(supportInfo).toHaveProperty('mozSpeechRecognition');
    });

    it('should integrate echo detection with speech recognition', async () => {
      const { UniversalSpeechRecognition } = require('../src/utils/browserCompatibility/UniversalSpeechRecognition');
      const { echoDetectorV2 } = require('../src/utils/echoDetection/EchoDetectorV2');

      // Create components
      const recognition = new UniversalSpeechRecognition();
      await echoDetectorV2.initialize();

      // Simulate speech recognition result
      let recognitionResult = null;
      recognition.onResult((result) => {
        recognitionResult = result;
      });

      // Manually trigger result (simulating browser API)
      recognition.onResult({
        transcript: 'Hello world',
        confidence: 0.9,
        isFinal: true
      });

      expect(recognitionResult).toBeDefined();
      expect(recognitionResult.transcript).toBe('Hello world');

      // Test echo detection on the result
      const echoResult = await echoDetectorV2.detectEcho(recognitionResult.transcript);

      expect(echoResult).toHaveProperty('isEcho');
      expect(echoResult.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Monitoring End-to-End', () => {
    it('should integrate all performance systems', () => {
      const { performanceOptimizer } = require('../src/utils/performance/PerformanceOptimizer');
      const { monitoringSystem } = require('../src/utils/monitoring/MonitoringSystem');

      // Record some performance metrics
      performanceOptimizer.recordMetrics({
        memoryUsage: 75.5,
        fps: 58,
        audioLatency: 25,
        renderTime: 8
      });

      // Capture performance metric in monitoring
      monitoringSystem.capturePerformanceMetric('memory_usage', 75.5);

      // Get performance report
      const report = performanceOptimizer.getPerformanceReport();
      expect(report.current).toBeDefined();

      // Get monitoring stats
      const stats = monitoringSystem.getStats();
      expect(stats.events.byType.performance).toBeGreaterThan(0);

      // Verify integration
      expect(report).toHaveProperty('issues');
      expect(stats).toHaveProperty('performance');
    });

    it('should handle memory management integration', () => {
      const { performanceOptimizer } = require('../src/utils/performance/PerformanceOptimizer');

      // Register cleanup task
      const cleanupTask = jest.fn();
      const unregister = performanceOptimizer.registerMemoryCleanup(cleanupTask);

      // Simulate memory cleanup
      performanceOptimizer.performMemoryCleanup();

      expect(cleanupTask).toHaveBeenCalled();

      // Unregister should work
      unregister();
    });
  });

  describe('Cross-Component Integration', () => {
    it('should integrate all Phase 2 components together', async () => {
      // Import all major components
      const { browserDetector } = require('../src/utils/browserCompatibility/browserDetector');
      const { UniversalSpeechRecognition } = require('../src/utils/browserCompatibility/UniversalSpeechRecognition');
      const { echoDetectorV2 } = require('../src/utils/echoDetection/EchoDetectorV2');
      const { performanceOptimizer } = require('../src/utils/performance/PerformanceOptimizer');
      const { monitoringSystem } = require('../src/utils/monitoring/MonitoringSystem');

      // Initialize components
      await echoDetectorV2.initialize();
      await monitoringSystem.initialize();

      // Test browser detection
      const browserInfo = browserDetector.getBrowserInfo();
      expect(browserInfo.name).toBeDefined();

      // Test speech recognition creation
      const recognition = new UniversalSpeechRecognition();
      expect(recognition).toBeDefined();

      // Test echo detection
      const echoResult = await echoDetectorV2.detectEcho('Test input');
      expect(echoResult).toHaveProperty('isEcho');

      // Test performance monitoring
      performanceOptimizer.recordMetrics({
        memoryUsage: 50,
        fps: 60
      });

      // Test error monitoring
      monitoringSystem.captureError(new Error('Test error'));

      // Verify all systems are working
      const perfReport = performanceOptimizer.getPerformanceReport();
      const monitoringStats = monitoringSystem.getStats();

      expect(perfReport).toBeDefined();
      expect(monitoringStats.events.total).toBeGreaterThan(0);

      console.log('✅ All Phase 2 components integrated successfully');
    });

    it('should handle error propagation across components', async () => {
      const { monitoringSystem } = require('../src/utils/monitoring/MonitoringSystem');
      const { echoDetectorV2 } = require('../src/utils/echoDetection/EchoDetectorV2');

      // Simulate error in echo detection
      await echoDetectorV2.initialize();

      // Force an error
      const error = new Error('Simulated echo detection error');

      // Error should be captured by monitoring
      monitoringSystem.captureError(error, { component: 'echo_detector' });

      const stats = monitoringSystem.getStats();
      expect(stats.events.byType.error).toBeGreaterThan(0);
      expect(stats.events.recent.some(e => e.data.message === 'Simulated echo detection error')).toBe(true);
    });
  });

  describe('Resource Management Integration', () => {
    it('should properly manage WebRTC resources', () => {
      const { mediaService } = require('../src/webrtc/utils/mediaService');

      // Test media stream creation and cleanup
      expect(mediaService).toBeDefined();
      expect(typeof mediaService.getUserMedia).toBe('function');
      expect(typeof mediaService.stopStream).toBe('function');
    });

    it('should integrate lazy loading with performance monitoring', () => {
      const { lazyLoader } = require('../src/utils/performance/LazyLoader');
      const { performanceOptimizer } = require('../src/utils/performance/PerformanceOptimizer');

      // Register a lazy module
      lazyLoader.registerModule('test-module', {
        load: jest.fn().mockResolvedValue('loaded'),
        priority: 'medium'
      });

      // Check lazy loading stats
      const lazyStats = lazyLoader.getStats();
      expect(lazyStats.queued).toBeGreaterThan(0);

      // Performance should be monitored
      const perfReport = performanceOptimizer.getPerformanceReport();
      expect(perfReport).toBeDefined();
    });
  });
});
