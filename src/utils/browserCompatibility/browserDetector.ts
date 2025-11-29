/**
 * Browser Detection and Feature Support
 * Comprehensive browser detection and capability assessment
 */

export interface BrowserInfo {
  name: 'chrome' | 'firefox' | 'safari' | 'edge' | 'opera' | 'unknown';
  version: number;
  majorVersion: number;
  engine: 'blink' | 'gecko' | 'webkit' | 'unknown';
  platform: 'desktop' | 'mobile' | 'tablet';
  isMobile: boolean;
  isDesktop: boolean;
  isTablet: boolean;
}

export interface BrowserCapabilities {
  webRTC: boolean;
  webAudio: boolean;
  speechRecognition: boolean;
  mediaRecorder: boolean;
  webGL: boolean;
  webWorkers: boolean;
  indexedDB: boolean;
  serviceWorker: boolean;
  webAssembly: boolean;
  sharedArrayBuffer: boolean;
  highPerformanceCanvas: boolean;
  hardwareConcurrency: number;
  deviceMemory: number;
}

export interface BrowserOptimizations {
  speechRecognition: {
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    timeout: number;
  };
  webRTC: {
    iceServers: RTCIceServer[];
    bundlePolicy: 'balanced' | 'max-compat' | 'max-bundle';
    rtcpMuxPolicy: 'negotiate' | 'require';
  };
  webAudio: {
    fftSize: number;
    smoothingTimeConstant: number;
  };
  canvas: {
    willReadFrequently: boolean;
    alpha: boolean;
  };
}

export class BrowserDetector {
  private static instance: BrowserDetector;
  private browserInfo: BrowserInfo;
  private capabilities: BrowserCapabilities;
  private optimizations: BrowserOptimizations;

  private constructor() {
    this.browserInfo = this.detectBrowser();
    this.capabilities = this.detectCapabilities();
    this.optimizations = this.getOptimizations();
  }

  static getInstance(): BrowserDetector {
    if (!BrowserDetector.instance) {
      BrowserDetector.instance = new BrowserDetector();
    }
    return BrowserDetector.instance;
  }

  getBrowserInfo(): BrowserInfo {
    return this.browserInfo;
  }

  getCapabilities(): BrowserCapabilities {
    return this.capabilities;
  }

  getOptimizations(): BrowserOptimizations {
    return this.optimizations;
  }

  isSupported(feature: keyof BrowserCapabilities): boolean {
    return this.capabilities[feature] === true;
  }

  getPerformanceScore(): number {
    let score = 0;

    // Hardware capabilities
    if (this.capabilities.hardwareConcurrency >= 8) score += 20;
    else if (this.capabilities.hardwareConcurrency >= 4) score += 15;
    else if (this.capabilities.hardwareConcurrency >= 2) score += 10;

    if (this.capabilities.deviceMemory >= 8) score += 20;
    else if (this.capabilities.deviceMemory >= 4) score += 15;
    else if (this.capabilities.deviceMemory >= 2) score += 10;

    // Feature support
    if (this.capabilities.webRTC) score += 15;
    if (this.capabilities.webAudio) score += 10;
    if (this.capabilities.speechRecognition) score += 10;
    if (this.capabilities.webGL) score += 10;
    if (this.capabilities.webWorkers) score += 5;
    if (this.capabilities.serviceWorker) score += 5;
    if (this.capabilities.webAssembly) score += 5;

    // Browser-specific bonuses
    if (this.browserInfo.name === 'chrome') score += 5;
    if (this.browserInfo.name === 'firefox') score += 3;
    if (this.browserInfo.name === 'safari' && this.browserInfo.majorVersion >= 14) score += 3;

    return Math.min(100, score);
  }

  private detectBrowser(): BrowserInfo {
    const ua = navigator.userAgent;

    // Browser detection
    let name: BrowserInfo['name'] = 'unknown';
    let version = 0;
    let engine: BrowserInfo['engine'] = 'unknown';

    if (ua.includes('Chrome') && !ua.includes('Edg')) {
      name = 'chrome';
      engine = 'blink';
      const match = ua.match(/Chrome\/(\d+)/);
      version = match ? parseInt(match[1]) : 0;
    } else if (ua.includes('Firefox')) {
      name = 'firefox';
      engine = 'gecko';
      const match = ua.match(/Firefox\/(\d+)/);
      version = match ? parseInt(match[1]) : 0;
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      name = 'safari';
      engine = 'webkit';
      const match = ua.match(/Version\/(\d+)/);
      version = match ? parseInt(match[1]) : 0;
    } else if (ua.includes('Edg')) {
      name = 'edge';
      engine = 'blink';
      const match = ua.match(/Edg\/(\d+)/);
      version = match ? parseInt(match[1]) : 0;
    } else if (ua.includes('Opera')) {
      name = 'opera';
      engine = 'blink';
      const match = ua.match(/Opera\/(\d+)/);
      version = match ? parseInt(match[1]) : 0;
    }

    // Platform detection
    let platform: BrowserInfo['platform'] = 'desktop';
    let isMobile = false;
    let isTablet = false;

    if (/Android/i.test(ua)) {
      platform = /Mobile/i.test(ua) ? 'mobile' : 'tablet';
      isMobile = platform === 'mobile';
      isTablet = platform === 'tablet';
    } else if (/iPad|iPhone|iPod/.test(ua)) {
      platform = /iPad/.test(ua) ? 'tablet' : 'mobile';
      isMobile = platform === 'mobile';
      isTablet = platform === 'tablet';
    }

    const isDesktop = !isMobile && !isTablet;

    return {
      name,
      version,
      majorVersion: Math.floor(version / 10) * 10,
      engine,
      platform,
      isMobile,
      isDesktop,
      isTablet
    };
  }

