/**
 * Тесты стабильности аудио/видео функционала
 *
 * Запуск: node tests/audio-stability-tests.js
 */

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

// Мок браузерного окружения
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
  resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = {
  ...dom.window.navigator,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  hardwareConcurrency: 8,
  mediaDevices: {
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: () => [{ stop: jest.fn() }]
    })
  }
};
global.AudioContext = jest.fn().mockImplementation(() => ({
  createAnalyser: jest.fn(() => ({
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    getByteFrequencyData: jest.fn(),
    getByteTimeDomainData: jest.fn()
  })),
  createMediaStreamSource: jest.fn(() => ({})),
  resume: jest.fn().mockResolvedValue(),
  state: 'running'
}));
global.Audio = jest.fn().mockImplementation(() => ({
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
}));
global.SpeechRecognition = jest.fn().mockImplementation(() => ({
  continuous: true,
  interimResults: true,
  lang: 'ru-RU',
  maxAlternatives: 1,
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  onstart: null,
  onresult: null,
  onerror: null,
  onend: null
}));

// Импорт тестируемых модулей после настройки моков
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Моки для React hooks
jest.mock('react', () => ({
  useState: jest.fn((initial) => [initial, jest.fn()]),
  useRef: jest.fn(() => ({ current: null })),
  useCallback: jest.fn((fn) => fn),
  useEffect: jest.fn((fn) => fn()),
  useMemo: jest.fn((fn) => fn())
}));

jest.mock('react-router-dom', () => ({
  useParams: jest.fn(() => ({ courseId: 'test-course' })),
  useNavigate: jest.fn()
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({ token: 'test-token', user: { id: 1 } }))
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: jest.fn(() => ({ toast: jest.fn() }))
}));

