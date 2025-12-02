import OpenAI from 'openai';

const apiKey = import.meta.env.VITE_OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY;

// API endpoints configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
};

function shouldRetry(error: any, attempt: number): boolean {
  if (error?.response?.status === 401 || error?.response?.status === 403 || error?.response?.status === 400) {
    return false;
  }

  if (
    error?.code === 'ECONNRESET' ||
    error?.code === 'ETIMEDOUT' ||
    error?.code === 'ENOTFOUND' ||
    error?.code === 'ECONNREFUSED' ||
    (error?.response?.status >= 500 && error?.response?.status < 600) ||
    error?.response?.status === 429
  ) {
    return attempt < RETRY_CONFIG.maxRetries;
  }

  return attempt < RETRY_CONFIG.maxRetries;
}

function calculateDelay(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffFactor, attempt - 1);
  const jitter = Math.random() * 0.1 * delay;
  return Math.min(delay + jitter, RETRY_CONFIG.maxDelay);
}

async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  customShouldRetry?: (error: any, attempt: number) => boolean
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`[OpenAI] ${operationName} - attempt ${attempt}/${RETRY_CONFIG.maxRetries}`);
      const result = await operation();
      return result;
    } catch (error: any) {
      lastError = error;
      console.warn(`[OpenAI] ${operationName} - attempt ${attempt} failed:`, error.message);

      const shouldRetryFn = customShouldRetry || shouldRetry;
      if (!shouldRetryFn(error, attempt)) {
        break;
      }

      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = calculateDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

if (!apiKey) {
  console.warn('OpenAI API key is not defined. Please set VITE_OPENAI_API_KEY in your environment.');
}

// Use backend API endpoints instead of direct OpenAI calls
console.log('OpenAI service initialized - using backend API endpoints');

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

class TeacherAI {
  private systemPrompt: string;
  private audioContext?: AudioContext;

  constructor() {
    this.systemPrompt = `Ты — ИИ-учитель Юлия.

ТВОЯ РОЛЬ
- Ты — онлайн-репетитор и учитель.
- Ты помогаешь ученикам понимать школьные предметы, объясняешь сложные темы простым языком.
- Твоя основа — педагогика, дидактика, индивидуальный подход к каждому ученику.
- Ты терпеливая, доброжелательная, но требовательная учительница.

СТИЛЬ И ФОРМАТ ОТВЕТОВ
- Отвечаешь понятно и по делу. Типичный ответ — 3–5 предложений.
- В КАЖДОМ ОТВЕТЕ ЗАДАВАЙ ТОЛЬКО ОДИН ВОПРОС для проверки понимания!
- Если ученик отвечает коротко, задаёшь уточняющий вопрос.
- Используешь примеры из жизни для объяснения сложных тем.
- Хвалишь за правильные ответы и мягко исправляешь ошибки.
- Всегда подбадриваешь и мотивируешь учиться.

ПРИНЦИПЫ ОБУЧЕНИЯ
- Объясняешь от простого к сложному.
- Используешь аналогии и метафоры.
- Проверяешь понимание вопросами.
- Даёшь практические задания.
- Отмечаешь прогресс ученика.

ФОРМАТ ТИПИЧНОГО ОТВЕТА
1) 1–2 предложения: объяснение темы.
2) 1 предложение: пример из жизни.
3) 1 предложение: проверочный вопрос.

ТЕХНИЧЕСКИЕ МОМЕНТЫ
- Если спрашивают, кто ты, честно объясняешь, что ты ИИ-учитель.
- ВСЕ ЦИФРЫ ДОЛЖНЫ БЫТЬ НАПИСАНЫ СЛОВАМИ.
- Всегда сохраняешь уважительный и дружелюбный тон.

ТВОЯ ЦЕЛЬ
Помогать ученикам понимать учебный материал, развивать интерес к обучению и достигать успехов в учёбе.`;
  }

  async getResponse(messages: ChatMessage[], memoryContext = ''): Promise<string> {
    try {
      const conversation = [
        { role: 'system' as const, content: this.systemPrompt },
        ...(memoryContext ? [{ role: 'system' as const, content: `Контекст: ${memoryContext}` }] : []),
        ...messages.slice(-10),
      ];

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: conversation,
        max_tokens: 500,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) throw new Error('No response from OpenAI');

      return response;
    } catch (error) {
      console.error('Error getting AI response:', error);
      return 'Извините, я временно недоступна. Повторите ваш вопрос через минуту.';
    }
  }

  async transcribeAudio(audioBlob: Blob): Promise<string> {
    console.log(`[OpenAI] Transcribe via backend: ${audioBlob.size} bytes, type: ${audioBlob.type}`);

    return withRetry(async () => {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch(`${API_BASE_URL}/transcribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Transcription failed');
      }

      const data = await response.json();
      console.log('✅ Transcription result:', data.text);

      if (!data.text || !data.text.trim()) {
        throw new Error("Empty transcription result");
      }

      return data.text.trim();
    }, "transcribeAudio");
  }

  async getVoiceResponse(messages: ChatMessage[], memoryContext = '', fastMode = false): Promise<string> {
    return withRetry(async () => {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          messages,
          memoryContext,
          fastMode,
          systemPrompt: this.systemPrompt
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Chat request failed');
      }

      const data = await response.json();
      console.log('✅ Chat response:', data.message?.substring(0, 50) + '...');

      if (!data.message) {
        throw new Error("Empty chat response");
      }

      return data.message;
    }, "getVoiceResponse");
  }

  async synthesizeSpeech(text: string, options: { model?: string; voice?: string; format?: string } = {}): Promise<ArrayBuffer> {
    return withRetry(async () => {
      console.log(`[TTS] Synthesizing via backend: "${text.substring(0, 50)}..."`);

      const response = await fetch(`${API_BASE_URL}/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          text,
          ...options
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Speech synthesis failed');
      }

      const arrayBuffer = await response.arrayBuffer();
      console.log(`[TTS] Speech synthesized successfully, buffer size: ${arrayBuffer.byteLength} bytes`);

      if (arrayBuffer.byteLength === 0) {
        throw new Error("Received empty audio buffer");
      }

      return arrayBuffer;
    }, "synthesizeSpeech");
  }
}

export const psychologistAI = new TeacherAI();

