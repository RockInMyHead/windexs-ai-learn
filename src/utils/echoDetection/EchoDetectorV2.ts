/**
 * Echo Detection System v2.0
 * Advanced multi-modal echo detection with ML classification
 */

import { webAudioPolyfill, AudioAnalysisResult } from '../browserCompatibility/WebAudioPolyfill';
import { TTSEchoDetector } from './TTSEchoDetector';
import { TextCorrelationDetector } from './TextCorrelationDetector';
import { SimpleMLEchoDetector } from './SimpleMLEchoDetector';
import { ECHO_DETECTION_CONFIG } from './config';

export interface EchoDetectionResult {
  isEcho: boolean;
  confidence: number;
  method: 'text' | 'frequency' | 'ml' | 'combined';
  details: {
    textSimilarity: number;
    frequencySimilarity: number;
    mlProbability: number;
    combinedScore: number;
  };
  metadata: {
    timestamp: number;
    processingTime: number;
    audioFeatures?: AudioAnalysisResult;
  };
}

export interface TTSAudioProfile {
  text: string;
  audioFeatures: AudioAnalysisResult;
  timestamp: number;
  duration: number;
}

export class EchoDetectorV2 {
  private ttsEchoDetector: TTSEchoDetector;
  private textCorrelationDetector: TextCorrelationDetector;
  private mlEchoDetector: SimpleMLEchoDetector;
  private ttsProfiles: TTSAudioProfile[] = [];
  private isInitialized = false;

  constructor() {
    this.ttsEchoDetector = new TTSEchoDetector();
    this.textCorrelationDetector = new TextCorrelationDetector();
    this.mlEchoDetector = new SimpleMLEchoDetector();
  }

