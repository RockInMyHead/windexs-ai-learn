/**
 * Экспорты для системы обнаружения эха TTS
 */

// Детекторы
export { TTSEchoDetector } from './TTSEchoDetector';
export { TextCorrelationDetector } from './TextCorrelationDetector';
export { SimpleMLEchoDetector } from './SimpleMLEchoDetector';

// Конфигурация
export {
  ECHO_DETECTION_CONFIG,
  isWebAudioSupported,
  shouldEnableFrequencyAnalysis,
  getEchoDetectionLevel
} from './config';

// Типы для TypeScript
export interface EchoDetectionResult {
  isEcho: boolean;
  confidence: number;
  method: 'text' | 'frequency' | 'ml' | 'combined';
  details: {
    textSimilarity: number;
    frequencySimilarity: number;
    mlProbability: number;
  };
}

export interface TTSProfile {
  dominantFrequencies: Array<{frequency: number, amplitude: number}>;
  spectralCentroid: number;
  rms: number;
  timestamp: number;
}
