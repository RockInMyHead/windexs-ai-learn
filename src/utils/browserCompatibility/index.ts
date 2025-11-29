/**
 * Browser Compatibility Module
 * Cross-browser support and optimizations
 */

// Universal Speech Recognition
export { UniversalSpeechRecognition, createUniversalSpeechRecognition } from './UniversalSpeechRecognition';
export type { SpeechRecognitionResult, SpeechRecognitionConfig, SpeechRecognitionCallbacks } from './UniversalSpeechRecognition';

// Browser Detection
export { BrowserDetector, browserDetector } from './browserDetector';
export {
  getBrowserInfo,
  getBrowserCapabilities,
  getBrowserOptimizations,
  isBrowserSupported,
  getPerformanceScore,
  getRecommendedSettings
} from './browserDetector';
export type { BrowserInfo, BrowserCapabilities, BrowserOptimizations } from './browserDetector';

// Web Audio Polyfill
export { WebAudioPolyfill, webAudioPolyfill } from './WebAudioPolyfill';
export {
  initializeWebAudio,
  createAudioAnalysis,
  isAudioSilent,
  getAudioLoudness,
  detectVoiceActivity
} from './WebAudioPolyfill';
export type { AudioAnalysisResult } from './WebAudioPolyfill';

// Compatibility utilities
export function checkBrowserCompatibility(): {
  supported: boolean;
  issues: string[];
  recommendations: string[];
} {
  const browserInfo = getBrowserInfo();
  const capabilities = getBrowserCapabilities();
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Critical features
  if (!capabilities.webAudio) {
    issues.push('Web Audio API не поддерживается');
    recommendations.push('Используйте современный браузер (Chrome 60+, Firefox 60+, Safari 14+)');
  }

  if (!capabilities.speechRecognition && !capabilities.mediaRecorder) {
    issues.push('Speech Recognition недоступен');
    recommendations.push('Используйте Chrome для лучшей поддержки голосовых функций');
  }

  if (!capabilities.webRTC) {
    issues.push('WebRTC не поддерживается');
    recommendations.push('Видеозвонки будут недоступны в этом браузере');
  }

  // Performance warnings
  if (capabilities.hardwareConcurrency < 4) {
    issues.push('Низкая производительность CPU');
    recommendations.push('Закройте другие вкладки для лучшей производительности');
  }

  if (capabilities.deviceMemory < 4) {
    issues.push('Недостаточно оперативной памяти');
    recommendations.push('Освободите память, закрыв другие приложения');
  }

  return {
    supported: issues.length === 0,
    issues,
    recommendations
  };
}

export function getBrowserSpecificConfig() {
  const browserInfo = getBrowserInfo();
  const optimizations = getBrowserOptimizations();

  return {
    browser: browserInfo,
    speechRecognition: optimizations.speechRecognition,
    webRTC: optimizations.webRTC,
    webAudio: optimizations.webAudio,
    canvas: optimizations.canvas,
    performance: getPerformanceScore(),
    recommendedSettings: getRecommendedSettings()
  };
}
