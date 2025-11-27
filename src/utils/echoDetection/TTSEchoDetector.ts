/**
 * Детектор эха TTS на основе частотного анализа
 * Анализирует характеристики звука для определения является ли он эхом TTS
 */
export class TTSEchoDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private ttsFrequencyProfile: any = null;
  private isInitialized = false;

  /**
   * Инициализация Web Audio API
   */
  async initialize(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      this.isInitialized = true;
      console.log('🎵 TTS Echo Detector initialized');
    } catch (error) {
      console.warn('❌ Failed to initialize audio analysis:', error);
      // Graceful degradation - система продолжит работать без частотного анализа
    }
  }

  /**
   * Захват частотного профиля текущего TTS
   */
  captureTTSProfile(audioBuffer?: AudioBuffer): any {
    if (!this.isInitialized || !this.analyser) return null;

    try {
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(dataArray);

      // Анализируем частотные характеристики
      const profile = {
        dominantFrequencies: this.findDominantFrequencies(dataArray),
        spectralCentroid: this.calculateSpectralCentroid(dataArray),
        rms: this.calculateRMS(dataArray),
        timestamp: Date.now()
      };

      this.ttsFrequencyProfile = profile;
      console.log('📊 Captured TTS frequency profile');
      return profile;
    } catch (error) {
      console.warn('⚠️ Failed to capture TTS profile:', error);
      return null;
    }
  }

  /**
   * Поиск доминирующих частот
   */
  private findDominantFrequencies(dataArray: Uint8Array): Array<{frequency: number, amplitude: number}> {
    const peaks: Array<{frequency: number, amplitude: number}> = [];

    for (let i = 0; i < dataArray.length; i++) {
      if (dataArray[i] > 180) { // Минимальный порог для пиков
        const frequency = (i * (this.audioContext?.sampleRate || 44100)) / (2 * dataArray.length);
        peaks.push({ frequency, amplitude: dataArray[i] });
      }
    }

    return peaks.slice(0, 5); // Возвращаем топ-5 пиков
  }

  /**
   * Расчет спектрального центроида
   */
  private calculateSpectralCentroid(dataArray: Uint8Array): number {
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const frequency = (i * (this.audioContext?.sampleRate || 44100)) / (2 * dataArray.length);
      numerator += frequency * dataArray[i];
      denominator += dataArray[i];
    }

    return denominator > 0 ? numerator / denominator : 0;
  }

  /**
   * Расчет RMS (Root Mean Square)
   */
  private calculateRMS(dataArray: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    return Math.sqrt(sum / dataArray.length);
  }

  /**
   * Проверка схожести с профилем TTS
   */
  isSimilarToTTSProfile(audioData: Uint8Array): boolean {
    if (!this.ttsFrequencyProfile || !audioData) return false;

    try {
      const currentProfile = {
        dominantFrequencies: this.findDominantFrequencies(audioData),
        spectralCentroid: this.calculateSpectralCentroid(audioData),
        rms: this.calculateRMS(audioData)
      };

      // Сравнение частотных профилей
      const frequencySimilarity = this.compareFrequencyProfiles(
        this.ttsFrequencyProfile.dominantFrequencies,
        currentProfile.dominantFrequencies
      );

      // Сравнение спектрального центроида
      const centroidSimilarity = 1 - Math.abs(
        this.ttsFrequencyProfile.spectralCentroid - currentProfile.spectralCentroid
      ) / 4000; // Нормализация для диапазона 0-4000Hz

      // Сравнение RMS
      const rmsSimilarity = 1 - Math.abs(
        this.ttsFrequencyProfile.rms - currentProfile.rms
      ) / 255;

      // Взвешенная оценка схожести
      const totalSimilarity = (
        frequencySimilarity * 0.5 +
        centroidSimilarity * 0.3 +
        rmsSimilarity * 0.2
      );

      console.log('📊 Frequency similarity analysis:', {
        frequency: frequencySimilarity.toFixed(3),
        centroid: centroidSimilarity.toFixed(3),
        rms: rmsSimilarity.toFixed(3),
        total: totalSimilarity.toFixed(3)
      });

      return totalSimilarity > 0.7; // Порог схожести 70%
    } catch (error) {
      console.warn('⚠️ Frequency analysis failed:', error);
      return false;
    }
  }

  /**
   * Сравнение частотных профилей
   */
  private compareFrequencyProfiles(profile1: any[], profile2: any[]): number {
    if (!profile1.length || !profile2.length) return 0;

    let matches = 0;
    for (const freq1 of profile1) {
      for (const freq2 of profile2) {
        if (Math.abs(freq1.frequency - freq2.frequency) < 300) { // Допуск 300Hz
          matches++;
          break;
        }
      }
    }

    return matches / Math.max(profile1.length, profile2.length);
  }

  /**
   * Очистка ресурсов
   */
  cleanup(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
    this.ttsFrequencyProfile = null;
    this.isInitialized = false;
  }
}
