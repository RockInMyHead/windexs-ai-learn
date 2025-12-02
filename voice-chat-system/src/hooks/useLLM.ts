import { useState, useRef, useCallback } from 'react';
// LLMService interface imported from types/services.ts
// Memory and UserProfile services imported via interfaces

interface UseLLMProps {
  llmService: any; // Will be properly typed
  memoryService?: any;
  userProfileService?: any;
  userId?: string;
  callId?: string | null;
  onResponseGenerated?: (text: string) => Promise<void>;
  onError?: (error: string) => void;
}

export const useLLM = ({ llmService, memoryService, userProfileService, userId, callId, onResponseGenerated, onError }: UseLLMProps) => {
  const conversationRef = useRef<ChatMessage[]>([]);
  const memoryRef = useRef<string>("");
  const userProfileRef = useRef<UserProfile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadUserProfile = useCallback(async () => {
    if (!userId) return;
    try {
      const profile = await userProfileService?.getUserProfile(userId);
      userProfileRef.current = profile;

      // Создаем структурированную память из профиля для использования в промптах
      const profileMemory = buildProfileMemory(profile);
      memoryRef.current = profileMemory;

      console.log("[LLM] User profile loaded");
    } catch (error) {
      console.error("[LLM] Error loading user profile:", error);
      // Fallback to empty profile
      memoryRef.current = "";
    }
  }, [userId]);

  // Функция для создания структурированной памяти из профиля
  const buildProfileMemory = useCallback((profile: UserProfile): string => {
    const parts: string[] = [];

    if (profile.personalityTraits) {
      parts.push(`Черты характера: ${profile.personalityTraits}`);
    }
    if (profile.communicationStyle) {
      parts.push(`Стиль общения: ${profile.communicationStyle}`);
    }
    if (profile.currentConcerns) {
      parts.push(`Текущие тревоги/проблемы: ${profile.currentConcerns}`);
    }
    if (profile.emotionalState) {
      parts.push(`Эмоциональное состояние: ${profile.emotionalState}`);
    }
    if (profile.stressTriggers) {
      parts.push(`Триггеры стресса: ${profile.stressTriggers}`);
    }
    if (profile.interests) {
      parts.push(`Интересы: ${profile.interests}`);
    }
    if (profile.dislikes) {
      parts.push(`Не нравится: ${profile.dislikes}`);
    }
    if (profile.values) {
      parts.push(`Ценности: ${profile.values}`);
    }
    if (profile.workLife) {
      parts.push(`Работа и карьера: ${profile.workLife}`);
    }
    if (profile.relationships) {
      parts.push(`Отношения: ${profile.relationships}`);
    }
    if (profile.family) {
      parts.push(`Семья: ${profile.family}`);
    }
    if (profile.health) {
      parts.push(`Здоровье: ${profile.health}`);
    }
    if (profile.discussedTopics) {
      try {
        const topics = JSON.parse(profile.discussedTopics);
        if (topics.length > 0) {
          parts.push(`Обсужденные темы: ${topics.join(', ')}`);
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    if (profile.recurringThemes) {
      parts.push(`Повторяющиеся темы: ${profile.recurringThemes}`);
    }

    return parts.join('\n');
  }, []);

  const updateUserProfile = useCallback(async (userText: string, assistantText: string) => {
    if (!userId || !callId) return;
    try {
      // Анализируем разговор и обновляем профиль
      await analyzeAndUpdateProfile(userText, assistantText);

      // Обновляем память для следующего использования
      if (userProfileRef.current) {
        memoryRef.current = buildProfileMemory(userProfileRef.current);
      }

      console.log("[LLM] User profile updated");
    } catch (error) {
      console.error("[LLM] Error updating user profile:", error);
    }
  }, [userId, callId, buildProfileMemory]);

  // Функция для анализа разговора и обновления профиля
  const analyzeAndUpdateProfile = useCallback(async (userText: string, assistantText: string) => {
    if (!userProfileRef.current) return;

    const updates: Partial<UserProfile> = {};

    // Простой анализ текста для извлечения информации
    const lowerUserText = userText.toLowerCase();
    const lowerAssistantText = assistantText.toLowerCase();

    // Анализ эмоционального состояния
    if (lowerUserText.includes('тревож') || lowerUserText.includes('волнуюсь') || lowerUserText.includes('боюсь')) {
      updates.emotionalState = 'тревожное';
    } else if (lowerUserText.includes('груст') || lowerUserText.includes('печаль') || lowerUserText.includes('депрессия')) {
      updates.emotionalState = 'грустное';
    } else if (lowerUserText.includes('злюсь') || lowerUserText.includes('раздражен') || lowerUserText.includes('нервничаю')) {
      updates.emotionalState = 'раздраженное';
    }

    // Анализ текущих проблем
    if (lowerUserText.includes('работа') || lowerUserText.includes('работаю')) {
      if (!updates.currentConcerns) updates.currentConcerns = '';
      if (!updates.currentConcerns.includes('работа')) {
        updates.currentConcerns += (updates.currentConcerns ? ', ' : '') + 'проблемы на работе';
      }
    }

    if (lowerUserText.includes('отношения') || lowerUserText.includes('партнер') || lowerUserText.includes('любовь')) {
      if (!updates.currentConcerns) updates.currentConcerns = '';
      if (!updates.currentConcerns.includes('отношения')) {
        updates.currentConcerns += (updates.currentConcerns ? ', ' : '') + 'проблемы в отношениях';
      }
    }

    // Анализ интересов
    if (lowerUserText.includes('люблю') || lowerUserText.includes('интересует') || lowerUserText.includes('увлекаюсь')) {
      // Здесь можно добавить логику извлечения интересов
    }

    // Добавляем тему разговора
    const topics = extractTopics(userText);
    for (const topic of topics) {
      await userProfileApi.addDiscussedTopic(userId!, topic);
    }

    // Обновляем профиль, если есть изменения
    if (Object.keys(updates).length > 0) {
      const updatedProfile = await userProfileApi.updateUserProfile(userId!, updates);
      userProfileRef.current = updatedProfile;
    }
  }, [userId]);

  // Функция для извлечения тем из текста
  const extractTopics = useCallback((text: string): string[] => {
    const topics: string[] = [];
    const lowerText = text.toLowerCase();

    if (lowerText.includes('работа') || lowerText.includes('карьера') || lowerText.includes('бизнес')) {
      topics.push('работа');
    }
    if (lowerText.includes('отношения') || lowerText.includes('любовь') || lowerText.includes('партнер')) {
      topics.push('отношения');
    }
    if (lowerText.includes('семья') || lowerText.includes('родители') || lowerText.includes('дети')) {
      topics.push('семья');
    }
    if (lowerText.includes('здоровье') || lowerText.includes('болезнь') || lowerText.includes('врач')) {
      topics.push('здоровье');
    }
    if (lowerText.includes('деньги') || lowerText.includes('финансы') || lowerText.includes('заработок')) {
      topics.push('финансы');
    }
    if (lowerText.includes('стресс') || lowerText.includes('тревога') || lowerText.includes('депрессия')) {
      topics.push('психическое здоровье');
    }

    return [...new Set(topics)]; // Убираем дубликаты
  }, []);

  // Track current processing text to prevent duplicate processing
  const currentProcessingTextRef = useRef<string>('');

  const processUserMessage = useCallback(async (text: string) => {
    const callId = Date.now();
    console.log(`[LLM] processUserMessage called (ID: ${callId}) with: "${text}"`);
    if (!text.trim()) return;

    // Prevent concurrent processing of user messages
    if (isProcessing) {
      console.log(`[LLM] Skipping call (ID: ${callId}) - already processing a message`);
      return;
    }

    // Prevent processing the same text twice
    const trimmedText = text.trim();
    console.log(`[LLM] Current processing text: "${currentProcessingTextRef.current}"`);
    console.log(`[LLM] New text to process: "${trimmedText}"`);
    if (currentProcessingTextRef.current === trimmedText) {
      console.log(`[LLM] Skipping call (ID: ${callId}) - same text already being processed: "${trimmedText}"`);
      return;
    }

    setIsProcessing(true);
    currentProcessingTextRef.current = trimmedText;
    console.log(`[LLM] Started processing call (ID: ${callId}) for text: "${trimmedText}"`);
    conversationRef.current.push({ role: "user", content: text });
    console.log(`[LLM] Added user message to conversation`);

    try {
      // Generate response
      console.log(`[LLM] Calling getVoiceResponse...`);
      const assistantReply = await psychologistAI.getVoiceResponse(
        conversationRef.current,
        memoryRef.current,
        false
      );
      console.log(`[LLM] Got response: "${assistantReply?.substring(0, 50)}..."`);

      conversationRef.current.push({ role: "assistant", content: assistantReply });

      // Callback to play audio
      if (onResponseGenerated) {
        console.log(`[LLM] Calling onResponseGenerated callback`);
        await onResponseGenerated(assistantReply);
        console.log(`[LLM] onResponseGenerated completed`);
      }

      // Update user profile in background
      void updateUserProfile(text, assistantReply);

    } catch (error) {
      console.error("[LLM] Error generating response:", error);
      onError?.("Не удалось сгенерировать ответ");
    } finally {
      console.log(`[LLM] Finished processing call (ID: ${callId})`);
      currentProcessingTextRef.current = '';
      setIsProcessing(false);
    }
  }, [onResponseGenerated, onError, updateUserProfile]);

  const addToConversation = useCallback((role: 'user' | 'assistant' | 'system', content: string) => {
    conversationRef.current.push({ role, content });
  }, []);

  const clearConversation = useCallback(() => {
    conversationRef.current = [];
  }, []);

  return {
    processUserMessage,
    loadUserProfile,
    updateUserProfile,
    addToConversation,
    clearConversation,
    isProcessing,
    memoryRef,
    conversationRef,
    userProfileRef
  };
};

