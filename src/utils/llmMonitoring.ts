// Система мониторинга LLM ответов
interface LLMRequest {
  message: string;
  courseId: string;
  timestamp: number;
  userId?: string;
}

interface LLMResponse {
  message: string;
  messageId: string;
  timestamp: number;
  duration: number;
  isEmpty: boolean;
  error?: string;
}

interface MonitoringStats {
  totalRequests: number;
  emptyResponses: number;
  errorResponses: number;
  avgResponseTime: number;
  lastEmptyResponse: LLMRequest | null;
  suspiciousPatterns: { [key: string]: number };
  recentRequests: LLMRequest[];
}

// Хранилище для мониторинга (в памяти, можно заменить на localStorage или API)
class LLMMonitoring {
  private stats: MonitoringStats = {
    totalRequests: 0,
    emptyResponses: 0,
    errorResponses: 0,
    avgResponseTime: 0,
    lastEmptyResponse: null,
    suspiciousPatterns: {},
    recentRequests: []
  };

  private readonly MAX_RECENT_REQUESTS = 50;
  private readonly STORAGE_KEY = 'llm-monitoring-stats';

  constructor() {
    this.loadFromStorage();
  }

  // Отслеживание запроса
  trackRequest(request: LLMRequest): void {
    this.stats.totalRequests++;
    this.stats.recentRequests.unshift(request);

    // Ограничить количество недавних запросов
    if (this.stats.recentRequests.length > this.MAX_RECENT_REQUESTS) {
      this.stats.recentRequests = this.stats.recentRequests.slice(0, this.MAX_RECENT_REQUESTS);
    }

    // Анализ подозрительных паттернов
    this.analyzeSuspiciousPatterns(request.message);

    this.saveToStorage();
  }

  // Отслеживание ответа
  trackResponse(request: LLMRequest, response: LLMResponse): void {
    // Обновление статистики времени ответа
    const totalTime = this.stats.avgResponseTime * (this.stats.totalRequests - 1) + response.duration;
    this.stats.avgResponseTime = totalTime / this.stats.totalRequests;

    if (response.isEmpty) {
      this.stats.emptyResponses++;
      this.stats.lastEmptyResponse = request;

      console.warn('🚨 Обнаружен пустой ответ LLM:', {
        message: request.message,
        courseId: request.courseId,
        duration: response.duration,
        timestamp: new Date(request.timestamp).toISOString()
      });
    }

    if (response.error) {
      this.stats.errorResponses++;
    }

    this.saveToStorage();
  }

  // Анализ подозрительных паттернов в сообщениях
  private analyzeSuspiciousPatterns(message: string): void {
    const suspiciousWords = [
      'работа', 'работать', 'продолжать', 'продолжаем',
      'начнем', 'начинать', 'будем', 'давай',
      'задание', 'урок', 'обучение', 'учить'
    ];

    suspiciousWords.forEach(word => {
      if (message.toLowerCase().includes(word)) {
        this.stats.suspiciousPatterns[word] = (this.stats.suspiciousPatterns[word] || 0) + 1;
      }
    });
  }

  // Получение статистики
  getStats(): MonitoringStats {
    return { ...this.stats };
  }

  // Получение процента пустых ответов
  getEmptyResponseRate(): number {
    return this.stats.totalRequests > 0
      ? (this.stats.emptyResponses / this.stats.totalRequests) * 100
      : 0;
  }

  // Получение самых подозрительных слов
  getTopSuspiciousWords(limit: number = 5): Array<{ word: string; count: number }> {
    return Object.entries(this.stats.suspiciousPatterns)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([word, count]) => ({ word, count }));
  }

  // Сброс статистики
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      emptyResponses: 0,
      errorResponses: 0,
      avgResponseTime: 0,
      lastEmptyResponse: null,
      suspiciousPatterns: {},
      recentRequests: []
    };
    this.saveToStorage();
  }

  // Сохранение в localStorage
  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.stats));
    } catch (error) {
      console.warn('Не удалось сохранить статистику мониторинга:', error);
    }
  }

  // Загрузка из localStorage
  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        this.stats = { ...this.stats, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.warn('Не удалось загрузить статистику мониторинга:', error);
    }
  }

  // Экспорт данных для анализа
  exportData(): string {
    return JSON.stringify({
      stats: this.stats,
      exportTime: new Date().toISOString(),
      emptyRate: this.getEmptyResponseRate(),
      topSuspiciousWords: this.getTopSuspiciousWords()
    }, null, 2);
  }
}

