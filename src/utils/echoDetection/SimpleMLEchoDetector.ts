/**
 * Простой ML-детектор эха TTS
 * Использует базовую логистическую регрессию для классификации
 */
export class SimpleMLEchoDetector {
  private features: number[][] = [];
  private labels: number[] = [];
  private weights: number[] = [];
  private bias = 0;
  private isTrained = false;

  // Предварительные веса для признаков (можно улучшить с обучением)
  private defaultWeights = [0.1, 0.3, 0.4, 0.5, 0.1, 0.05, 0.05];
  private defaultBias = -0.2;

  constructor() {
    // Инициализация с предварительными весами
    this.weights = [...this.defaultWeights];
    this.bias = this.defaultBias;
    this.isTrained = true; // Считаем, что базовая модель готова
    console.log('🤖 Simple ML Echo Detector initialized with default weights');
  }

  /**
   * Сбор данных для обучения (в режиме разработки)
   */
  collectTrainingData(
    recognizedText: string,
    isEcho: boolean,
    confidence: number,
    frequencySimilarity: number,
    textSimilarity: number
  ): void {
    if (process.env.NODE_ENV !== 'development') return;

    const features = [
      recognizedText.length,                    // Длина текста
      confidence,                              // Уверенность распознавания
      frequencySimilarity,                     // Схожесть частот
      textSimilarity,                          // Текстовая корреляция
      recognizedText.split(/\s+/).length,      // Количество слов
      /[а-яё]/i.test(recognizedText) ? 1 : 0,  // Русский текст
      /[.!?]$/.test(recognizedText.trim()) ? 1 : 0, // Законченное предложение
    ];

    this.features.push(features);
    this.labels.push(isEcho ? 1 : 0);

    console.log('📊 Training data collected:', {
      text: recognizedText,
      isEcho,
      features
    });

    // Автоматическое переобучение каждые 10 образцов
    if (this.features.length % 10 === 0) {
      this.train();
    }
  }

  /**
   * Обучение модели (простая версия)
   */
  train(): void {
    if (this.features.length < 5) {
      console.log('⚠️ Недостаточно данных для обучения');
      return;
    }

    // Простая настройка весов на основе статистики
    const echoFeatures = this.features.filter((_, i) => this.labels[i] === 1);
    const nonEchoFeatures = this.features.filter((_, i) => this.labels[i] === 0);

    if (echoFeatures.length > 0 && nonEchoFeatures.length > 0) {
      // Вычисляем средние значения для эха и не-эха
      const echoAvg = this.calculateFeatureAverages(echoFeatures);
      const nonEchoAvg = this.calculateFeatureAverages(nonEchoFeatures);

      // Обновляем веса на основе разницы средних
      for (let i = 0; i < this.weights.length; i++) {
        const diff = echoAvg[i] - nonEchoAvg[i];
        this.weights[i] += diff * 0.1; // Небольшая корректировка
      }

      console.log('🤖 Model weights updated:', this.weights);
    }

    this.isTrained = true;
  }

  /**
   * Расчет средних значений признаков
   */
  private calculateFeatureAverages(features: number[][]): number[] {
    const sums = new Array(features[0].length).fill(0);

    for (const feature of features) {
      for (let i = 0; i < feature.length; i++) {
        sums[i] += feature[i];
      }
    }

    return sums.map(sum => sum / features.length);
  }

  /**
   * Классификация: является ли текст эхом
   */
  classifyEcho(
    recognizedText: string,
    confidence: number,
    frequencySimilarity: number,
    textSimilarity: number
  ): boolean {
    const features = [
      recognizedText.length,
      confidence,
      frequencySimilarity,
      textSimilarity,
      recognizedText.split(/\s+/).length,
      /[а-яё]/i.test(recognizedText) ? 1 : 0,
      /[.!?]$/.test(recognizedText.trim()) ? 1 : 0,
    ];

    const probability = this.predict(features);
    const isEcho = probability > 0.65; // Порог 65%

    console.log('🤖 ML classification:', {
      text: recognizedText,
      probability: probability.toFixed(3),
      isEcho,
      features
    });

    return isEcho;
  }

  /**
   * Предсказание вероятности (сигмоида)
   */
  private predict(features: number[]): number {
    if (!this.isTrained) return 0.5; // Неопределенность

    let score = this.bias;
    for (let i = 0; i < features.length; i++) {
      score += features[i] * this.weights[i];
    }

    // Сигмоида для получения вероятности от 0 до 1
    return 1 / (1 + Math.exp(-score));
  }

  /**
   * Получение статистики модели
   */
  getStats() {
    return {
      isTrained: this.isTrained,
      trainingSamples: this.features.length,
      weights: this.weights,
      bias: this.bias
    };
  }

  /**
   * Сброс модели к начальным весам
   */
  reset(): void {
    this.weights = [...this.defaultWeights];
    this.bias = this.defaultBias;
    this.features = [];
    this.labels = [];
    this.isTrained = true;
    console.log('🔄 ML model reset to default weights');
  }
}
