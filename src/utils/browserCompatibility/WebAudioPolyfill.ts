/**
 * Web Audio API Polyfill with Browser Optimizations
 * Cross-browser Web Audio API with optimized configurations
 */

import { browserDetector } from './browserDetector';

export interface AudioAnalysisResult {
  rms: number;
  spectralCentroid: number;
  dominantFrequencies: Array<{ frequency: number; amplitude: number }>;
  zeroCrossings: number;
  isSilent: boolean;
  peakAmplitude: number;
}

export class WebAudioPolyfill {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphoneSource: MediaStreamAudioSourceNode | null = null;
  private frequencyData: Uint8Array | null = null;
  private timeData: Uint8Array | null = null;
  private isInitialized = false;
  private optimizations: any;

  constructor() {
    this.optimizations = browserDetector.getOptimizations().webAudio;
  }

  /**
   * Initialize Web Audio context
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Create AudioContext with browser-specific settings
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error('Web Audio API is not supported');
      }

      this.audioContext = new AudioContextClass();

      // Resume context if suspended (required by some browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create analyser with optimized settings
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.optimizations.fftSize;
      this.analyser.smoothingTimeConstant = this.optimizations.smoothingTimeConstant;

      // Initialize data arrays
      const bufferLength = this.analyser.frequencyBinCount;
      this.frequencyData = new Uint8Array(bufferLength);
      this.timeData = new Uint8Array(bufferLength);

      this.isInitialized = true;
      console.log('✅ Web Audio API initialized with optimizations');

    } catch (error) {
      console.error('❌ Failed to initialize Web Audio API:', error);
      throw error;
    }
  }

  /**
   * Connect microphone to analyser
   */
  async connectMicrophone(stream: MediaStream): Promise<void> {
    if (!this.isInitialized || !this.audioContext || !this.analyser) {
      throw new Error('Web Audio API not initialized');
    }

    try {
      // Create microphone source
      this.microphoneSource = this.audioContext.createMediaStreamSource(stream);

      // Connect to analyser
      this.microphoneSource.connect(this.analyser);

      console.log('🎤 Microphone connected to Web Audio analyser');

    } catch (error) {
      console.error('❌ Failed to connect microphone:', error);
      throw error;
    }
  }

  /**
   * Disconnect microphone
   */
  disconnectMicrophone(): void {
    if (this.microphoneSource) {
      try {
        this.microphoneSource.disconnect();
        this.microphoneSource = null;
        console.log('🎤 Microphone disconnected from Web Audio analyser');
      } catch (error) {
        console.warn('Error disconnecting microphone:', error);
      }
    }
  }

  /**
   * Analyze current audio data
   */
  analyzeAudio(): AudioAnalysisResult {
    if (!this.isInitialized || !this.analyser || !this.frequencyData || !this.timeData) {
      throw new Error('Web Audio API not properly initialized');
    }

    // Get frequency and time domain data
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.timeData);

    // Calculate RMS (Root Mean Square)
    const rms = this.calculateRMS();

    // Calculate spectral centroid
    const spectralCentroid = this.calculateSpectralCentroid();

    // Find dominant frequencies
    const dominantFrequencies = this.findDominantFrequencies();

    // Calculate zero crossings
    const zeroCrossings = this.calculateZeroCrossings();

    // Determine if audio is silent
    const isSilent = rms < 0.01; // Very low threshold

    // Find peak amplitude
    const peakAmplitude = this.calculatePeakAmplitude();

