/**
 * Конфигурация для голосового чата
 */

// API URL from environment
export const API_URL = import.meta.env.VITE_API_URL || 'https://teacher.windexs.ru/api';

// ========================================
// КОНСТАНТЫ ДЛЯ АВТОМАТИЧЕСКОГО РАСПОЗНАВАНИЯ
// ========================================

// VAD (Voice Activity Detection) - автоматическое определение речи
export const VAD_SILENCE_DURATION = 1200; // мс тишины после речи для автоотправки (больше времени на паузы)
export const VAD_MIN_SPEECH_DURATION = 100; // минимальная длительность речи (очень короткие фразы)
export const VAD_ENERGY_THRESHOLD = 0.001; // порог энергии для определения речи (Тестовый - очень чувствительный)
export const VAD_ANALYSIS_INTERVAL = 100; // интервал анализа аудио (мс)

// Настройки буферизации для continuous recording
export const RECORDING_CHUNK_SIZE = 100; // размер chunk для MediaRecorder (мс)
export const MAX_RECORDING_DURATION = 30000; // максимальная длительность одной записи (мс)

// Модель LLM для голосового чата
export const VOICE_CHAT_LLM_MODEL = 'gpt-5.1'; // GPT-5.1 для высококачественного голосового общения

// Настройки для обработки interim результатов
export const INTERIM_PROCESSING_DELAY = 1500; // мс задержки после последнего interim для обработки
export const INTERIM_MAX_DELAY = 8000; // максимальная задержка - принудительная отправка
export const INTERIM_MIN_LENGTH = 2; // минимальная длина interim текста для обработки

// TTS настройки
export const TTS_VOICE = 'nova'; // Голос для TTS
export const TTS_SPEED = 0.95; // Скорость речи (0.25 - 4.0)
export const TTS_RETRY_COUNT = 2; // Количество повторных попыток TTS

// LLM настройки
export const LLM_MAX_RETRIES = 3; // Максимальное количество повторных попыток
export const LLM_TIMEOUT = 30000; // Таймаут запроса к LLM (мс)

// Запись после прерывания
export const INTERRUPTION_RECORDING_TIMEOUT = 15000; // Максимальное время записи после прерывания (мс)
export const SILENCE_THRESHOLD = 0.01; // Порог тишины для определения конца речи
export const SILENCE_DURATION = 2000; // Длительность тишины для остановки записи (мс)

// ========================================
// МОБИЛЬНЫЙ ТАЙМЕР (из psiholog проекта)
// ========================================

// Таймер для мобильных устройств - отправка аудио каждые N секунд
export const MOBILE_TRANSCRIPTION_INTERVAL = 3000; // 3 секунды между отправками
export const MOBILE_MIN_AUDIO_SIZE = 5000; // Минимальный размер аудио для отправки (5KB)
export const MOBILE_MIN_VOLUME = 2.0; // Минимальная громкость для отправки (2%)
export const MOBILE_OPENAI_TIMEOUT = 8000; // Таймаут для OpenAI запросов на мобильных (8 сек)

// ========================================
// ФИЛЬТРАЦИЯ ГАЛЛЮЦИНАЦИЙ
// ========================================

// Паттерны галлюцинаций Whisper (ложные транскрипции)
export const HALLUCINATION_PATTERNS = [
  /продолжение следует/i,
  /с вами был/i,
  /до свидания/i,
  /до новых встреч/i,
  /спасибо за внимание/i,
  /конец/i,
  /закончили/i,
  /субтитры сделал/i,
  /подписывайтесь/i,
  /ставьте лайк/i,
  /благодарю за просмотр/i,
];

// Паттерны бессмысленных звуков
export const MEANINGLESS_PATTERNS = [
  /^[а-яa-z]{1}$/i, // Одна буква
  /^[эээ|ммм|ааа|ууу|ооо]+$/i, // Только звуки-заполнители
  /^[а-яa-z]{1,2}$/i, // 1-2 буквы
];

// Максимальная длина транскрипции (защита от галлюцинаций)
export const MAX_TRANSCRIPTION_LENGTH = 150;

// Максимальное количество предложений в транскрипции
export const MAX_TRANSCRIPTION_SENTENCES = 3;

// ========================================
// RETRY ЛОГИКА (из psiholog проекта)
// ========================================

// Настройки повторных попыток для API запросов
export const RETRY_MAX_ATTEMPTS = 3;
export const RETRY_BASE_DELAY = 1000; // 1 секунда
export const RETRY_MAX_DELAY = 10000; // Максимум 10 секунд
export const RETRY_BACKOFF_FACTOR = 2; // Экспоненциальный рост задержки

// ========================================
// ДЕДУПЛИКАЦИЯ TTS
// ========================================

// Минимальная разница в длине для определения расширения текста
export const TTS_EXTENSION_MIN_CHARS = 10;

// Максимальная разница в процентах для определения минорной вариации
export const TTS_MINOR_VARIATION_PERCENT = 0.2; // 20%

// Максимальная разница в символах для минорной вариации
export const TTS_MINOR_VARIATION_MAX_CHARS = 100;

