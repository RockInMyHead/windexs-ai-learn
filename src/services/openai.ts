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
    return withRetry(async () => {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          messages,
          memoryContext,
          systemPrompt: this.systemPrompt,
          fastMode: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Chat request failed');
      }

      const data = await response.json();
      if (!data.message) throw new Error('No response from backend');

      return data.message;
    }, "getResponse");
  }

  async transcribeAudio(audioBlob: Blob): Promise<string> {
    console.log(`[OpenAI] Transcribe via backend: ${audioBlob.size} bytes, type: ${audioBlob.type}`);

    return withRetry(async () => {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch(`${API_BASE_URL}/transcribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
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
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
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
      const synthId = Date.now();
      console.log(`[TTS-API] 🎤 synthesizeSpeech called (ID: ${synthId})`);
      console.log(`[TTS-API] 📝 Text: "${text.substring(0, 80)}..." (${text.length} chars)`);
      console.log(`[TTS-API] ⚙️ Options:`, { model: options.model || 'default', voice: options.voice || 'default', format: options.format || 'default' });
      
      const token = localStorage.getItem('token');
      const requestStartTime = Date.now();

      const response = await fetch(`${API_BASE_URL}/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text,
          ...options
        })
      });

      const requestDuration = Date.now() - requestStartTime;
      console.log(`[TTS-API] 📡 Request completed (ID: ${synthId}): status=${response.status}, took=${requestDuration}ms`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`[TTS-API] ❌ Request failed (ID: ${synthId}):`, errorData);
        throw new Error(errorData.error || 'Speech synthesis failed');
      }

      const arrayBuffer = await response.arrayBuffer();
      console.log(`[TTS-API] ✅ Speech synthesized successfully (ID: ${synthId}): buffer size=${arrayBuffer.byteLength} bytes, total time=${Date.now() - requestStartTime}ms`);

      if (arrayBuffer.byteLength === 0) {
        console.error(`[TTS-API] ❌ Empty audio buffer received (ID: ${synthId})`);
        throw new Error("Received empty audio buffer");
      }

      return arrayBuffer;
    }, "synthesizeSpeech");
  }
}

export const psychologistAI = new TeacherAI();

