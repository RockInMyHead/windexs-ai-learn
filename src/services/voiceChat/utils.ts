/**
 * Утилиты для голосового чата
 */

/**
 * Определение мобильного устройства (для UI адаптации)
 */
export const isMobileDevice = (): boolean => {
  const ua = navigator.userAgent.toLowerCase();
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
};

/**
 * Определение iOS устройства
 */
export const isIOSDevice = (): boolean => {
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

/**
 * Определение Android устройства
 */
export const isAndroidDevice = (): boolean => {
  const ua = navigator.userAgent.toLowerCase();
  return /android/.test(ua);
};

/**
 * Определение Safari браузера
 */
export const isSafariBrowser = (): boolean => {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

/**
 * Проверка браузеров с проблемами эхо (Chrome, Edge, Opera)
 */
export const hasEchoProblems = (): boolean => {
  const ua = navigator.userAgent.toLowerCase();
  return /chrome|chromium|edg\/|opera|brave/.test(ua);
};

/**
 * Проверка завершения урока по ответу ассистента
 */
export const checkIfLessonFinished = (response: string): boolean => {
  const lowerResponse = response.toLowerCase();

  const finishIndicators = [
    'урок закончен',
    'урок завершен',
    'занятие окончено',
    'занятие завершено',
    'мы закончили урок',
    'урок подошел к концу',
    'на этом урок завершается',
    'до свидания',
    'до новых встреч',
    'было приятно заниматься',
    'спасибо за урок',
    'урок окончен'
  ];

  return finishIndicators.some(indicator => lowerResponse.includes(indicator));
};

/**
 * Получение оптимального MIME типа для записи аудио
 */
export const getOptimalMimeType = (): string => {
  if (MediaRecorder.isTypeSupported('audio/wav')) return 'audio/wav';
  if (MediaRecorder.isTypeSupported('audio/mpeg')) return 'audio/mpeg';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  return 'audio/mp4';
};

/**
 * Создание AudioContext с поддержкой разных браузеров
 */
export const createAudioContext = (): AudioContext => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  return new AudioContextClass();
};

/**
 * Возобновление AudioContext если он приостановлен
 */
export const resumeAudioContext = async (audioContext: AudioContext): Promise<void> => {
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
};

