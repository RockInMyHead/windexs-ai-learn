/**
 * Feature Manager for Graceful Degradation
 * Detects available features and provides fallbacks
 */

export interface FeatureSupport {
  name: string;
  supported: boolean;
  fallback?: string;
  required: boolean;
  priority: number;
}

export type DegradationLevel = 'full' | 'basic' | 'minimal' | 'critical';

export class FeatureManager {
  private features: Map<string, FeatureSupport> = new Map();
  private deviceCapabilities: DeviceCapabilities;

  constructor() {
    this.deviceCapabilities = this.detectDeviceCapabilities();
    this.initializeFeatures();
  }

  /**
   * Check if feature is supported
   */
  isSupported(featureName: string): boolean {
    return this.features.get(featureName)?.supported ?? false;
  }

  /**
   * Get fallback for feature
   */
  getFallback(featureName: string): string | undefined {
    return this.features.get(featureName)?.fallback;
  }

  /**
   * Get degradation level based on supported features
   */
  getDegradationLevel(): DegradationLevel {
    const supportedFeatures = Array.from(this.features.values())
      .filter(feature => feature.supported);

    const criticalSupported = supportedFeatures
      .filter(feature => feature.required)
      .length;

    const totalCritical = Array.from(this.features.values())
      .filter(feature => feature.required)
      .length;

    const supportRatio = criticalSupported / totalCritical;

    if (supportRatio >= 0.9) return 'full';
    if (supportRatio >= 0.7) return 'basic';
    if (supportRatio >= 0.5) return 'minimal';
    return 'critical';
  }

  /**
   * Get all features with support status
   */
  getAllFeatures(): FeatureSupport[] {
    return Array.from(this.features.values());
  }

  /**
   * Get device capabilities
   */
  getDeviceCapabilities(): DeviceCapabilities {
    return this.deviceCapabilities;
  }

  /**
   * Check if device meets minimum requirements
   */
  meetsMinimumRequirements(): boolean {
    return this.deviceCapabilities.cores >= 2 &&
           this.deviceCapabilities.memory >= 2 &&
           this.deviceCapabilities.networkEffectiveType !== 'slow-2g';
  }

  /**
   * Get recommended settings based on device capabilities
   */
  getRecommendedSettings(): RecommendedSettings {
    const level = this.getDegradationLevel();

    switch (level) {
      case 'full':
        return {
          videoQuality: 'hd',
          audioQuality: 'high',
          enableEchoCancellation: true,
          enableNoiseSuppression: true,
          maxConcurrentCalls: 2
        };

      case 'basic':
        return {
          videoQuality: 'sd',
          audioQuality: 'medium',
          enableEchoCancellation: true,
          enableNoiseSuppression: false,
          maxConcurrentCalls: 1
        };

      case 'minimal':
        return {
          videoQuality: 'low',
          audioQuality: 'low',
          enableEchoCancellation: false,
          enableNoiseSuppression: false,
          maxConcurrentCalls: 1
        };

      case 'critical':
      default:
        return {
          videoQuality: 'none',
          audioQuality: 'low',
          enableEchoCancellation: false,
          enableNoiseSuppression: false,
          maxConcurrentCalls: 0
        };
    }
  }

  /**
   * Initialize feature detection
   */
  private initializeFeatures(): void {
    // Core Web APIs
    this.features.set('webAudio', {
      name: 'Web Audio API',
      supported: this.detectWebAudio(),
      required: true,
      priority: 10
    });

    this.features.set('webRTC', {
      name: 'WebRTC',
      supported: this.detectWebRTC(),
      required: false,
      priority: 9
    });

    this.features.set('speechRecognition', {
      name: 'Speech Recognition',
      supported: this.detectSpeechRecognition(),
      fallback: 'transcription',
      required: false,
      priority: 8
    });

    this.features.set('mediaDevices', {
      name: 'Media Devices API',
      supported: this.detectMediaDevices(),
      required: true,
      priority: 7
    });

    // Advanced features
    this.features.set('webGL', {
      name: 'WebGL',
      supported: this.detectWebGL(),
      fallback: 'canvas2d',
      required: false,
      priority: 6
    });

    this.features.set('webWorkers', {
      name: 'Web Workers',
      supported: this.detectWebWorkers(),
      fallback: 'main-thread',
      required: false,
      priority: 5
    });

    this.features.set('indexedDB', {
      name: 'IndexedDB',
      supported: this.detectIndexedDB(),
      fallback: 'localStorage',
      required: false,
      priority: 4
    });

    this.features.set('serviceWorker', {
      name: 'Service Worker',
      supported: this.detectServiceWorker(),
      fallback: 'no-cache',
      required: false,
      priority: 3
    });

    // Performance features
    this.features.set('highPerformance', {
      name: 'High Performance Device',
      supported: this.deviceCapabilities.cores >= 4 && this.deviceCapabilities.memory >= 4,
      fallback: 'low-power-mode',
      required: false,
      priority: 2
    });
  }

  /**
   * Detect device capabilities
   */
  private detectDeviceCapabilities(): DeviceCapabilities {
    const connection = (navigator as any).connection ||
                      (navigator as any).mozConnection ||
                      (navigator as any).webkitConnection;

    return {
      cores: navigator.hardwareConcurrency || 2,
      memory: (navigator as any).deviceMemory || 4,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      networkEffectiveType: connection?.effectiveType || 'unknown',
      networkDownlink: connection?.downlink || 0,
      networkRtt: connection?.rtt || 0
    };
  }

  // Feature detection methods
  private detectWebAudio(): boolean {
    return !!(window.AudioContext || (window as any).webkitAudioContext);
  }

  private detectWebRTC(): boolean {
    return !!(window.RTCPeerConnection || (window as any).webkitRTCPeerConnection);
  }

  private detectSpeechRecognition(): boolean {
    return !!(window.SpeechRecognition ||
              (window as any).webkitSpeechRecognition ||
              (window as any).mozSpeechRecognition);
  }

  private detectMediaDevices(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  private detectWebGL(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  }

  private detectWebWorkers(): boolean {
    return !!window.Worker;
  }

  private detectIndexedDB(): boolean {
    return !!window.indexedDB;
  }

  private detectServiceWorker(): boolean {
    return 'serviceWorker' in navigator;
  }
}

export interface DeviceCapabilities {
  cores: number;
  memory: number;
  platform: string;
  userAgent: string;
  language: string;
  cookieEnabled: boolean;
  onLine: boolean;
  networkEffectiveType: string;
  networkDownlink: number;
  networkRtt: number;
}

export interface RecommendedSettings {
  videoQuality: 'hd' | 'sd' | 'low' | 'none';
  audioQuality: 'high' | 'medium' | 'low';
  enableEchoCancellation: boolean;
  enableNoiseSuppression: boolean;
  maxConcurrentCalls: number;
}

// Singleton instance
export const featureManager = new FeatureManager();