  /**
   * Initialize the echo detection system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize Web Audio for frequency analysis
      await webAudioPolyfill.initialize();

      // Initialize ML detector
      await this.mlEchoDetector.initialize();

      this.isInitialized = true;
      console.log('✅ Echo Detection v2.0 initialized');

    } catch (error) {
      console.error('❌ Failed to initialize Echo Detection v2.0:', error);
      throw error;
    }
  }

  /**
   * Profile TTS audio for future echo detection
   */
  async profileTTSAudio(text: string, audioBuffer: AudioBuffer): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Echo detector not initialized');
    }

    try {
      const startTime = Date.now();

      // Analyze audio features
      const audioFeatures = await this.analyzeAudioBuffer(audioBuffer);

      const profile: TTSAudioProfile = {
        text: text.toLowerCase().trim(),
        audioFeatures,
        timestamp: startTime,
        duration: audioBuffer.duration * 1000 // Convert to milliseconds
      };

      // Store profile (keep last 10 for memory efficiency)
      this.ttsProfiles.push(profile);
      if (this.ttsProfiles.length > 10) {
        this.ttsProfiles.shift();
      }

      console.log(`📊 TTS profile created: "${text.substring(0, 50)}..." (${profile.duration}ms)`);

    } catch (error) {
      console.error('❌ Failed to profile TTS audio:', error);
    }
  }

  /**
   * Detect echo in user input
   */
  async detectEcho(
    userText: string,
    userAudioBuffer?: AudioBuffer
  ): Promise<EchoDetectionResult> {
    if (!this.isInitialized) {
      throw new Error('Echo detector not initialized');
    }

    const startTime = Date.now();
    const results: Partial<EchoDetectionResult['details']> = {};

    try {
      // 1. Text-based detection
      const textSimilarities = this.ttsProfiles.map(profile => ({
        text: profile.text,
        similarity: this.calculateTextSimilarity(userText.toLowerCase().trim(), profile.text),
        profile
      }));

      const bestTextMatch = textSimilarities.reduce((best, current) =>
        current.similarity > best.similarity ? current : best
      , { similarity: 0, text: '', profile: null as any });

      results.textSimilarity = bestTextMatch.similarity;

      // 2. Frequency-based detection (if audio provided)
      let frequencySimilarity = 0;
      let userAudioFeatures: AudioAnalysisResult | undefined;

      if (userAudioBuffer) {
        userAudioFeatures = await this.analyzeAudioBuffer(userAudioBuffer);

        // Compare with recent TTS profiles
        const frequencySimilarities = await Promise.all(
          this.ttsProfiles.slice(-3).map(async (profile) => {
            const similarity = this.calculateFrequencySimilarity(userAudioFeatures!, profile.audioFeatures);
            return similarity;
          })
        );

        frequencySimilarity = Math.max(...frequencySimilarities);
      }

      results.frequencySimilarity = frequencySimilarity;

      // 3. ML-based detection
      const mlFeatures = this.extractMLFeatures(userText, userAudioFeatures);
      const mlProbability = await this.mlEchoDetector.predict(mlFeatures);

      results.mlProbability = mlProbability;

      // 4. Combined decision
      const combinedScore = this.calculateCombinedScore(results as any);

      const isEcho = combinedScore > ECHO_DETECTION_CONFIG.TEXT_SIMILARITY_THRESHOLD;
      const primaryMethod = this.determinePrimaryMethod(results as any);

      const result: EchoDetectionResult = {
        isEcho,
        confidence: combinedScore,
        method: primaryMethod,
        details: {
          textSimilarity: results.textSimilarity!,
          frequencySimilarity: results.frequencySimilarity!,
          mlProbability: results.mlProbability!,
          combinedScore
        },
        metadata: {
          timestamp: Date.now(),
          processingTime: Date.now() - startTime,
          audioFeatures: userAudioFeatures
        }
      };

      // Log detection result
      console.log(`🔍 Echo detection: ${isEcho ? 'ECHO' : 'VOICE'} (${(combinedScore * 100).toFixed(1)}% confidence, method: ${primaryMethod})`);

      return result;

    } catch (error) {
      console.error('❌ Echo detection failed:', error);

      // Return safe fallback result
      return {
        isEcho: false,
        confidence: 0,
        method: 'combined',
        details: {
          textSimilarity: 0,
          frequencySimilarity: 0,
          mlProbability: 0,
          combinedScore: 0
        },
        metadata: {
          timestamp: Date.now(),
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Clean up old TTS profiles
   */
  cleanupOldProfiles(maxAge: number = 30000): void { // 30 seconds default
    const cutoffTime = Date.now() - maxAge;
    const initialCount = this.ttsProfiles.length;

    this.ttsProfiles = this.ttsProfiles.filter(profile => profile.timestamp > cutoffTime);

    const removedCount = initialCount - this.ttsProfiles.length;
    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} old TTS profiles`);
    }
  }

  /**
   * Get current TTS profiles for debugging
   */
  getTTSProfiles(): TTSAudioProfile[] {
    return [...this.ttsProfiles];
  }

  /**
   * Reset the detector
   */
  reset(): void {
    this.ttsProfiles = [];
    console.log('🔄 Echo detector reset');
  }

  // Private methods

  private async analyzeAudioBuffer(audioBuffer: AudioBuffer): Promise<AudioAnalysisResult> {
    // Convert AudioBuffer to Float32Array for analysis
    const channelData = audioBuffer.getChannelData(0);

    // Simple analysis (in production, you'd use Web Audio API for more sophisticated analysis)
    let rms = 0;
    let peak = 0;
    let zeroCrossings = 0;

    for (let i = 0; i < channelData.length; i++) {
      const sample = channelData[i];
      rms += sample * sample;
      peak = Math.max(peak, Math.abs(sample));

      if (i > 0) {
        const prevSample = channelData[i - 1];
        if ((sample > 0 && prevSample <= 0) || (sample < 0 && prevSample >= 0)) {
          zeroCrossings++;
        }
      }
    }

    rms = Math.sqrt(rms / channelData.length);

    // Mock spectral centroid and dominant frequencies
    // In production, use FFT analysis
    const spectralCentroid = 2000; // Mock value
    const dominantFrequencies = [
      { frequency: 800, amplitude: 0.8 },
      { frequency: 1200, amplitude: 0.6 },
      { frequency: 2400, amplitude: 0.4 }
    ];

    return {
      rms,
      spectralCentroid,
      dominantFrequencies,
      zeroCrossings,
      isSilent: rms < 0.01,
      peakAmplitude: peak
    };
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    return this.textCorrelationDetector.calculateSimilarity(text1, text2);
  }

  private calculateFrequencySimilarity(
    features1: AudioAnalysisResult,
    features2: AudioAnalysisResult
  ): number {
    // Simple frequency similarity based on dominant frequencies
    const freqs1 = features1.dominantFrequencies;
    const freqs2 = features2.dominantFrequencies;

    if (freqs1.length === 0 || freqs2.length === 0) return 0;

    let totalSimilarity = 0;
    let comparisons = 0;

    // Compare each frequency from features1 with closest in features2
    freqs1.forEach(freq1 => {
      const closest = freqs2.reduce((prev, curr) => {
        const prevDiff = Math.abs(prev.frequency - freq1.frequency);
        const currDiff = Math.abs(curr.frequency - freq1.frequency);
        return currDiff < prevDiff ? curr : prev;
      });

      const freqDiff = Math.abs(closest.frequency - freq1.frequency);
      const ampDiff = Math.abs(closest.amplitude - freq1.amplitude);

      // Frequency tolerance: 200Hz, amplitude tolerance: 0.3
      const freqSimilarity = Math.max(0, 1 - (freqDiff / 200));
      const ampSimilarity = Math.max(0, 1 - (ampDiff / 0.3));

      totalSimilarity += (freqSimilarity + ampSimilarity) / 2;
      comparisons++;
    });

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  private extractMLFeatures(text: string, audioFeatures?: AudioAnalysisResult): number[] {
    const features: number[] = [];

    // Text features
    features.push(text.length);
    features.push((text.match(/[а-я]/gi) || []).length); // Cyrillic characters
    features.push((text.match(/\s/g) || []).length); // Spaces
    features.push((text.match(/[.!?]/g) || []).length); // Punctuation

    // Audio features (if available)
    if (audioFeatures) {
      features.push(audioFeatures.rms);
      features.push(audioFeatures.spectralCentroid);
      features.push(audioFeatures.zeroCrossings);
      features.push(audioFeatures.peakAmplitude);
      features.push(audioFeatures.dominantFrequencies.length);
    } else {
      // Default values when no audio
      features.push(0, 0, 0, 0, 0);
    }

    return features;
  }

  private calculateCombinedScore(details: EchoDetectionResult['details']): number {
    const weights = ECHO_DETECTION_CONFIG.FEATURE_WEIGHTS;

    return (
      details.textSimilarity * weights.textCorrelation +
      details.frequencySimilarity * weights.frequencyAnalysis +
      details.mlProbability * weights.mlClassification
    );
  }

  private determinePrimaryMethod(details: EchoDetectionResult['details']): 'text' | 'frequency' | 'ml' | 'combined' {
    const { textSimilarity, frequencySimilarity, mlProbability } = details;

    // Determine which method contributed most
    if (textSimilarity > frequencySimilarity && textSimilarity > mlProbability) {
      return 'text';
    } else if (frequencySimilarity > mlProbability) {
      return 'frequency';
    } else if (mlProbability > 0.5) {
      return 'ml';
    } else {
      return 'combined';
    }
  }
}

// Singleton instance
export const echoDetectorV2 = new EchoDetectorV2();
