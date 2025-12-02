/**
 * Hook для транскрибации аудио через OpenAI Whisper
 * С фильтрацией галлюцинаций и retry логикой
 */

import { useCallback, useState, useRef } from 'react';
import { 
  API_URL,
  HALLUCINATION_PATTERNS,
  MEANINGLESS_PATTERNS,
  MAX_TRANSCRIPTION_LENGTH,
  MAX_TRANSCRIPTION_SENTENCES,
  RETRY_MAX_ATTEMPTS,
  RETRY_BASE_DELAY,
  RETRY_MAX_DELAY,
  RETRY_BACKOFF_FACTOR
} from '../config';

interface UseTranscriptionOptions {
  token: string | null;
  onError?: (error: Error) => void;
}

interface UseTranscriptionReturn {
  transcribe: (audioBlob: Blob) => Promise<string | null>;
  isTranscribing: boolean;
  lastProcessedText: string;
  resetLastProcessedText: () => void;
}

/**
 * Фильтрация галлюцинаций Whisper
 */
const filterHallucinatedText = (text: string): string | null => {
  if (!text) return null;

  const trimmedText = text.trim();
  const lowerText = trimmedText.toLowerCase();

  // Проверяем паттерны галлюцинаций
  for (const pattern of HALLUCINATION_PATTERNS) {
    if (pattern.test(lowerText)) {
      console.log('🚫 Отфильтрована галлюцинация:', trimmedText);
      return null;
    }
  }

  // Проверяем бессмысленные звуки
  for (const pattern of MEANINGLESS_PATTERNS) {
    if (pattern.test(trimmedText)) {
      console.log('🚫 Отфильтрован бессмысленный звук:', trimmedText);
      return null;
    }
  }

  // Проверяем длину (защита от длинных галлюцинаций)
  if (trimmedText.length > MAX_TRANSCRIPTION_LENGTH) {
    console.log('🚫 Текст слишком длинный (возможно галлюцинация):', trimmedText.substring(0, 50) + '...');
    return null;
  }

  // Проверяем количество предложений
  const sentences = trimmedText.split(/[.!?]/).filter(s => s.trim().length > 0);
  if (sentences.length > MAX_TRANSCRIPTION_SENTENCES) {
    console.log('🚫 Слишком много предложений (возможно галлюцинация):', sentences.length);
    return null;
  }

  // Проверяем минимальную длину
  if (trimmedText.length < 2) {
    console.log('🚫 Текст слишком короткий:', trimmedText);
    return null;
  }

  return trimmedText;
};

/**
 * Расчет задержки для retry с экспоненциальным backoff
 */
const calculateRetryDelay = (attempt: number): number => {
  const delay = RETRY_BASE_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1);
  // Добавляем jitter для избежания одновременных повторных попыток
  const jitter = Math.random() * 0.1 * delay;
  return Math.min(delay + jitter, RETRY_MAX_DELAY);
};

/**
 * Проверка, стоит ли повторять попытку при ошибке
 */
const shouldRetry = (error: any, attempt: number): boolean => {
  // Не повторяем при аутентификационных ошибках
  if (error?.status === 401 || error?.status === 403) {
    return false;
  }

  // Не повторяем при ошибках валидации
  if (error?.status === 400) {
    return false;
  }

  // Повторяем при сетевых ошибках, таймаутах, серверных ошибках
  return attempt < RETRY_MAX_ATTEMPTS;
};

export const useTranscription = ({ token, onError }: UseTranscriptionOptions): UseTranscriptionReturn => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  // Отслеживание последнего обработанного текста для дедупликации
  const lastProcessedTextRef = useRef<string>('');

  /**
   * Сброс последнего обработанного текста
   */
  const resetLastProcessedText = useCallback(() => {
    lastProcessedTextRef.current = '';
  }, []);

  /**
   * Транскрибация аудио через OpenAI Whisper API с retry логикой
   */
  const transcribe = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
      try {
        console.log(`🎤 Транскрибация через OpenAI Whisper (попытка ${attempt}/${RETRY_MAX_ATTEMPTS})...`);
        console.log('📊 Параметры аудио:', {
          size: audioBlob.size + ' bytes',
          type: audioBlob.type,
          estimatedDuration: Math.round(audioBlob.size / 32000) + ' сек'
        });
        
        setIsTranscribing(true);

        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        const response = await fetch(`${API_URL}/transcribe`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        console.log('🌐 Получен ответ от сервера транскрибации:', {
          status: response.status,
          statusText: response.statusText
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('❌ Ответ сервера не OK:', response.status, response.statusText, errorData);
          
          const error = new Error(errorData.error || 'Transcription failed') as any;
          error.status = response.status;
          throw error;
        }

        const data = await response.json();
        
        // Фильтруем галлюцинации
        const filteredText = filterHallucinatedText(data.text);
        
        if (!filteredText) {
          console.log('⚠️ Транскрипция отфильтрована как галлюцинация');
          return null;
        }

        // Проверяем дедупликацию
        if (filteredText === lastProcessedTextRef.current) {
          console.log('⚠️ Дублирующаяся транскрипция, пропускаем:', filteredText);
          return null;
        }

        // Проверяем, является ли текст расширением предыдущего
        const lastText = lastProcessedTextRef.current;
        if (lastText && filteredText.startsWith(lastText) && filteredText.length > lastText.length) {
          console.log('⚠️ Текст является расширением предыдущего, пропускаем');
          lastProcessedTextRef.current = filteredText;
          return null;
        }

        console.log('✅ Транскрибация завершена успешно:', {
          text: filteredText,
          language: data.language,
          textLength: filteredText.length
        });
        
        lastProcessedTextRef.current = filteredText;
        return filteredText;

      } catch (error: any) {
        lastError = error;
        console.warn(`❌ Попытка ${attempt} неудачна:`, error.message);

        if (!shouldRetry(error, attempt)) {
          console.error('❌ Прекращаем попытки транскрибации');
          break;
        }

        if (attempt < RETRY_MAX_ATTEMPTS) {
          const delay = calculateRetryDelay(attempt);
          console.log(`⏳ Ожидание ${delay}ms перед повторной попыткой...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Все попытки исчерпаны
    console.error('❌ Все попытки транскрибации исчерпаны');
    onError?.(lastError || new Error('Transcription failed after retries'));
    setIsTranscribing(false);
    return null;
  }, [token, onError]);

  return {
    transcribe,
    isTranscribing,
    lastProcessedText: lastProcessedTextRef.current,
    resetLastProcessedText
  };
};

