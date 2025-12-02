/**
 * Hook для Text-to-Speech через OpenAI TTS
 * С дедупликацией и потоковым воспроизведением
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { 
  API_URL, 
  TTS_VOICE, 
  TTS_SPEED, 
  TTS_RETRY_COUNT,
  TTS_EXTENSION_MIN_CHARS,
  TTS_MINOR_VARIATION_PERCENT,
  TTS_MINOR_VARIATION_MAX_CHARS
} from '../config';
import { TTSProgress } from '../types';

interface UseTTSOptions {
  token: string | null;
  isSoundEnabled: boolean;
  isRecording: boolean;
  onSpeakingChange: (isSpeaking: boolean) => void;
  onBlockVAD: (blocked: boolean) => void;
  onError?: (error: Error) => void;
}

interface UseTTSReturn {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  generationId: number;
  incrementGenerationId: () => void;
  resetDeduplication: () => void;
  isSpeakingRef: React.MutableRefObject<boolean>;
}

export const useTTS = ({
  token,
  isSoundEnabled,
  isRecording,
  onSpeakingChange,
  onBlockVAD,
  onError
}: UseTTSOptions): UseTTSReturn => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingAudioRef = useRef<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);
  const ttsProgressRef = useRef<TTSProgress | null>(null);
  const generationIdRef = useRef<number>(0);
  
  // Дедупликация TTS
  const lastProcessedTextRef = useRef<string>('');
  
  // Синхронизация isSpeakingRef с состоянием
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  /**
   * Увеличение ID генерации для отмены текущей
   */
  const incrementGenerationId = useCallback(() => {
    generationIdRef.current += 1;
  }, []);

  /**
   * Сброс дедупликации для нового пользовательского ввода
   */
  const resetDeduplication = useCallback(() => {
    console.log('🔄 [TTS] Сброс дедупликации для нового ввода');
    lastProcessedTextRef.current = '';
  }, []);

  /**
   * Остановка текущего TTS
   */
  const stop = useCallback(() => {
    console.log('🛑 Прерываем речь ассистента');

    // Увеличиваем generationId для отмены текущей генерации
    generationIdRef.current += 1;

    // Останавливаем текущее воспроизведение
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current.volume = 0;
        currentAudioRef.current.muted = true;
        currentAudioRef.current.src = '';
        currentAudioRef.current.load();
      } catch (error) {
        console.warn('⚠️ Ошибка при остановке аудио:', error);
      }
      currentAudioRef.current = null;
    }

    // Сбрасываем состояние
    isPlayingAudioRef.current = false;
    setIsSpeaking(false);
    onSpeakingChange(false);

    // Сбрасываем прогресс озвучки
    ttsProgressRef.current = null;

    // Разблокируем VAD
    onBlockVAD(false);
  }, [onSpeakingChange, onBlockVAD]);

  /**
   * Озвучивание текста с дедупликацией
   */
  const speak = useCallback(async (text: string, retryCount: number = 0) => {
    if (!text || !isSoundEnabled) return;

    const trimmedText = text.trim();
    if (!trimmedText) return;

    // === ДЕДУПЛИКАЦИЯ ===
    const lastProcessed = lastProcessedTextRef.current;
    
    // Проверка на точный дубликат
    if (lastProcessed === trimmedText) {
      console.log('🚫 [TTS] Пропуск точного дубликата:', trimmedText.substring(0, 30) + '...');
      return;
    }

    // Проверка на расширение текста
    if (lastProcessed && trimmedText.startsWith(lastProcessed) && 
        trimmedText.length > lastProcessed.length &&
        (trimmedText.length - lastProcessed.length) > TTS_EXTENSION_MIN_CHARS) {
      console.log('🚫 [TTS] Пропуск расширения текста:', `${lastProcessed.length} -> ${trimmedText.length} символов`);
      lastProcessedTextRef.current = trimmedText;
      return;
    }

    // Проверка на минорную вариацию
    const lengthDiff = Math.abs(trimmedText.length - lastProcessed.length);
    const maxLength = Math.max(trimmedText.length, lastProcessed.length);
    if (lastProcessed && (lengthDiff / maxLength) < TTS_MINOR_VARIATION_PERCENT && lengthDiff < TTS_MINOR_VARIATION_MAX_CHARS) {
      console.log('🚫 [TTS] Пропуск минорной вариации:', `${lengthDiff} символов разницы`);
      lastProcessedTextRef.current = trimmedText;
      return;
    }

    console.log('✅ [TTS] Обработка нового текста:', trimmedText.substring(0, 50) + '...');
    lastProcessedTextRef.current = trimmedText;

    // Захватываем generationId
    const startGenId = generationIdRef.current;

    try {
      console.log('🔊 Генерация озвучки для:', trimmedText.substring(0, 100) + (trimmedText.length > 100 ? '...' : ''));
      if (retryCount > 0) {
        console.log(`🔄 TTS повторная попытка ${retryCount}/${TTS_RETRY_COUNT}`);
      }

      isPlayingAudioRef.current = true;

      // Инициализируем прогресс озвучки
      ttsProgressRef.current = {
        startTime: Date.now(),
        text: text,
        duration: text.length * 60, // Грубая оценка: 60мс на символ
        words: text.split(' '),
        currentWordIndex: 0
      };

      console.log('🌐 Отправка TTS запроса на сервер...');
      const response = await fetch(`${API_URL}/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text,
          voice: TTS_VOICE,
          speed: TTS_SPEED
        })
      });

      console.log('🌐 Получен ответ от сервера TTS:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length')
      });

      // Проверяем прерывание
      if (generationIdRef.current !== startGenId) {
        console.log('🛑 Озвучка прервана до начала воспроизведения');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ TTS error response:', response.status, errorData);

        // Повторная попытка при ошибке
        if (retryCount < TTS_RETRY_COUNT) {
          console.log(`🔄 Повторная попытка TTS через 1 секунду...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return speak(text, retryCount + 1);
        }

        throw new Error(`Failed to generate speech: ${response.status} ${errorData.error || ''}`);
      }

      console.log('📦 Получение аудио blob от сервера...');
      const audioBlob = await response.blob();
      console.log('📦 TTS blob получен:', {
        size: audioBlob.size,
        type: audioBlob.type
      });

      console.log('🔗 Создание Audio URL...');
      const audioUrl = URL.createObjectURL(audioBlob);

      console.log('🎵 Создание Audio объекта...');
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      // Event handlers
      audio.oncanplay = () => {
        console.log('🎵 Audio готово к воспроизведению');
      };

      audio.onplay = () => {
        console.log('🔊 Озвучка начата');
        setIsSpeaking(true);
        onSpeakingChange(true);
        onBlockVAD(true);
      };

      audio.onended = () => {
        console.log('✅ Озвучка завершена успешно');
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        isPlayingAudioRef.current = false;
        setIsSpeaking(false);
        onSpeakingChange(false);
        ttsProgressRef.current = null;
        onBlockVAD(false);
      };

      audio.onerror = (event) => {
        console.error('❌ Ошибка воспроизведения аудио:', event);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        isPlayingAudioRef.current = false;
        setIsSpeaking(false);
        onSpeakingChange(false);
        ttsProgressRef.current = null;
        onBlockVAD(false);
        onError?.(new Error('Audio playback error'));
      };

      // Проверяем прерывание перед воспроизведением
      if (generationIdRef.current !== startGenId) {
        console.log('🛑 Озвучка прервана перед play()');
        URL.revokeObjectURL(audioUrl);
        return;
      }

      console.log('▶️ Попытка воспроизведения аудио...');
      await audio.play();
      console.log('✅ audio.play() выполнен успешно');

    } catch (error: any) {
      console.error('❌ Ошибка TTS:', error);

      // Проверяем, была ли озвучка прервана
      const wasInterrupted = generationIdRef.current !== startGenId;
      const audioWasStopped = !currentAudioRef.current || currentAudioRef.current.paused;
      const isPlaybackError = error.name === 'NotAllowedError' || error.name === 'AbortError' ||
                             error.message?.includes('play') || error.message?.includes('paused');

      console.log('🔍 TTS error analysis:', {
        wasInterrupted,
        audioWasStopped,
        isPlaybackError,
        retryCount
      });

      setIsSpeaking(false);
      onSpeakingChange(false);
      isPlayingAudioRef.current = false;
      ttsProgressRef.current = null;

      // Показываем ошибку только если это реальная ошибка TTS
      if (retryCount === 0 && !wasInterrupted && !audioWasStopped && !isPlaybackError) {
        onError?.(error);
      }
    }
  }, [token, isSoundEnabled, onSpeakingChange, onBlockVAD, onError]);

  return {
    speak,
    stop,
    isSpeaking,
    generationId: generationIdRef.current,
    incrementGenerationId,
    resetDeduplication,
    isSpeakingRef
  };
};

