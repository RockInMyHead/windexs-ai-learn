/**
 * Hook для работы с LLM (Language Model)
 */

import { useCallback, useRef, useState } from 'react';
import { API_URL, LLM_MAX_RETRIES, LLM_TIMEOUT, VOICE_CHAT_LLM_MODEL } from '../config';
import { UserProfile } from '../types';
import { getCourseDisplayName } from '@/lib/utils';

interface UseLLMOptions {
  token: string | null;
  courseId: string | undefined;
  userProfile: UserProfile | null;
  onError?: (error: Error, message: string) => void;
}

interface UseLLMReturn {
  sendMessage: (userMessage: string) => Promise<string>;
  isGenerating: boolean;
  generationId: number;
  cancelGeneration: () => void;
}

export const useLLM = ({
  token,
  courseId,
  userProfile,
  onError
}: UseLLMOptions): UseLLMReturn => {
  const [isGenerating, setIsGenerating] = useState(false);
  const generationIdRef = useRef<number>(0);

  /**
   * Отмена текущей генерации
   */
  const cancelGeneration = useCallback(() => {
    generationIdRef.current += 1;
    setIsGenerating(false);
  }, []);

  /**
   * Отправка сообщения в LLM
   */
  const sendMessage = useCallback(async (userMessage: string, retryCount: number = 0): Promise<string> => {
    const originalMessage = userMessage;

    console.log('🚀 sendToLLM вызвана с сообщением:', `"${userMessage}"`, retryCount > 0 ? `(попытка ${retryCount + 1}/${LLM_MAX_RETRIES + 1})` : '');
    console.log('📏 Длина сообщения:', userMessage.length);
    console.log('🤖 Используется модель:', VOICE_CHAT_LLM_MODEL);

    setIsGenerating(true);

    // Захватываем generationId перед асинхронными операциями
    const startGenId = generationIdRef.current;

    // Индикация долгого ожидания
    let longWaitTimeout: NodeJS.Timeout | null = null;

    try {
      longWaitTimeout = setTimeout(() => {
        if (isGenerating && generationIdRef.current === startGenId) {
          console.log('⏳ LLM запрос занимает больше 5 секунд...');
        }
      }, 5000);

      console.log('🤖 Отправка сообщения в LLM...');

      // Для retry попыток добавляем контекст
      if (retryCount > 0) {
        const prefixes = [
          'Пожалуйста, объясни:',
          'Расскажи мне про:',
          'Помоги мне с:',
          'Я хочу узнать:',
          'Объясни, пожалуйста:'
        ];
        const prefix = prefixes[retryCount - 1] || 'Скажи мне:';
        userMessage = `${prefix} ${userMessage}`;
        console.log('📝 Добавлен префикс для retry:', userMessage);
      }

      // Get course information
      const courseName = getCourseDisplayName(courseId || "");

      // Build context information
      const contextInfo: string[] = [];
      if (courseName) {
        contextInfo.push(`Курс: ${courseName}`);
      }
      if (userProfile) {
        console.log('📊 Профиль пользователя для LLM:', userProfile);
        if (userProfile.learning_style) {
          contextInfo.push(`Стиль обучения: ${userProfile.learning_style}`);
        }
        if (userProfile.difficulty_level) {
          contextInfo.push(`Уровень сложности: ${userProfile.difficulty_level}`);
        }
        if (userProfile.interests && userProfile.interests.length > 0) {
          contextInfo.push(`Интересы: ${userProfile.interests.join(', ')}`);
        }
      }

      const contextString = contextInfo.length > 0 ? `\nКонтекст: ${contextInfo.join('; ')}` : '';

      if (!token) {
        console.error('❌ Токен не найден, отмена запроса');
        throw new Error('Ошибка авторизации');
      }

      // Determine endpoint and body based on courseId
      let endpoint = `${API_URL}/chat/general`;
      const body: any = {
        content: userMessage + contextString,
        messageType: 'voice'
      };

      if (courseId && courseId !== 'general') {
        endpoint = `${API_URL}/chat/${courseId}/message`;
      }

      // Создаем AbortController для таймаута
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.log('⏱️ Запрос к LLM превысил таймаут');
      }, LLM_TIMEOUT);

      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        console.error('❌ Fetch error:', fetchError);

        if (fetchError.name === 'AbortError') {
          if (retryCount < LLM_MAX_RETRIES) {
            console.log(`🔄 Таймаут, повторная попытка ${retryCount + 1}...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return sendMessage(originalMessage, retryCount + 1);
          }
        }

        throw fetchError;
      }

      // Проверяем, не было ли прерывания во время запроса
      if (generationIdRef.current !== startGenId) {
        console.log('🛑 Генерация была прервана пользователем во время запроса к LLM');
        return '';
      }

      if (!response.ok) {
        console.error('❌ Server returned error:', response.status, response.statusText);
        throw new Error(`Failed to get response from LLM: ${response.status}`);
      }

      const textData = await response.text();

      let data;
      try {
        data = JSON.parse(textData);
      } catch (parseError) {
        // Проверяем, не SSE ли это
        if (textData.trim().startsWith('data:')) {
          console.log('🌊 Обнаружен SSE поток, собираем сообщение...');
          const lines = textData.split('\n');
          let fullMessage = '';
          let messageId = '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('data: ')) {
              const jsonStr = trimmedLine.substring(6);
              try {
                const chunk = JSON.parse(jsonStr);
                if (chunk.content) {
                  fullMessage += chunk.content;
                }
                if (chunk.messageId) {
                  messageId = chunk.messageId;
                }
              } catch (e) {
                // Игнорируем битые чанки
              }
            }
          }

          data = { message: fullMessage, messageId };
        } else {
          console.error('❌ JSON Parse Error:', parseError);
          throw new Error('Invalid JSON response from server');
        }
      }

      console.log('🤖 Ответ от LLM получен (длина):', data.message?.length);

      // Проверка на пустой ответ и retry логика
      if (!data.message || data.message.trim().length === 0) {
        console.warn('⚠️ Получен пустой ответ от LLM');

        if (retryCount < LLM_MAX_RETRIES) {
          console.log(`🔄 Запуск повторной попытки ${retryCount + 1}...`);
          const delay = Math.pow(2, retryCount) * 500;
          await new Promise(resolve => setTimeout(resolve, delay));
          return sendMessage(originalMessage, retryCount + 1);
        } else {
          console.error('❌ Все попытки получения ответа исчерпаны');
          return "Извините, я не расслышала. Повторите, пожалуйста.";
        }
      }

      return data.message;
    } catch (error: any) {
      console.error('❌ Ошибка общения с LLM:', error);

      const isTimeout = error.name === 'AbortError' || error.message?.includes('timeout');
      const isNetworkError = error.message?.includes('Failed to fetch') ||
                           error.message?.includes('network') ||
                           error.message?.includes('NetworkError');

      // Retry при ошибке сети или таймауте
      if ((isTimeout || isNetworkError) && retryCount < LLM_MAX_RETRIES) {
        console.log(`🔄 ${isTimeout ? 'Таймаут' : 'Ошибка сети'}, повторная попытка ${retryCount + 1}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return sendMessage(originalMessage, retryCount + 1);
      }

      onError?.(error, isTimeout ? 'timeout' : isNetworkError ? 'network' : 'unknown');

      return "Извините, произошла ошибка связи. Попробуйте еще раз.";
    } finally {
      if (longWaitTimeout) {
        clearTimeout(longWaitTimeout);
      }

      if (generationIdRef.current === startGenId) {
        setIsGenerating(false);
      }
    }
  }, [token, courseId, userProfile, isGenerating, onError]);

  return {
    sendMessage,
    isGenerating,
    generationId: generationIdRef.current,
    cancelGeneration
  };
};