// Глобальный экземпляр мониторинга
export const llmMonitoring = new LLMMonitoring();

// Вспомогательные функции для интеграции в код
export function monitorLLMRequest(message: string, courseId: string, userId?: string): void {
  llmMonitoring.trackRequest({
    message,
    courseId,
    timestamp: Date.now(),
    userId
  });
}

export function monitorLLMResponse(
  message: string,
  courseId: string,
  response: string,
  messageId: string,
  duration: number,
  error?: string
): void {
  llmMonitoring.trackResponse(
    { message, courseId, timestamp: Date.now() },
    {
      message: response,
      messageId,
      timestamp: Date.now(),
      duration,
      isEmpty: !response || response.trim().length === 0,
      error
    }
  );
}

// Функция для получения наиболее проблемных фраз
export function getProblematicPhrases(limit: number = 10): Array<{ phrase: string; emptyCount: number; totalCount: number; emptyRate: number }> {
  const stats = llmMonitoring.getStats();

  // Группируем по фразам и считаем статистику
  const phraseStats: { [key: string]: { empty: number; total: number } } = {};

  // Анализируем недавние запросы
  stats.recentRequests.forEach(req => {
    const phrase = req.message.toLowerCase().trim();
    if (!phraseStats[phrase]) {
      phraseStats[phrase] = { empty: 0, total: 0 };
    }
    phraseStats[phrase].total++;
  });

  // Считаем пустые ответы (приближенно, так как у нас нет прямой связи)
  // Используем общее количество пустых ответов пропорционально

  return Object.entries(phraseStats)
    .map(([phrase, stats]) => ({
      phrase,
      emptyCount: Math.round(stats.total * (llmMonitoring.getEmptyResponseRate() / 100)),
      totalCount: stats.total,
      emptyRate: llmMonitoring.getEmptyResponseRate()
    }))
    .filter(item => item.totalCount >= 2) // Только фразы, которые использовались минимум 2 раза
    .sort((a, b) => b.emptyRate - a.emptyRate)
    .slice(0, limit);
}

// Функция для генерации супер-безопасной фразы
export function generateSuperSafePhrase(originalMessage: string): string {
  const safePhrases = [
    'Привет! Расскажи о русском языке',
    'Здравствуйте! Что будем изучать сегодня?',
    'Расскажи о русском языке для 7 класса',
    'Помоги с русским языком',
    'Объясни русский язык',
    'Давай поговорим о русском языке',
    'Что ты знаешь о русском языке?',
    'Расскажи про уроки русского языка'
  ];

  // Выбираем случайную безопасную фразу
  const randomIndex = Math.floor(Math.random() * safePhrases.length);
  const safePhrase = safePhrases[randomIndex];

  console.log(`🛡️ Супер-безопасная замена: "${originalMessage}" -> "${safePhrase}"`);
  return safePhrase;
}

// Автообучение: запоминаем проблемные фразы
export function updateLearnedAlternatives(originalMessage: string, wasSuccessful: boolean): void {
  if (wasSuccessful) return; // Не обновляем, если успешно

  const key = `learned_${originalMessage.toLowerCase().trim()}`;
  const currentCount = parseInt(localStorage.getItem(key) || '0');
  localStorage.setItem(key, (currentCount + 1).toString());

  // Если фраза привела к пустому ответу 3+ раза, добавляем в автозамену
  if (currentCount >= 2) {
    const safeAlt = generateSuperSafePhrase(originalMessage);
    localStorage.setItem(`${key}_alt`, safeAlt);
    console.log(`🧠 Автообучение: "${originalMessage}" -> "${safeAlt}"`);
  }
}

// Функция для проверки автообученных замен
function getLearnedAlternative(message: string): string | null {
  const key = `learned_${message.toLowerCase().trim()}`;
  const alternative = localStorage.getItem(`${key}_alt`);
  return alternative;
}