    return {
      rms,
      spectralCentroid,
      dominantFrequencies,
      zeroCrossings,
      isSilent,
      peakAmplitude
    };
  }

  /**
   * Create audio buffer from array
   */
  createBuffer(audioData: Float32Array, sampleRate: number = 44100): AudioBuffer {
    if (!this.audioContext) {
      throw new Error('Audio context not initialized');
    }

    const buffer = this.audioContext.createBuffer(1, audioData.length, sampleRate);
    buffer.getChannelData(0).set(audioData);
    return buffer;
  }

  /**
   * Play audio buffer
   */
  async playBuffer(buffer: AudioBuffer): Promise<void> {
    if (!this.audioContext) {
      throw new Error('Audio context not initialized');
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    return new Promise((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  }

  /**
   * Create oscillator for testing
   */
  createOscillator(frequency: number = 440, type: OscillatorType = 'sine'): OscillatorNode {
    if (!this.audioContext) {
      throw new Error('Audio context not initialized');
    }

    const oscillator = this.audioContext.createOscillator();
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    oscillator.type = type;

    return oscillator;
  }

  /**
   * Get current audio context
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Get analyser node
   */
  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.audioContext?.state === 'running';
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.disconnectMicrophone();

    if (this.audioContext) {
      this.audioContext.close().catch(console.warn);
      this.audioContext = null;
    }

    this.analyser = null;
    this.frequencyData = null;
    this.timeData = null;
    this.isInitialized = false;

    console.log('🧹 Web Audio API resources cleaned up');
  }

  // Private calculation methods

  private calculateRMS(): number {
    if (!this.timeData) return 0;

    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const sample = (this.timeData[i] - 128) / 128; // Convert to -1 to 1 range
      sum += sample * sample;
    }
    return Math.sqrt(sum / this.timeData.length);
  }

  private calculateSpectralCentroid(): number {
    if (!this.frequencyData) return 0;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < this.frequencyData.length; i++) {
      const magnitude = this.frequencyData[i];
      const frequency = (i * this.audioContext!.sampleRate) / (2 * this.frequencyData.length);

      numerator += frequency * magnitude;
      denominator += magnitude;
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private findDominantFrequencies(): Array<{ frequency: number; amplitude: number }> {
    if (!this.frequencyData || !this.audioContext) return [];

    const peaks: Array<{ frequency: number; amplitude: number }> = [];
    const minAmplitude = 180; // Threshold for peaks

    for (let i = 1; i < this.frequencyData.length - 1; i++) {
      const amplitude = this.frequencyData[i];
      const prevAmplitude = this.frequencyData[i - 1];
      const nextAmplitude = this.frequencyData[i + 1];

      if (amplitude > minAmplitude && amplitude > prevAmplitude && amplitude > nextAmplitude) {
        const frequency = (i * this.audioContext.sampleRate) / (2 * this.frequencyData.length);
        peaks.push({ frequency, amplitude });
      }
    }

    // Return top 5 peaks
    return peaks
      .sort((a, b) => b.amplitude - a.amplitude)
      .slice(0, 5);
  }

  private calculateZeroCrossings(): number {
    if (!this.timeData) return 0;

    let crossings = 0;
    for (let i = 1; i < this.timeData.length; i++) {
      const current = this.timeData[i] - 128;
      const previous = this.timeData[i - 1] - 128;

      if ((current > 0 && previous <= 0) || (current < 0 && previous >= 0)) {
        crossings++;
      }
    }
    return crossings;
  }

  private calculatePeakAmplitude(): number {
    if (!this.timeData) return 0;

    let peak = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const amplitude = Math.abs(this.timeData[i] - 128);
      if (amplitude > peak) {
        peak = amplitude;
      }
    }
    return peak / 128; // Normalize to 0-1 range
  }
}

// Singleton instance
export const webAudioPolyfill = new WebAudioPolyfill();

// Utility functions
export async function initializeWebAudio(): Promise<WebAudioPolyfill> {
  await webAudioPolyfill.initialize();
  return webAudioPolyfill;
}

export function createAudioAnalysis(result: AudioAnalysisResult): AudioAnalysisResult {
  return { ...result };
}

export function isAudioSilent(result: AudioAnalysisResult, threshold: number = 0.01): boolean {
  return result.rms < threshold;
}

export function getAudioLoudness(result: AudioAnalysisResult): 'silent' | 'quiet' | 'normal' | 'loud' {
  const rms = result.rms;

  if (rms < 0.01) return 'silent';
  if (rms < 0.05) return 'quiet';
  if (rms < 0.2) return 'normal';
  return 'loud';
}

export function detectVoiceActivity(result: AudioAnalysisResult): boolean {
  // Simple voice activity detection based on multiple factors
  const hasEnergy = result.rms > 0.02;
  const hasZeroCrossings = result.zeroCrossings > 100; // Voice typically has many zero crossings
  const hasFormants = result.dominantFrequencies.length > 0;

  return hasEnergy && hasZeroCrossings && hasFormants;
}
