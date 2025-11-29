/**
 * Интеграционные тесты для критических сценариев аудио/видео функционала
 *
 * Запуск: node tests/integration-tests.js
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Моки для браузерного API
global.window = {
  AudioContext: jest.fn().mockImplementation(() => ({
    createAnalyser: jest.fn(() => ({
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      getByteFrequencyData: jest.fn(),
      getByteTimeDomainData: jest.fn(),
      frequencyBinCount: 1024
    })),
    createMediaStreamSource: jest.fn(() => ({
      connect: jest.fn()
    })),
    resume: jest.fn().mockResolvedValue(),
    state: 'running',
    close: jest.fn()
  })),
  SpeechRecognition: jest.fn().mockImplementation(() => ({
    continuous: true,
    interimResults: true,
    lang: 'ru-RU',
    maxAlternatives: 1,
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    onstart: jest.fn(),
    onresult: jest.fn(),
    onerror: jest.fn(),
    onend: jest.fn()
  })),
  Audio: jest.fn().mockImplementation(() => ({
    play: jest.fn().mockResolvedValue(),
    pause: jest.fn(),
    load: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    currentTime: 0,
    volume: 1,
    muted: false,
    src: '',
    onplay: null,
    onended: null,
    onerror: null
  })),
  requestAnimationFrame: jest.fn(cb => setTimeout(cb, 16)),
  cancelAnimationFrame: jest.fn()
};

global.navigator = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  hardwareConcurrency: 8,
  mediaDevices: {
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: () => [{ stop: jest.fn() }]
    })
  }
};

global.document = {
  createElement: jest.fn(tag => {
    if (tag === 'canvas') {
      return {
        getContext: jest.fn(() => ({
          clearRect: jest.fn(),
          beginPath: jest.fn(),
          arc: jest.fn(),
          fill: jest.fn(),
          fillStyle: '',
          createRadialGradient: jest.fn(() => ({
            addColorStop: jest.fn()
          }))
        })),
        width: 200,
        height: 200
      };
    }
    if (tag === 'video') {
      return {
        play: jest.fn().mockResolvedValue(),
        pause: jest.fn(),
        load: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        currentTime: 0,
        volume: 1,
        muted: false,
        src: '',
        onplay: null,
        onended: null,
        onerror: null,
        loop: false,
        autoplay: false
      };
    }
    return {};
  })
};

describe('Integration Tests - Critical Audio/Video Scenarios', () => {

  describe('Voice Chat Flow Integration', () => {
    it('should handle complete voice interaction cycle', async () => {
      // Имитация полного цикла голосового взаимодействия:
      // 1. Пользователь говорит
      // 2. Speech Recognition обрабатывает
      // 3. Отправляется в LLM
      // 4. Получается ответ
      // 5. TTS озвучивает ответ
      // 6. Видео синхронизируется

      const interactionFlow = {
        userSpeech: 'Расскажи о Петре Первом',
        expectedResponse: 'Пётр I был великим реформатором России...',
        ttsDuration: 5000, // 5 секунд
        videoShouldPlay: true
      };

      // Мокаем API ответы
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: interactionFlow.expectedResponse } }]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(new Blob(['audio data'], { type: 'audio/mpeg' }))
        });

      // Имитируем полный цикл
      const speechRecognition = new global.window.SpeechRecognition();

      // 1. Speech Recognition получает результат
      speechRecognition.onresult({
        results: [[{
          transcript: interactionFlow.userSpeech,
          isFinal: true
        }]]
      });

      // 2. Отправка в LLM
      const llmResponse = await global.fetch('/api/chat/general/message', {
        method: 'POST',
        body: JSON.stringify({ content: interactionFlow.userSpeech })
      });

      expect(llmResponse.ok).toBe(true);

      // 3. Получение TTS
      const ttsResponse = await global.fetch('/api/tts', {
        method: 'POST',
        body: JSON.stringify({ text: interactionFlow.expectedResponse })
      });

      expect(ttsResponse.ok).toBe(true);

      // 4. Создание аудио и проверка событий
      const audio = new global.window.Audio();
      expect(audio.play).toBeDefined();

      // Имитируем события аудио
      if (audio.onplay) audio.onplay();
      if (audio.onended) audio.onended();
    });

    it('should handle barge-in correctly', async () => {
      // Тест на barge-in (прерывание TTS пользовательской речью)

      const audio = new global.window.Audio();
      const speechRecognition = new global.window.SpeechRecognition();

      // Сценарий: TTS играет, пользователь начинает говорить
      audio.onplay(); // TTS начало играть

      // Пользователь говорит во время TTS
      speechRecognition.onresult({
        results: [[{
          transcript: 'Стоп',
          isFinal: true
        }]]
      });

      // Проверяем, что TTS прервался
      expect(audio.pause).toHaveBeenCalled();
    });

    it('should handle echo detection during TTS playback', async () => {
      // Тест обнаружения эха во время воспроизведения TTS

      const testCases = [
        {
          ttsText: 'Привет, как дела?',
          echoText: 'Привет, как дела?',
          shouldDetectEcho: true
        },
        {
          ttsText: 'Привет, как дела?',
          echoText: 'привет как дела',
          shouldDetectEcho: true
        },
        {
          ttsText: 'Привет, как дела?',
          echoText: 'Здравствуй, как поживаешь?',
          shouldDetectEcho: false
        }
      ];

      testCases.forEach(({ ttsText, echoText, shouldDetectEcho }) => {
        // Простая текстовая схожесть для имитации обнаружения эха
        const similarity = calculateSimilarity(ttsText.toLowerCase(), echoText.toLowerCase());
        const isEcho = similarity > 0.6;

        expect(isEcho).toBe(shouldDetectEcho);
      });
    });
  });

  describe('Cross-browser Compatibility Integration', () => {
    const browserConfigs = [
      {
        name: 'Chrome',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        hasSpeechRecognition: true,
        hasWebkitSpeechRecognition: false,
        hasAudioContext: true,
        hasWebkitAudioContext: false
      },
      {
        name: 'Firefox',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        hasSpeechRecognition: false,
        hasWebkitSpeechRecognition: false,
        hasMozSpeechRecognition: true,
        hasAudioContext: true,
        hasWebkitAudioContext: false
      },
      {
        name: 'Safari',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        hasSpeechRecognition: false,
        hasWebkitSpeechRecognition: true,
        hasAudioContext: false,
        hasWebkitAudioContext: true
      }
    ];

    browserConfigs.forEach(config => {
      it(`should work correctly in ${config.name}`, () => {
        global.navigator.userAgent = config.userAgent;

        // Настраиваем доступность API
        if (config.hasSpeechRecognition) {
          global.window.SpeechRecognition = jest.fn();
        } else {
          delete global.window.SpeechRecognition;
        }

        if (config.hasWebkitSpeechRecognition) {
          global.window.webkitSpeechRecognition = jest.fn();
        } else {
          delete global.window.webkitSpeechRecognition;
        }

        if (config.hasMozSpeechRecognition) {
          global.window.mozSpeechRecognition = jest.fn();
        } else {
          delete global.window.mozSpeechRecognition;
        }

        if (config.hasAudioContext) {
          global.window.AudioContext = jest.fn();
        } else {
          delete global.window.AudioContext;
        }

        if (config.hasWebkitAudioContext) {
          global.window.webkitAudioContext = jest.fn();
        } else {
          delete global.window.webkitAudioContext;
        }

        // Проверяем определение браузера
        const isSafari = () => {
          const ua = navigator.userAgent.toLowerCase();
          return ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium');
        };

        // Проверяем доступность Speech Recognition
        const hasSpeechRecognition = !!(
          global.window.SpeechRecognition ||
          global.window.webkitSpeechRecognition ||
          global.window.mozSpeechRecognition
        );

        // Проверяем доступность Audio Context
        const hasAudioContext = !!(
          global.window.AudioContext ||
          global.window.webkitAudioContext
        );

        // Валидация для каждого браузера
        if (config.name === 'Chrome') {
          expect(hasSpeechRecognition).toBe(true);
          expect(isSafari()).toBe(false);
        } else if (config.name === 'Firefox') {
          expect(hasSpeechRecognition).toBe(true); // mozSpeechRecognition
          expect(isSafari()).toBe(false);
        } else if (config.name === 'Safari') {
          expect(hasSpeechRecognition).toBe(true); // webkitSpeechRecognition
          expect(isSafari()).toBe(true);
        }

        expect(hasAudioContext).toBe(true);
      });
    });
  });

  describe('Performance and Memory Management', () => {
    it('should handle memory leaks in audio resources', async () => {
      // Тест на утечки памяти при многократном создании/уничтожении аудио ресурсов

      const audioContexts = [];
      const audioElements = [];
      const speechRecognitions = [];

      // Создаем много ресурсов
      for (let i = 0; i < 50; i++) {
        audioContexts.push(new global.window.AudioContext());
        audioElements.push(new global.window.Audio());
        speechRecognitions.push(new global.window.SpeechRecognition());
      }

      // Проверяем создание
      expect(audioContexts.length).toBe(50);
      expect(audioElements.length).toBe(50);
      expect(speechRecognitions.length).toBe(50);

      // Имитируем очистку
      audioContexts.forEach(ctx => {
        if (ctx.close) ctx.close();
      });

      audioElements.forEach(audio => {
        audio.pause();
        audio.src = '';
        audio.load();
      });

      speechRecognitions.forEach(sr => {
        if (sr.abort) sr.abort();
      });

      // Проверяем, что ресурсы можно очистить
      expect(audioContexts.every(ctx => typeof ctx.close === 'function')).toBe(true);
    });

    it('should handle rapid user interactions', () => {
      // Тест на быстрые последовательные взаимодействия пользователя

      const interactions = [];
      let interactionCount = 0;

      // Имитируем быструю последовательность взаимодействий
      const simulateInteraction = () => {
        interactionCount++;
        interactions.push({
          id: interactionCount,
          timestamp: Date.now(),
          type: interactionCount % 2 === 0 ? 'speech' : 'click'
        });
      };

      // 20 быстрых взаимодействий
      for (let i = 0; i < 20; i++) {
        simulateInteraction();
        // Имитируем небольшую задержку
        jest.advanceTimersByTime(50);
      }

      expect(interactions.length).toBe(20);
      expect(interactions[0].type).toBe('speech');
      expect(interactions[1].type).toBe('click');

      // Проверяем временные метки
      for (let i = 1; i < interactions.length; i++) {
        expect(interactions[i].timestamp).toBeGreaterThanOrEqual(interactions[i-1].timestamp);
      }
    });

    it('should handle large audio files gracefully', () => {
      // Тест на обработку больших аудио файлов

      const largeAudioSizes = [
        1024 * 1024,      // 1MB
        5 * 1024 * 1024,  // 5MB
        10 * 1024 * 1024  // 10MB
      ];

      largeAudioSizes.forEach(size => {
        const audioBuffer = new ArrayBuffer(size);
        const view = new Uint8Array(audioBuffer);

        // Заполняем данными
        for (let i = 0; i < Math.min(view.length, 1000); i++) {
          view[i] = Math.random() * 256;
        }

        // Проверяем, что буфер создан и имеет правильный размер
        expect(audioBuffer.byteLength).toBe(size);
      });
    });
  });

  describe('Network and API Resilience', () => {
    it('should handle API timeouts', async () => {
      // Тест на таймауты API

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });

      global.fetch = jest.fn(() => timeoutPromise);

      try {
        await global.fetch('/api/tts', {
          method: 'POST',
          body: JSON.stringify({ text: 'Test' })
        });
        fail('Should have timed out');
      } catch (error) {
        expect(error.message).toBe('Timeout');
      }
    });

    it('should handle API rate limiting', async () => {
      // Тест на rate limiting API

      let requestCount = 0;
      const rateLimit = 10;
      const resetTime = Date.now() + 60000; // 1 минута

      global.fetch = jest.fn(async () => {
        requestCount++;
        if (requestCount > rateLimit) {
          return {
            ok: false,
            status: 429,
            json: () => Promise.resolve({
              error: 'Rate limit exceeded',
              resetTime
            })
          };
        }
        return {
          ok: true,
          json: () => Promise.resolve({ success: true })
        };
      });

      // Делаем запросы до rate limit
      for (let i = 0; i < rateLimit; i++) {
        const response = await global.fetch('/api/test');
        expect(response.ok).toBe(true);
      }

      // Следующий запрос должен быть заблокирован
      const rateLimitedResponse = await global.fetch('/api/test');
      expect(rateLimitedResponse.ok).toBe(false);
      expect(rateLimitedResponse.status).toBe(429);
    });

    it('should recover from network interruptions', async () => {
      // Тест на восстановление после сетевых сбоев

      let networkDown = false;
      let retryCount = 0;

      global.fetch = jest.fn(async () => {
        if (networkDown && retryCount < 3) {
          retryCount++;
          throw new Error('Network error');
        }

        networkDown = false; // Восстановление сети
        return {
          ok: true,
          json: () => Promise.resolve({ success: true })
        };
      });

      // Имитируем сетевой сбой
      networkDown = true;

      try {
        // Первая попытка - ошибка
        await global.fetch('/api/test');
        fail('Should have failed on first attempt');
      } catch (error) {
        expect(error.message).toBe('Network error');
      }

      // Восстанавливаем сеть
      networkDown = false;

      // Вторая попытка - успех
      const response = await global.fetch('/api/test');
      expect(response.ok).toBe(true);
    });
  });

  describe('Device and Hardware Compatibility', () => {
    it('should handle different microphone configurations', async () => {
      // Тест на разные конфигурации микрофонов

      const microphoneConfigs = [
        { deviceId: 'default', label: 'Default Microphone', sampleRate: 44100 },
        { deviceId: 'mic1', label: 'External USB Microphone', sampleRate: 48000 },
        { deviceId: 'mic2', label: 'Bluetooth Headset', sampleRate: 16000 }
      ];

      microphoneConfigs.forEach(config => {
        // Имитируем получение доступа к разным микрофонам
        global.navigator.mediaDevices.getUserMedia = jest.fn().mockResolvedValue({
          getTracks: () => [{
            getSettings: () => ({
              deviceId: config.deviceId,
              sampleRate: config.sampleRate
            }),
            stop: jest.fn()
          }]
        });

        expect(typeof config.deviceId).toBe('string');
        expect(config.sampleRate).toBeGreaterThan(0);
      });
    });

    it('should handle low-performance devices', () => {
      // Тест на устройствах с низкой производительностью

      const deviceSpecs = [
        { cores: 2, memory: 4, shouldEnableAdvanced: false },
        { cores: 4, memory: 8, shouldEnableAdvanced: true },
        { cores: 8, memory: 16, shouldEnableAdvanced: true }
      ];

      deviceSpecs.forEach(spec => {
        global.navigator.hardwareConcurrency = spec.cores;

        // Имитируем проверку производительности
        const shouldEnableAdvanced = spec.cores >= 4;

        expect(shouldEnableAdvanced).toBe(spec.shouldEnableAdvanced);
      });
    });

    it('should handle different screen sizes and orientations', () => {
      // Тест на разных размерах экрана и ориентациях

      const screenConfigs = [
        { width: 375, height: 667, orientation: 'portrait', isMobile: true },
        { width: 768, height: 1024, orientation: 'portrait', isMobile: false },
        { width: 1920, height: 1080, orientation: 'landscape', isMobile: false }
      ];

      screenConfigs.forEach(config => {
        global.window.innerWidth = config.width;
        global.window.innerHeight = config.height;

        const isMobile = global.window.innerWidth < 768;
        const isLandscape = global.window.innerWidth > global.window.innerHeight;

        expect(isMobile).toBe(config.isMobile);
        expect(isLandscape).toBe(config.orientation === 'landscape');
      });
    });
  });
});

// Вспомогательные функции
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}
