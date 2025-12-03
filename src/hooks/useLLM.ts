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
    console.log(`[LLM] 🚀 processUserMessage called (ID: ${callId})`);
    console.log(`[LLM] 📝 User text: "${text}" (${text.length} chars)`);
    
    if (!text.trim()) {
      console.log(`[LLM] ⚠️ Empty text, skipping (ID: ${callId})`);
      return;
    }

    if (isProcessing) {
      console.log(`[LLM] ⏸️ Skipping call (ID: ${callId}) - already processing`);
      return;
    }

    const trimmedText = text.trim();
    if (currentProcessingTextRef.current === trimmedText) {
      console.log(`[LLM] ⏸️ Skipping call (ID: ${callId}) - same text already being processed: "${trimmedText.substring(0, 50)}..."`);
      return;
    }

    console.log(`[LLM] ✅ Starting processing (ID: ${callId})`);
    setIsProcessing(true);
    currentProcessingTextRef.current = trimmedText;
    conversationRef.current.push({ role: "user", content: text });
    console.log(`[LLM] 📊 Conversation length: ${conversationRef.current.length} messages`);

    try {
      console.log(`[LLM] 🤖 Calling getVoiceResponse... (ID: ${callId})`);
      const llmStartTime = Date.now();
      const assistantReply = await psychologistAI.getVoiceResponse(
        conversationRef.current,
        memoryRef.current,
        false
      );
      const llmDuration = Date.now() - llmStartTime;
      console.log(`[LLM] ✅ Got response (ID: ${callId}): "${assistantReply?.substring(0, 100)}..." (${assistantReply?.length || 0} chars, took ${llmDuration}ms)`);

      conversationRef.current.push({ role: "assistant", content: assistantReply });

      if (onResponseGenerated) {
        const callbackId = Date.now();
        console.log(`[LLM] 📞 Calling onResponseGenerated callback (ID: ${callbackId})`);
        console.log(`[LLM] 📝 Response text: "${assistantReply?.substring(0, 100)}..." (${assistantReply?.length || 0} chars)`);
        const callbackStartTime = Date.now();
        await onResponseGenerated(assistantReply);
        const callbackDuration = Date.now() - callbackStartTime;
        console.log(`[LLM] ✅ onResponseGenerated callback completed (ID: ${callbackId}, took ${callbackDuration}ms)`);
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

