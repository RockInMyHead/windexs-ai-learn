/**
 * Universal Speech Recognition Polyfill
 * Cross-browser speech recognition with fallbacks
 */

import { createError, ErrorCodes } from '../errorHandling';

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export interface SpeechRecognitionConfig {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  timeout?: number;
}

export interface SpeechRecognitionCallbacks {
  onStart?: () => void;
  onResult?: (result: SpeechRecognitionResult) => void;
  onError?: (error: Error) => void;
  onEnd?: () => void;
}

export class UniversalSpeechRecognition {
  private recognition: SpeechRecognition | null = null;
  private config: Required<SpeechRecognitionConfig>;
  private callbacks: SpeechRecognitionCallbacks;
  private isListening = false;
  private browserSupport: BrowserSupportInfo;
  private fallbackMode = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recognitionTimeout: NodeJS.Timeout | null = null;

  constructor(config: SpeechRecognitionConfig = {}, callbacks: SpeechRecognitionCallbacks = {}) {
    this.config = {
      lang: 'ru-RU',
      continuous: true,
      interimResults: true,
      maxAlternatives: 1,
      timeout: 30000,
      ...config
    };

    this.callbacks = callbacks;
    this.browserSupport = this.detectBrowserSupport();

    this.initializeRecognition();
  }

  /**
   * Start speech recognition
   */
  async start(): Promise<void> {
    if (this.isListening) {
      throw createError(ErrorCodes.VALIDATION_ERROR, 'Speech recognition is already active');
    }

    try {
      if (this.fallbackMode) {
        await this.startFallbackMode();
      } else {
        await this.startNativeMode();
      }

      this.isListening = true;

      // Set timeout
      if (this.config.timeout > 0) {
        this.recognitionTimeout = setTimeout(() => {
          this.stop();
          this.callbacks.onError?.(createError(
            ErrorCodes.TIMEOUT_ERROR,
            `Speech recognition timed out after ${this.config.timeout}ms`
          ));
        }, this.config.timeout);
      }

      this.callbacks.onStart?.();

    } catch (error) {
      this.isListening = false;
      throw createError(
        ErrorCodes.DEVICE_ERROR,
        'Failed to start speech recognition',
        true,
        error
      );
    }
  }

  /**
   * Stop speech recognition
   */
  stop(): void {
    if (!this.isListening) return;

    this.clearTimeout();

    if (this.fallbackMode) {
      this.stopFallbackMode();
    } else {
      this.stopNativeMode();
    }

    this.isListening = false;
    this.callbacks.onEnd?.();
  }

  /**
   * Abort speech recognition
   */
  abort(): void {
    if (!this.isListening) return;

    this.clearTimeout();

    if (this.fallbackMode) {
      this.abortFallbackMode();
    } else {
      this.abortNativeMode();
    }

    this.isListening = false;
    this.callbacks.onError?.(createError(
      ErrorCodes.VALIDATION_ERROR,
      'Speech recognition aborted by user'
    ));
  }

  /**
   * Check if currently listening
   */
  isActive(): boolean {
    return this.isListening;
  }

  /**
   * Get browser support information
   */
  getBrowserSupport(): BrowserSupportInfo {
    return this.browserSupport;
  }

  /**
   * Check if fallback mode is active
   */
  isFallbackMode(): boolean {
    return this.fallbackMode;
  }

  // Private methods

  private detectBrowserSupport(): BrowserSupportInfo {
    const ua = navigator.userAgent.toLowerCase();

    return {
      chrome: ua.includes('chrome') && !ua.includes('edg'),
      firefox: ua.includes('firefox'),
      safari: ua.includes('safari') && !ua.includes('chrome'),
      edge: ua.includes('edg'),
      webkitSpeechRecognition: typeof window.webkitSpeechRecognition !== 'undefined',
      mozSpeechRecognition: typeof window.mozSpeechRecognition !== 'undefined',
      standardSpeechRecognition: typeof window.SpeechRecognition !== 'undefined',
      mediaRecorder: typeof MediaRecorder !== 'undefined',
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    };
  }

  private initializeRecognition(): void {
    // Try to create native speech recognition first
    try {
      this.recognition = this.createNativeRecognition();

      if (this.recognition) {
        this.fallbackMode = false;
        this.configureNativeRecognition();
        console.log('✅ Native speech recognition initialized');
        return;
      }
    } catch (error) {
      console.warn('Native speech recognition failed:', error);
    }

    // Fallback to media recording + OpenAI Whisper
    if (this.browserSupport.mediaRecorder && this.browserSupport.getUserMedia) {
      this.fallbackMode = true;
      console.log('⚠️ Using fallback mode with OpenAI Whisper');
    } else {
      throw createError(
        ErrorCodes.BROWSER_NOT_SUPPORTED,
        'Speech recognition is not supported in this browser'
      );
    }
  }

  private createNativeRecognition(): SpeechRecognition | null {
    const RecognitionClass =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition ||
      window.mozSpeechRecognition;

    if (!RecognitionClass) return null;

    const recognition = new RecognitionClass();

    // Browser-specific configurations
    if (this.browserSupport.webkitSpeechRecognition) {
      // Safari/WebKit specific
      recognition.continuous = false; // Safari has issues with continuous mode
      recognition.interimResults = false;
    } else if (this.browserSupport.mozSpeechRecognition) {
      // Firefox specific
      recognition.continuous = this.config.continuous;
      recognition.interimResults = this.config.interimResults;
    } else {
      // Chrome/Edge
      recognition.continuous = this.config.continuous;
      recognition.interimResults = this.config.interimResults;
    }

    recognition.lang = this.config.lang;
    recognition.maxAlternatives = this.config.maxAlternatives;

    return recognition;
  }

