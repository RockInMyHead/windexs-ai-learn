import OpenAI from 'openai';

const apiKey = import.meta.env.VITE_OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY;

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

const openai = new OpenAI({
  apiKey,
  dangerouslyAllowBrowser: true,
});

export { openai };

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
    console.log(`[OpenAI] Transcribe: ${audioBlob.size} bytes, type: ${audioBlob.type}`);

    return withRetry(async () => {
      let extension = "webm";
      if (audioBlob.type.includes("mp4") || audioBlob.type.includes("aac") || audioBlob.type.includes("m4a")) {
        extension = "m4a";
      } else if (audioBlob.type.includes("wav")) {
        extension = "wav";
      } else if (audioBlob.type.includes("mpeg") || audioBlob.type.includes("mp3")) {
        extension = "mp3";
      } else if (audioBlob.type.includes("ogg")) {
        extension = "ogg";
      }

      const file = new File([audioBlob], `voice.${extension}`, { type: audioBlob.type || "audio/webm" });

      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        response_format: "text",
        language: "ru",
        prompt: "Урок с учителем. Короткие фразы: Привет, Да, Нет, Понял, Хорошо.",
        temperature: 0.2,
      });

      if (!transcription) throw new Error("Empty transcription result");

      const text = typeof transcription === "string" ? transcription : ((transcription as { text?: string })?.text ?? "");
      if (!text.trim()) throw new Error("Empty transcription result");

      return text;
    }, "transcribeAudio");
  }

  async getVoiceResponse(messages: ChatMessage[], memoryContext = '', fastMode = false): Promise<string> {
    return withRetry(async () => {
      let systemMessages: { role: 'system'; content: string }[] = [
        { role: "system" as const, content: this.systemPrompt }
      ];

      if (memoryContext && memoryContext.trim().length > 0) {
        systemMessages.push({
          role: 'system' as const,
          content: `КОНТЕКСТ УРОКА:\n${memoryContext}\n\nИспользуй эту информацию для персонализированных объяснений.`
        });
      }

      const conversation = [
        ...systemMessages,
        ...messages.slice(-10),
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: conversation,
        max_tokens: fastMode ? 300 : 500,
        temperature: fastMode ? 0.5 : 0.6,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) throw new Error("No response from OpenAI (voice mode)");

      return response;
    }, "getVoiceResponse");
  }

  async synthesizeSpeech(text: string, options: { model?: string; voice?: string; format?: string } = {}): Promise<ArrayBuffer> {
    const defaultOptions = {
      model: "tts-1",
      voice: "nova",
      response_format: "mp3",
      speed: 1.0,
    };

    const finalOptions = { ...defaultOptions, ...options };

    return withRetry(async () => {
      console.log(`[TTS] Synthesizing: "${text.substring(0, 50)}..."`);

      const response = await openai.audio.speech.create({
        model: finalOptions.model,
        voice: finalOptions.voice as any,
        input: text,
        response_format: finalOptions.response_format as any,
        speed: finalOptions.speed,
      });

      const arrayBuffer = await response.arrayBuffer();

      if (arrayBuffer.byteLength === 0) {
        throw new Error("Received empty audio buffer");
      }

      return arrayBuffer;
    }, "synthesizeSpeech");
  }
}

export const psychologistAI = new TeacherAI();

