import { useState, useRef, useCallback } from 'react';
import { psychologistAI, ChatMessage } from '@/services/openai';
import { getCourseDisplayName } from '@/lib/utils';

interface UseLLMProps {
  courseId?: string;
  onResponseGenerated?: (text: string) => Promise<void>;
  onError?: (error: string) => void;
}

export const useLLM = ({ courseId, onResponseGenerated, onError }: UseLLMProps) => {
  const conversationRef = useRef<ChatMessage[]>([]);
  const memoryRef = useRef<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const currentProcessingTextRef = useRef<string>('');

  const loadUserProfile = useCallback(async () => {
    // Build context from course info
    const courseName = getCourseDisplayName(courseId || "");
    if (courseName) {
      memoryRef.current = `Курс: ${courseName}`;
    }
    console.log("[LLM] User context loaded");
  }, [courseId]);

  const processUserMessage = useCallback(async (text: string) => {
    const callId = Date.now();
    console.log(`[LLM] processUserMessage called (ID: ${callId}) with: "${text}"`);
    if (!text.trim()) return;

    if (isProcessing) {
      console.log(`[LLM] Skipping call (ID: ${callId}) - already processing`);
      return;
    }

    const trimmedText = text.trim();
    if (currentProcessingTextRef.current === trimmedText) {
      console.log(`[LLM] Skipping call (ID: ${callId}) - same text already being processed`);
      return;
    }

    setIsProcessing(true);
    currentProcessingTextRef.current = trimmedText;
    conversationRef.current.push({ role: "user", content: text });

    try {
      console.log(`[LLM] Calling getVoiceResponse...`);
      const assistantReply = await psychologistAI.getVoiceResponse(
        conversationRef.current,
        memoryRef.current,
        false
      );
      console.log(`[LLM] Got response: "${assistantReply?.substring(0, 50)}..."`);

      conversationRef.current.push({ role: "assistant", content: assistantReply });

      if (onResponseGenerated) {
        console.log(`[LLM] Calling onResponseGenerated callback`);
        await onResponseGenerated(assistantReply);
      }

    } catch (error) {
      console.error("[LLM] Error generating response:", error);
      onError?.("Не удалось сгенерировать ответ");
    } finally {
      currentProcessingTextRef.current = '';
      setIsProcessing(false);
    }
  }, [onResponseGenerated, onError]);

  const addToConversation = useCallback((role: 'user' | 'assistant' | 'system', content: string) => {
    conversationRef.current.push({ role, content });
  }, []);

  const clearConversation = useCallback(() => {
    conversationRef.current = [];
  }, []);

  return {
    processUserMessage,
    loadUserProfile,
    addToConversation,
    clearConversation,
    isProcessing,
    memoryRef,
    conversationRef
  };
};