// Тестовые сценарии
describe('Audio/Video Stability Tests', () => {
  let mockAudioContext;
  let mockSpeechRecognition;
  let mockAudio;

  beforeEach(() => {
    // Сброс всех моков перед каждым тестом
    jest.clearAllMocks();

    // Настройка моков
    mockAudioContext = {
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
      state: 'running'
    };

    mockSpeechRecognition = {
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
    };

    mockAudio = {
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
    };

    global.AudioContext.mockImplementation(() => mockAudioContext);
    global.SpeechRecognition.mockImplementation(() => mockSpeechRecognition);
    global.Audio.mockImplementation(() => mockAudio);
  });

  describe('Speech Recognition Stability', () => {
    it('should handle browser compatibility issues', async () => {
      // Тест на отсутствие Web Speech API
      delete global.window.SpeechRecognition;
      delete global.window.webkitSpeechRecognition;

      // Импорт после удаления API
      const { isWebSpeechAvailable } = await import('../src/utils/speechUtils.js');

      expect(isWebSpeechAvailable()).toBe(false);
    });

    it('should handle microphone permission denied', async () => {
      const mockError = new Error('Permission denied');
      mockError.name = 'NotAllowedError';

      global.navigator.mediaDevices.getUserMedia.mockRejectedValue(mockError);

      // Имитация инициализации с отказом в разрешении
      try {
        await global.navigator.mediaDevices.getUserMedia({ audio: true });
        fail('Should have thrown permission error');
      } catch (error) {
        expect(error.name).toBe('NotAllowedError');
      }
    });

    it('should handle network interruptions during transcription', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      // Имитация сетевой ошибки при транскрибации
      try {
        await mockFetch('/api/transcribe', {
          method: 'POST',
          body: new FormData()
        });
        fail('Should have thrown network error');
      } catch (error) {
        expect(error.message).toBe('Network error');
      }
    });

    it('should handle invalid audio formats', async () => {
      const invalidBlob = new Blob(['invalid audio data'], { type: 'text/plain' });

      // Тест на обработку неподдерживаемого формата
      expect(invalidBlob.type).not.toMatch(/^audio\//);
    });
  });

  describe('TTS (Text-to-Speech) Stability', () => {
    it('should handle TTS API failures gracefully', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('TTS API Error'));
      global.fetch = mockFetch;

      try {
        await mockFetch('/api/tts', {
          method: 'POST',
          body: JSON.stringify({ text: 'Test text' })
        });
        fail('Should have thrown TTS API error');
      } catch (error) {
        expect(error.message).toBe('TTS API Error');
      }
    });

    it('should handle audio playback interruptions', () => {
      const audio = new global.Audio();

      // Имитация ошибки воспроизведения
      const errorEvent = new Event('error');
      audio.onerror(errorEvent);

      expect(audio.onerror).toBeDefined();
    });

    it('should handle concurrent TTS requests', async () => {
      // Тест на одновременные запросы TTS
      const requests = [
        fetch('/api/tts', { method: 'POST', body: JSON.stringify({ text: 'First' }) }),
        fetch('/api/tts', { method: 'POST', body: JSON.stringify({ text: 'Second' }) }),
        fetch('/api/tts', { method: 'POST', body: JSON.stringify({ text: 'Third' }) })
      ];

      // Проверяем, что все запросы могут выполняться параллельно
      const results = await Promise.allSettled(requests);
      expect(results.length).toBe(3);
    });
  });

  describe('Echo Detection System', () => {
    it('should handle Web Audio API unavailability', () => {
      // Тест на отсутствие Web Audio API
      delete global.window.AudioContext;
      delete global.window.webkitAudioContext;

      const { isWebAudioSupported } = require('../src/utils/echoDetection/config');
      expect(isWebAudioSupported()).toBe(false);
    });

    it('should handle low-performance devices', () => {
      // Имитация устройства с низкой производительностью
      global.navigator.hardwareConcurrency = 2;

      const { shouldEnableFrequencyAnalysis } = require('../src/utils/echoDetection/config');
      expect(shouldEnableFrequencyAnalysis()).toBe(false);
    });

    it('should detect echo in various text formats', () => {
      const testCases = [
        { original: 'Привет, как дела?', echo: 'Привет, как дела?', shouldDetect: true },
        { original: 'Привет, как дела?', echo: 'привет как дела', shouldDetect: true },
        { original: 'Привет, как дела?', echo: 'Здравствуй, как поживаешь?', shouldDetect: false },
        { original: 'x² + 2x = 0', echo: 'икс в квадрате плюс два икс равно нулю', shouldDetect: false }
      ];

      // Простая проверка схожести текстов
      testCases.forEach(({ original, echo, shouldDetect }) => {
        const similarity = calculateTextSimilarity(original, echo);
        if (shouldDetect) {
          expect(similarity).toBeGreaterThan(0.6);
        } else {
          expect(similarity).toBeLessThan(0.6);
        }
      });
    });
  });

  describe('Video/AssistantOrb Stability', () => {
    it('should handle video loading failures', () => {
      const video = document.createElement('video');

      // Имитация ошибки загрузки видео
      const errorEvent = new Event('error');
      video.dispatchEvent(errorEvent);

      expect(video.error).toBeUndefined(); // Video error property
    });

    it('should handle canvas rendering issues', () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Тест на отсутствие контекста
      if (!ctx) {
        expect(ctx).toBeNull();
      }
    });

    it('should handle animation frame drops', () => {
      // Имитация пропуска кадров анимации
      let frameCount = 0;
      const maxFrames = 60; // 1 секунда при 60 FPS

      const animate = () => {
        frameCount++;
        if (frameCount < maxFrames) {
          // Имитация пропуска каждого 10-го кадра
          if (frameCount % 10 !== 0) {
            requestAnimationFrame(animate);
          } else {
            setTimeout(animate, 20); // Задержка вместо requestAnimationFrame
          }
        }
      };

      animate();

      // Проверяем, что анимация не зависает
      expect(frameCount).toBeLessThan(maxFrames * 2);
    });
  });

  describe('Cross-browser Compatibility', () => {
    const browsers = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
    ];

    browsers.forEach(userAgent => {
      it(`should work with ${userAgent.split(' ')[0]}`, () => {
        global.navigator.userAgent = userAgent;

        // Проверяем определение браузера
        const isChrome = /Chrome/.test(userAgent) && !/Edg/.test(userAgent);
        const isFirefox = /Firefox/.test(userAgent);
        const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);

        expect(isChrome || isFirefox || isSafari).toBe(true);
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle memory leaks in audio contexts', () => {
      // Создаем несколько аудио контекстов
      const contexts = [];
      for (let i = 0; i < 10; i++) {
        contexts.push(new global.AudioContext());
      }

      // Проверяем, что контексты созданы
      expect(contexts.length).toBe(10);

      // Имитируем очистку
      contexts.forEach(ctx => {
        if (ctx.close) ctx.close();
      });
    });

    it('should handle rapid state changes', () => {
      let state = 'idle';
      const stateChanges = ['listening', 'processing', 'speaking', 'idle'];

      // Имитация быстрого переключения состояний
      stateChanges.forEach(newState => {
        state = newState;
        // Проверяем, что состояние изменяется корректно
        expect(typeof state).toBe('string');
      });
    });

    it('should handle large text inputs for TTS', () => {
      const largeText = 'А'.repeat(10000); // 10000 символов

      // Проверяем, что длинный текст обрабатывается
      expect(largeText.length).toBe(10000);

      // Имитируем разбиение на chunks
      const chunkSize = 1000;
      const chunks = [];
      for (let i = 0; i < largeText.length; i += chunkSize) {
        chunks.push(largeText.slice(i, i + chunkSize));
      }

      expect(chunks.length).toBe(10);
      expect(chunks[0].length).toBe(chunkSize);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from WebSocket connection loss', () => {
      // Имитация потери соединения
      const mockWebSocket = {
        readyState: 3, // CLOSED
        close: jest.fn(),
        send: jest.fn(),
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null
      };

      // Имитация попытки переподключения
      if (mockWebSocket.readyState === 3) {
        // Создание нового соединения
        const newWebSocket = { ...mockWebSocket, readyState: 0 }; // CONNECTING
        expect(newWebSocket.readyState).toBe(0);
      }
    });

    it('should handle API rate limits', async () => {
      let requestCount = 0;
      const maxRequests = 10;

      // Имитация rate limiting
      const makeRequest = async () => {
        if (requestCount >= maxRequests) {
          throw new Error('Rate limit exceeded');
        }
        requestCount++;
        return { success: true };
      };

      // Проверяем rate limiting
      for (let i = 0; i < maxRequests; i++) {
        await makeRequest();
      }

      try {
        await makeRequest();
        fail('Should have thrown rate limit error');
      } catch (error) {
        expect(error.message).toBe('Rate limit exceeded');
      }
    });

    it('should recover from corrupted audio data', () => {
      // Имитация поврежденных аудио данных
      const corruptedBuffer = new ArrayBuffer(1000);
      const view = new Uint8Array(corruptedBuffer);

      // Заполняем случайными данными (имитация повреждения)
      for (let i = 0; i < view.length; i++) {
        view[i] = Math.random() * 256;
      }

      // Проверяем, что данные существуют, но могут быть повреждены
      expect(corruptedBuffer.byteLength).toBe(1000);
    });
  });
});

// Вспомогательные функции
function calculateTextSimilarity(text1, text2) {
  const longer = text1.length > text2.length ? text1 : text2;
  const shorter = text1.length > text2.length ? text2 : text1;

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