  private detectCapabilities(): BrowserCapabilities {
    return {
      webRTC: this.detectWebRTC(),
      webAudio: this.detectWebAudio(),
      speechRecognition: this.detectSpeechRecognition(),
      mediaRecorder: this.detectMediaRecorder(),
      webGL: this.detectWebGL(),
      webWorkers: this.detectWebWorkers(),
      indexedDB: this.detectIndexedDB(),
      serviceWorker: this.detectServiceWorker(),
      webAssembly: this.detectWebAssembly(),
      sharedArrayBuffer: this.detectSharedArrayBuffer(),
      highPerformanceCanvas: this.detectHighPerformanceCanvas(),
      hardwareConcurrency: navigator.hardwareConcurrency || 2,
      deviceMemory: (navigator as any).deviceMemory || 4
    };
  }

  private getOptimizations(): BrowserOptimizations {
    const { name, majorVersion } = this.browserInfo;

    return {
      speechRecognition: this.getSpeechRecognitionOptimizations(),
      webRTC: this.getWebRTCOptimizations(),
      webAudio: this.getWebAudioOptimizations(),
      canvas: this.getCanvasOptimizations()
    };
  }

  private getSpeechRecognitionOptimizations() {
    const { name } = this.browserInfo;

    switch (name) {
      case 'safari':
        return {
          continuous: false, // Safari has issues with continuous mode
          interimResults: false,
          maxAlternatives: 1,
          timeout: 10000
        };

      case 'firefox':
        return {
          continuous: true,
          interimResults: true,
          maxAlternatives: 1,
          timeout: 15000
        };

      case 'chrome':
      case 'edge':
      default:
        return {
          continuous: true,
          interimResults: true,
          maxAlternatives: 1,
          timeout: 30000
        };
    }
  }

  private getWebRTCOptimizations() {
    const { name } = this.browserInfo;

    const baseConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      bundlePolicy: 'balanced' as const,
      rtcpMuxPolicy: 'require' as const
    };

    switch (name) {
      case 'safari':
        return {
          ...baseConfig,
          bundlePolicy: 'max-compat' as const,
          rtcpMuxPolicy: 'negotiate' as const
        };

      case 'firefox':
        return {
          ...baseConfig,
          bundlePolicy: 'max-bundle' as const
        };

      default:
        return baseConfig;
    }
  }

  private getWebAudioOptimizations() {
    const { name } = this.browserInfo;

    switch (name) {
      case 'safari':
        return {
          fftSize: 2048,
          smoothingTimeConstant: 0.9
        };

      case 'firefox':
        return {
          fftSize: 4096,
          smoothingTimeConstant: 0.7
        };

      default:
        return {
          fftSize: 2048,
          smoothingTimeConstant: 0.8
        };
    }
  }

  private getCanvasOptimizations() {
    const { name } = this.browserInfo;

    switch (name) {
      case 'firefox':
        return {
          willReadFrequently: true,
          alpha: true
        };

      default:
        return {
          willReadFrequently: false,
          alpha: true
        };
    }
  }

  // Feature detection methods
  private detectWebRTC(): boolean {
    return !!(window.RTCPeerConnection || (window as any).webkitRTCPeerConnection);
  }

  private detectWebAudio(): boolean {
    return !!(window.AudioContext || (window as any).webkitAudioContext);
  }

  private detectSpeechRecognition(): boolean {
    return !!(window.SpeechRecognition ||
              (window as any).webkitSpeechRecognition ||
              (window as any).mozSpeechRecognition);
  }

  private detectMediaRecorder(): boolean {
    return typeof MediaRecorder !== 'undefined';
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

  private detectWebAssembly(): boolean {
    return typeof WebAssembly !== 'undefined';
  }

  private detectSharedArrayBuffer(): boolean {
    return typeof SharedArrayBuffer !== 'undefined';
  }

  private detectHighPerformanceCanvas(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      return !!ctx;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const browserDetector = BrowserDetector.getInstance();

// Utility functions
export function getBrowserInfo(): BrowserInfo {
  return browserDetector.getBrowserInfo();
}

export function getBrowserCapabilities(): BrowserCapabilities {
  return browserDetector.getCapabilities();
}

export function getBrowserOptimizations(): BrowserOptimizations {
  return browserDetector.getOptimizations();
}

export function isBrowserSupported(): boolean {
  const capabilities = browserDetector.getCapabilities();
  return capabilities.webAudio && (capabilities.speechRecognition || capabilities.mediaRecorder);
}

export function getPerformanceScore(): number {
  return browserDetector.getPerformanceScore();
}

export function getRecommendedSettings() {
  const capabilities = browserDetector.getCapabilities();
  const optimizations = browserDetector.getOptimizations();

  return {
    video: capabilities.webRTC ? 'enabled' : 'disabled',
    audio: capabilities.webAudio ? 'enabled' : 'disabled',
    speechRecognition: capabilities.speechRecognition ? 'native' : 'fallback',
    webWorkers: capabilities.webWorkers ? 'enabled' : 'disabled',
    speechRecognitionConfig: optimizations.speechRecognition,
    webRTCConfig: optimizations.webRTC
  };
}