// Функция для генерации безопасной альтернативы
export function generateSafeAlternative(message: string): string {
  // Сначала проверяем автообученные замены
  const learnedAlt = getLearnedAlternative(message);
  if (learnedAlt) {
    console.log(`🧠 Используем автообученную замену: "${message}" -> "${learnedAlt}"`);
    return learnedAlt;
  }

  const exactAlternatives: { [key: string]: string } = {
    // Точные замены подозрительных фраз
    'давай продолжаем работу': 'давай продолжим изучение русского языка',
    'продолжаем работу': 'продолжим наше занятие',
    'давай работать': 'давай заниматься',
    'начнем работу': 'начнем занятие',
    'будем работать': 'будем заниматься',
    'работаем': 'занимаемся',
    'давай поработаем': 'давай позанимаемся',
    'нужно работать': 'нужно заниматься',
    'время работать': 'время заниматься',
    'продолжаем урок': 'продолжим урок',
    'давай учиться': 'давай изучать русский язык',
    'начнем обучение': 'начнем обучение',
    'начнем урок': 'начнем урок',
    'давай начнем': 'давай начнем урок'
  };

  // Расширенные паттерны замены
  const patternAlternatives = [
    {
      pattern: /давай.*работаем/gi,
      replacement: 'давай позанимаемся'
    },
    {
      pattern: /продолжаем.*работу/gi,
      replacement: 'продолжим занятие'
    },
    {
      pattern: /начнем.*работу/gi,
      replacement: 'начнем занятие'
    },
    {
      pattern: /работа[а-я]*/gi,
      replacement: 'занятие'
    },
    {
      pattern: /работать/gi,
      replacement: 'заниматься'
    },
    {
      pattern: /работаю/gi,
      replacement: 'занимаюсь'
    },
    {
      pattern: /работаем/gi,
      replacement: 'занимаемся'
    },
    {
      pattern: /урок.*работ/gi,
      replacement: 'урок русского языка'
    },
    {
      pattern: /обучен.*работ/gi,
      replacement: 'обучение'
    }
  ];

  // Контекстные замены для разных типов фраз
  const contextualReplacements = [
    {
      condition: (msg: string) => msg.toLowerCase().includes('давай') && msg.toLowerCase().includes('работ'),
      replacement: (msg: string) => msg.replace(/работ[а-я]*/gi, 'учиться')
    },
    {
      condition: (msg: string) => msg.toLowerCase().includes('продолж') && msg.toLowerCase().includes('работ'),
      replacement: (msg: string) => msg.replace(/работ[а-я]*/gi, 'занятие')
    },
    {
      condition: (msg: string) => msg.toLowerCase().includes('нач') && msg.toLowerCase().includes('работ'),
      replacement: (msg: string) => msg.replace(/работ[а-я]*/gi, 'урок')
    }
  ];

  let result = message;
  const lowerMessage = message.toLowerCase();

  // Сначала ищем точные совпадения
  for (const [pattern, alternative] of Object.entries(exactAlternatives)) {
    if (lowerMessage.includes(pattern)) {
      result = message.replace(new RegExp(pattern, 'gi'), alternative);
      console.log(`🔄 Замена точного совпадения: "${pattern}" -> "${alternative}"`);
      return result;
    }
  }

  // Затем применяем паттерны
  let hasChanges = false;
  for (const { pattern, replacement } of patternAlternatives) {
    if (pattern.test(result)) {
      result = result.replace(pattern, replacement);
      hasChanges = true;
    }
  }

  // Применяем контекстные замены
  for (const { condition, replacement } of contextualReplacements) {
    if (condition(result)) {
      result = replacement(result);
      hasChanges = true;
    }
  }

  if (hasChanges) {
    console.log(`🔄 Применены паттерны замены: "${message}" -> "${result}"`);
  }

  // Если изменений не было и сообщение все еще подозрительное, добавляем более умный контекст
  if (!hasChanges && isSuspiciousMessage(message)) {
    if (lowerMessage.includes('давай')) {
      result = message + ' по русскому языку';
    } else if (lowerMessage.includes('работ') || lowerMessage.includes('занят')) {
      result = message.replace(/работ[а-я]*/gi, 'учимся');
    } else if (lowerMessage.includes('урок') || lowerMessage.includes('обучен')) {
      result = 'Расскажи о русском языке';
    } else {
      result = 'Давай поговорим о русском языке';
    }
    console.log(`🔄 Добавлен умный контекст: "${message}" -> "${result}"`);
  }

  return result;
}

// Расширенная функция проверки подозрительных сообщений
export function isSuspiciousMessage(message: string): boolean {
  const suspiciousPatterns = [
    /работаем/gi,
    /работа[а-я]*/gi,
    /работать/gi,
    /давай.*работ/gi,
    /продолж.*работ/gi,
    /начн.*работ/gi,
    /буд.*работ/gi,
    /задание.*работ/gi,
    /урок.*работ/gi
  ];

  const lowerMessage = message.toLowerCase();
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(lowerMessage));

  if (isSuspicious) {
    console.warn(`⚠️ Обнаружено подозрительное сообщение: "${message}"`);
  }

  return isSuspicious;
}
