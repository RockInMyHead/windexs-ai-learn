/**
 * Конфигурация системы обнаружения эха TTS
 */

export const ECHO_DETECTION_CONFIG = {
  // Пороги обнаружения эха
  TEXT_SIMILARITY_THRESHOLD: 0.6,     // Порог текстовой схожести
  FREQUENCY_SIMILARITY_THRESHOLD: 0.7, // Порог частотной схожести
  ML_CONFIDENCE_THRESHOLD: 0.65,      // Порог ML-классификации

  // Задержки (мс)
  SPEECH_RECOGNITION_DELAY: 1000,     // Задержка перед запуском распознавания после TTS
  STATE_CLEAR_DELAY: 100,             // Задержка очистки состояния

  // Web Audio API настройки
  FFT_SIZE: 2048,                     // Размер FFT для анализа
  SMOOTHING_TIME: 0.8,                // Сглаживание частотного анализа
  FREQUENCY_PEAK_THRESHOLD: 180,      // Минимальный порог для пиков частот
  FREQUENCY_TOLERANCE: 300,           // Допуск при сравнении частот (Hz)

  // Текстовый анализ
  LEVENSHTEIN_MAX_DISTANCE: 1,        // Максимальное расстояние Левенштейна для слов
  WORD_MATCH_WEIGHT: 0.6,             // Вес совпадения слов
  SEQUENCE_BONUS_WEIGHT: 0.3,         // Вес последовательности слов
  LENGTH_SIMILARITY_WEIGHT: 0.1,      // Вес схожести длины

  // Взвешенные коэффициенты для финального решения
  FEATURE_WEIGHTS: {
    textCorrelation: 0.5,             // 50% - текстовая корреляция
    frequencyAnalysis: 0.3,           // 30% - частотный анализ
    mlClassification: 0.2             // 20% - ML-классификация
  },

  // Настройки производительности
  ENABLE_FREQUENCY_ANALYSIS: true,    // Включить частотный анализ
  ENABLE_ML_CLASSIFICATION: true,     // Включить ML-классификацию
  MIN_HARDWARE_CONCURRENCY: 4,        // Минимальное количество ядер CPU

  // Отладка
  ENABLE_DEBUG_LOGGING: true,         // Включить подробное логирование
  LOG_ECHO_DETECTION: true,           // Логировать результаты обнаружения эха
  COLLECT_TRAINING_DATA: process.env.NODE_ENV === 'development' // Сбор данных для обучения в dev режиме
};

/**
 * Проверка поддержки Web Audio API
 */
export const isWebAudioSupported = (): boolean => {
  return !!(window.AudioContext || (window as any).webkitAudioContext);
};

/**
 * Проверка поддержки частотного анализа
 */
export const shouldEnableFrequencyAnalysis = (): boolean => {
  return ECHO_DETECTION_CONFIG.ENABLE_FREQUENCY_ANALYSIS &&
         isWebAudioSupported() &&
         navigator.hardwareConcurrency >= ECHO_DETECTION_CONFIG.MIN_HARDWARE_CONCURRENCY;
};

/**
 * Получение уровня поддержки обнаружения эха
 */
export const getEchoDetectionLevel = (): 'full' | 'basic' | 'text-only' => {
  if (shouldEnableFrequencyAnalysis() && ECHO_DETECTION_CONFIG.ENABLE_ML_CLASSIFICATION) {
    return 'full';
  }
  if (isWebAudioSupported()) {
    return 'basic';
  }
  return 'text-only';
};