  private configureNativeRecognition(): void {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      console.log('🎙️ Native speech recognition started');
      this.callbacks.onStart?.();
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript.trim();
      const confidence = result[0].confidence || 0.8;

      const speechResult: SpeechRecognitionResult = {
        transcript,
        confidence,
        isFinal: result.isFinal
      };

      console.log(`📝 Speech result: "${transcript}" (${confidence.toFixed(2)}) ${result.isFinal ? '[FINAL]' : '[INTERIM]'}`);
      this.callbacks.onResult?.(speechResult);
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('🎙️ Native speech recognition error:', event.error);

      let error = createError(
        ErrorCodes.DEVICE_ERROR,
        `Speech recognition error: ${event.error}`,
        this.isRecoverableError(event.error)
      );

      // Handle specific error types
      switch (event.error) {
        case 'not-allowed':
          error = createError(
            ErrorCodes.PERMISSION_DENIED,
            'Microphone access denied. Please allow microphone access and try again.',
            false
          );
          break;
        case 'no-speech':
          error = createError(
            ErrorCodes.DEVICE_ERROR,
            'No speech detected. Please speak clearly into the microphone.',
            true
          );
          break;
        case 'network':
          error = createError(
            ErrorCodes.NETWORK_ERROR,
            'Network error during speech recognition. Check your connection.',
            true
          );
          break;
      }

      this.callbacks.onError?.(error);
    };

    this.recognition.onend = () => {
      console.log('🎙️ Native speech recognition ended');
      this.isListening = false;
      this.callbacks.onEnd?.();
    };
  }

  private async startNativeMode(): Promise<void> {
    if (!this.recognition) {
      throw createError(ErrorCodes.DEVICE_ERROR, 'Native recognition not available');
    }

    return new Promise((resolve, reject) => {
      const originalOnStart = this.recognition!.onstart;
      const originalOnError = this.recognition!.onerror;

      this.recognition!.onstart = () => {
        this.recognition!.onstart = originalOnStart;
        resolve();
      };

      this.recognition!.onerror = (event) => {
        this.recognition!.onerror = originalOnError;
        reject(createError(
          ErrorCodes.DEVICE_ERROR,
          `Failed to start speech recognition: ${event.error}`
        ));
      };

      try {
        this.recognition!.start();
      } catch (error) {
        reject(createError(
          ErrorCodes.DEVICE_ERROR,
          'Failed to start speech recognition',
          true,
          error
        ));
      }
    });
  }

  private stopNativeMode(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.warn('Error stopping native recognition:', error);
      }
    }
  }

  private abortNativeMode(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (error) {
        console.warn('Error aborting native recognition:', error);
      }
    }
  }

  private async startFallbackMode(): Promise<void> {
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });

      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        await this.processFallbackAudio();
      };

      this.mediaRecorder.onerror = (event) => {
        this.callbacks.onError?.(createError(
          ErrorCodes.DEVICE_ERROR,
          'Media recording error',
          true,
          event
        ));
      };

      // Start recording
      this.mediaRecorder.start(100); // Collect data every 100ms

      console.log('🎙️ Fallback speech recognition started');

    } catch (error) {
      throw createError(
        ErrorCodes.PERMISSION_DENIED,
        'Failed to access microphone for speech recognition',
        true,
        error
      );
    }
  }

  private stopFallbackMode(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }

  private abortFallbackMode(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      // Clear recorded chunks
      this.audioChunks = [];
    }
  }

  private async processFallbackAudio(): Promise<void> {
    if (this.audioChunks.length === 0) {
      this.callbacks.onError?.(createError(
        ErrorCodes.DEVICE_ERROR,
        'No audio data recorded'
      ));
      return;
    }

    try {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

      // Send to OpenAI Whisper API
      const transcript = await this.transcribeWithWhisper(audioBlob);

      const speechResult: SpeechRecognitionResult = {
        transcript,
        confidence: 0.9, // Whisper typically has high confidence
        isFinal: true
      };

      this.callbacks.onResult?.(speechResult);

    } catch (error) {
      this.callbacks.onError?.(createError(
        ErrorCodes.API_ERROR,
        'Failed to transcribe audio',
        true,
        error
      ));
    } finally {
      this.audioChunks = [];
    }
  }

  private async transcribeWithWhisper(audioBlob: Blob): Promise<string> {
    const API_URL = import.meta.env.VITE_API_URL || 'https://teacher.windexs.ru/api';
    const token = localStorage.getItem('token'); // TODO: Get from auth context

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    const response = await fetch(`${API_URL}/transcribe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Whisper API error: ${response.status}`);
    }

    const result = await response.json();
    return result.transcript || '';
  }

  private isRecoverableError(error: string): boolean {
    const recoverableErrors = ['no-speech', 'network', 'not-allowed'];
    return recoverableErrors.includes(error);
  }

  private clearTimeout(): void {
    if (this.recognitionTimeout) {
      clearTimeout(this.recognitionTimeout);
      this.recognitionTimeout = null;
    }
  }
}

interface BrowserSupportInfo {
  chrome: boolean;
  firefox: boolean;
  safari: boolean;
  edge: boolean;
  webkitSpeechRecognition: boolean;
  mozSpeechRecognition: boolean;
  standardSpeechRecognition: boolean;
  mediaRecorder: boolean;
  getUserMedia: boolean;
}

// Factory function for easy creation
export function createUniversalSpeechRecognition(
  config?: SpeechRecognitionConfig,
  callbacks?: SpeechRecognitionCallbacks
): UniversalSpeechRecognition {
  return new UniversalSpeechRecognition(config, callbacks);
}
