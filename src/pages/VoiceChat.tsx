import Navigation from "@/components/Navigation";
import { useParams, useNavigate } from "react-router-dom";
import { getCourseDisplayName } from "@/lib/utils";
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { monitorLLMRequest, monitorLLMResponse, isSuspiciousMessage, generateSafeAlternative, generateSuperSafePhrase, updateLearnedAlternatives } from "@/utils/llmMonitoring";
import AssistantOrb from "@/components/AssistantOrb";
// import BackgroundStars from "@/components/BackgroundStars";

// API URL from environment
const API_URL = import.meta.env.VITE_API_URL || 'https://teacher.windexs.ru/api';

// Web Speech API types

// ========================================
// КОНСТАНТЫ ДЛЯ АВТОМАТИЧЕСКОГО РАСПОЗНАВАНИЯ
// ========================================

// VAD (Voice Activity Detection) - автоматическое определение речи
const VAD_SILENCE_DURATION = 1500; // мс тишины после речи для автоотправки
const VAD_MIN_SPEECH_DURATION = 500; // минимальная длительность речи
const VAD_ENERGY_THRESHOLD = 0.01; // порог энергии для определения речи
const VAD_ANALYSIS_INTERVAL = 100; // интервал анализа аудио (мс)

// Настройки буферизации для continuous recording
const RECORDING_CHUNK_SIZE = 100; // размер chunk для MediaRecorder (мс)
const MAX_RECORDING_DURATION = 30000; // максимальная длительность одной записи (мс)

// Модель LLM для голосового чата
const VOICE_CHAT_LLM_MODEL = 'gpt-5.1'; // GPT-5.1 для высококачественного голосового общения

// Функция определения Safari
const isSafari = () => {
  const ua = navigator.userAgent.toLowerCase();
  const result = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium');
  console.log('🌐 Определение браузера:', {
    userAgent: ua,
    isSafari: result,
    hasChrome: ua.includes('chrome'),
    hasSafari: ua.includes('safari')
  });
  return result;
};

// Функция определения устройства, требующего fallback (только Android)
const needsFallbackTranscription = () => {
  const ua = navigator.userAgent.toLowerCase();
  // Используем fallback только для Android устройств (iOS работает хорошо с Web Speech API)
  const needsFallback = /android|blackberry|windows phone|webos/i.test(ua);
  console.log('📱 Определение устройства для fallback:', {
    userAgent: ua,
    needsFallback,
    isIOS: /iphone|ipad|ipod/i.test(ua),
    isAndroid: /android/i.test(ua),
    isDesktop: !/iphone|ipad|ipod|android|blackberry|windows phone|webos/i.test(ua)
  });
  return needsFallback;
};

// Функция определения мобильного устройства (для UI адаптации)
const isMobileDevice = () => {
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /iphone|ipad|ipod|android|blackberry|windows phone|webos/i.test(ua);
  return isMobile;
};

// Функция проверки завершения урока
const checkIfLessonFinished = (response: string): boolean => {
  const lowerResponse = response.toLowerCase();

  // Ключевые фразы, указывающие на завершение урока
  const finishIndicators = [
    'урок закончен',
    'урок завершен',
    'занятие окончено',
    'занятие завершено',
    'мы закончили урок',
    'урок подошел к концу',
    'на этом урок завершается',
    'до свидания',
    'до новых встреч',
    'было приятно заниматься',
    'спасибо за урок',
    'урок окончен'
  ];

  // Проверяем, содержит ли ответ хотя бы одну из фраз
  return finishIndicators.some(indicator => lowerResponse.includes(indicator));
};

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
    mozSpeechRecognition?: new () => SpeechRecognition; // Firefox support
  }
}

const VoiceChat = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { toast } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [useFallbackTranscription, setUseFallbackTranscription] = useState(false);

  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastTranscriptRef = useRef<string>('');
  const lastProcessedTranscriptRef = useRef<string>(''); // Для предотвращения дублирования

  // Механизм отслеживания генерации для отмены при прерывании
  const generationIdRef = useRef<number>(0);

  // Аудио контекст и анализатор для мониторинга громкости
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const microphoneSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const volumeMonitorRef = useRef<number | null>(null);

  // Состояние воспроизведения аудио
  const isPlayingAudioRef = useRef<boolean>(false);

  // Очередь аудио для последовательного воспроизведения
  const audioQueueRef = useRef<ArrayBuffer[]>([]);

  // Отслеживание прогресса озвучки для фильтрации эха
  const ttsProgressRef = useRef<{
    startTime: number;
    text: string;
    duration: number; // примерная длительность в мс
    words: string[]; // слова по порядку
    currentWordIndex: number;
  } | null>(null);

  // Fallback recording refs (for browsers without Web Speech API)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Флаг для предотвращения дублирования запросов к LLM
  const isProcessingLLMRef = useRef<boolean>(false);

  // Forward refs для функций, используемых в VAD (избегаем проблем с порядком объявления)
  const transcribeWithOpenAIRef = useRef<((blob: Blob) => Promise<string | null>) | null>(null);
  const sendToLLMRef = useRef<((message: string) => Promise<string>) | null>(null);
  const speakTextRef = useRef<((text: string) => Promise<void>) | null>(null);
  const stopCurrentTTSRef = useRef<(() => void) | null>(null);
  const navigateRef = useRef<any>(navigate);

  // Update navigate ref when it changes
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // ========================================
  // REFS ДЛЯ АВТОМАТИЧЕСКОГО CONTINUOUS RECORDING (Android)
  // ========================================
  
  // VAD state management
  const vadStateRef = useRef<{
    isSpeaking: boolean;          // Идет ли речь сейчас
    speechStartTime: number;      // Время начала речи
    lastSoundTime: number;        // Время последнего звука
    silenceStartTime: number;     // Время начала тишины
    audioBuffer: Blob[];          // Буфер аудио chunks
    isBlockedByTTS: boolean;      // Заблокирована ли отправка из-за TTS
  }>({
    isSpeaking: false,
    speechStartTime: 0,
    lastSoundTime: 0,
    silenceStartTime: 0,
    audioBuffer: [],
    isBlockedByTTS: false
  });

  // Интервал для VAD анализа
  const vadAnalysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // AudioContext для анализа громкости (используется для VAD)
  const vadAudioContextRef = useRef<AudioContext | null>(null);
  const vadAnalyserRef = useRef<AnalyserNode | null>(null);
  const vadMicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Флаг continuous recording для Android
  const isContinuousRecordingRef = useRef<boolean>(false);


  // Инициализация аудио контекста для анализа
  const initializeAudioContext = useCallback(async (): Promise<AudioContext> => {
    if (audioContextRef.current) {
      return audioContextRef.current;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioContextRef.current = new AudioContextClass();

    // Resume context if suspended (required by some browsers)
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  /**
   * Блокировка/разблокировка отправки во время TTS
   * Эта функция должна быть объявлена рано, так как используется в других функциях
   */
  const setVADBlockedByTTS = useCallback((blocked: boolean) => {
    console.log(blocked ? '🔇 VAD заблокирован - TTS воспроизводится' : '🔊 VAD разблокирован - TTS завершен');
    vadStateRef.current.isBlockedByTTS = blocked;
    
    // Очищаем буфер при блокировке (чтобы не отправить эхо)
    if (blocked) {
      vadStateRef.current.audioBuffer = [];
      vadStateRef.current.isSpeaking = false;
      vadStateRef.current.silenceStartTime = 0;
    }
  }, []);

  // Основная функция прерывания речи ассистента
  const stopAssistantSpeech = useCallback(() => {
    console.log('🛑 Прерываем речь ассистента');

    // Увеличиваем generationId для отмены текущей генерации
    generationIdRef.current += 1;

    // Сбрасываем флаг обработки LLM
    isProcessingLLMRef.current = false;

    // Очищаем последнюю обработанную транскрипцию при прерывании
    lastProcessedTranscriptRef.current = '';

    // Очищаем очередь аудио
    audioQueueRef.current = [];

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

    // Сбрасываем прогресс озвучки
    ttsProgressRef.current = null;
    
    // Разблокируем VAD для Android continuous recording
    setVADBlockedByTTS(false);
  }, [setVADBlockedByTTS]);

  // Function to stop current TTS playback
  const stopCurrentTTS = useCallback(() => {
    stopAssistantSpeech();
  }, []);

  // ========================================
  // АВТОМАТИЧЕСКОЕ CONTINUOUS RECORDING ДЛЯ ANDROID
  // ========================================

  /**
   * Инициализация AudioContext для VAD анализа
   * Создает анализатор громкости для определения речи
   */
  const initializeVADAudioContext = useCallback(async (stream: MediaStream): Promise<void> => {
    try {
      console.log('🎙️ Инициализация VAD AudioContext...');
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      vadAudioContextRef.current = new AudioContextClass();
      
      if (vadAudioContextRef.current.state === 'suspended') {
        await vadAudioContextRef.current.resume();
      }
      
      // Создаем анализатор
      vadAnalyserRef.current = vadAudioContextRef.current.createAnalyser();
      vadAnalyserRef.current.fftSize = 2048;
      vadAnalyserRef.current.smoothingTimeConstant = 0.8;
      
      // Подключаем микрофон к анализатору
      vadMicSourceRef.current = vadAudioContextRef.current.createMediaStreamSource(stream);
      vadMicSourceRef.current.connect(vadAnalyserRef.current);
      
      console.log('✅ VAD AudioContext инициализирован');
    } catch (error) {
      console.error('❌ Ошибка инициализации VAD AudioContext:', error);
    }
  }, []);

  /**
   * Анализ аудио для определения речи (VAD)
   * Возвращает уровень энергии аудио сигнала
   */
  const analyzeAudioEnergy = useCallback((): number => {
    if (!vadAnalyserRef.current) return 0;
    
    const bufferLength = vadAnalyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    vadAnalyserRef.current.getByteFrequencyData(dataArray);
    
    // Вычисляем RMS (Root Mean Square) для определения громкости
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = dataArray[i] / 255.0;
      sum += normalized * normalized;
    }
    
    const rms = Math.sqrt(sum / bufferLength);
    return rms;
  }, []);

  /**
   * Обработка аудио буфера - отправка на транскрибацию
   * Вызывается автоматически когда обнаружена пауза после речи
   */
  const processAudioBuffer = useCallback(async () => {
    const { audioBuffer, speechStartTime, isBlockedByTTS } = vadStateRef.current;
    
    // Проверяем, есть ли что обрабатывать
    if (audioBuffer.length === 0) {
      console.log('⚠️ Аудио буфер пустой, пропускаем обработку');
      return;
    }
    
    // Проверяем минимальную длительность речи
    const speechDuration = Date.now() - speechStartTime;
    if (speechDuration < VAD_MIN_SPEECH_DURATION) {
      console.log(`⚠️ Речь слишком короткая (${speechDuration}ms), пропускаем`);
      vadStateRef.current.audioBuffer = [];
      return;
    }
    
    // Проверяем блокировку TTS
    if (isBlockedByTTS) {
      console.log('🔇 Отправка заблокирована - TTS воспроизводится, пропускаем');
      vadStateRef.current.audioBuffer = [];
      return;
    }
    
    // Проверяем, не обрабатывается ли уже запрос
    if (isProcessingLLMRef.current) {
      console.log('⚠️ Запрос к LLM уже обрабатывается, пропускаем');
      vadStateRef.current.audioBuffer = [];
      return;
    }
    
    // Проверяем наличие функций
    if (!transcribeWithOpenAIRef.current || !sendToLLMRef.current || !speakTextRef.current) {
      console.warn('⚠️ Функции еще не инициализированы, пропускаем');
      return;
    }
    
    console.log(`🎯 Обработка аудио буфера (${audioBuffer.length} chunks, ${speechDuration}ms)`);
    
    // Создаем blob из буфера
    const audioBlob = new Blob(audioBuffer, { type: 'audio/webm' });
    vadStateRef.current.audioBuffer = [];
    
    // Устанавливаем флаг обработки
    isProcessingLLMRef.current = true;
    setIsTranscribing(true);
    
    try {
      // Транскрибируем через OpenAI Whisper
      const transcript = await transcribeWithOpenAIRef.current(audioBlob);
      
      if (transcript && transcript.trim()) {
        console.log('✅ Автоматическая транскрипция:', transcript);
        
        // Проверяем дублирование
        if (transcript === lastProcessedTranscriptRef.current) {
          console.log('⚠️ Дублирование транскрипции, пропускаем');
          isProcessingLLMRef.current = false;
          setIsTranscribing(false);
          return;
        }
        
        lastProcessedTranscriptRef.current = transcript;
        
        // Останавливаем текущий TTS если он играет
        if (isSpeaking && stopCurrentTTSRef.current) {
          console.log('🛑 Останавливаем TTS перед новым запросом');
          stopCurrentTTSRef.current();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Отправляем в LLM
        const llmResponse = await sendToLLMRef.current(transcript);
        
        if (llmResponse && llmResponse.trim()) {
          // Озвучиваем ответ
          await speakTextRef.current(llmResponse);
          
          // Проверяем завершение урока
          const isLessonFinished = checkIfLessonFinished(llmResponse);
          if (isLessonFinished) {
            console.log('🎓 Урок завершен! Возвращаемся к списку курсов...');
            setTimeout(() => navigateRef.current('/courses'), 2000);
          }
        }
      }
    } catch (error) {
      console.error('❌ Ошибка обработки аудио буфера:', error);
    } finally {
      isProcessingLLMRef.current = false;
      setIsTranscribing(false);
    }
  }, [isSpeaking]);

  /**
   * VAD цикл - непрерывный анализ аудио для автоматического определения речи
   * Работает в фоне и автоматически отправляет речь на обработку
   */
  const vadAnalysisLoop = useCallback(() => {
    if (!isContinuousRecordingRef.current) return;
    
    const energy = analyzeAudioEnergy();
    const now = Date.now();
    const { isSpeaking: wasSpeaking, lastSoundTime, silenceStartTime, speechStartTime } = vadStateRef.current;
    
    // Определяем, идет ли речь сейчас
    const isSpeaking = energy > VAD_ENERGY_THRESHOLD;
    
    if (isSpeaking) {
      // Обнаружена речь
      vadStateRef.current.lastSoundTime = now;
      
      if (!wasSpeaking) {
        // Начало новой речи
        console.log('🎤 Обнаружено начало речи');
        vadStateRef.current.isSpeaking = true;
        vadStateRef.current.speechStartTime = now;
        vadStateRef.current.silenceStartTime = 0;
      }
    } else {
      // Тишина
      if (wasSpeaking) {
        // Только что закончилась речь
        vadStateRef.current.isSpeaking = false;
        vadStateRef.current.silenceStartTime = now;
        console.log('🔇 Обнаружено окончание речи, ожидаем паузу...');
      } else if (silenceStartTime > 0) {
        // Продолжается тишина после речи
        const silenceDuration = now - silenceStartTime;
        
        // Если тишина достаточно длинная - обрабатываем буфер
        if (silenceDuration >= VAD_SILENCE_DURATION) {
          console.log(`✅ Пауза ${silenceDuration}ms - обрабатываем речь`);
          vadStateRef.current.silenceStartTime = 0;
          
          // Асинхронно обрабатываем буфер
          processAudioBuffer().catch(error => {
            console.error('❌ Ошибка в processAudioBuffer:', error);
          });
        }
      }
    }
  }, [analyzeAudioEnergy, processAudioBuffer]);

  /**
   * Запуск continuous recording с автоматическим VAD
   * Главная функция для Android устройств
   */
  const startContinuousRecording = useCallback(async (): Promise<boolean> => {
    try {
      console.log('🎙️ Запуск continuous recording с автоматическим VAD...');
      
      // Получаем доступ к микрофону
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API недоступен');
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      mediaStreamRef.current = stream;
      
      // Инициализируем VAD AudioContext
      await initializeVADAudioContext(stream);
      
      // Создаем MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      
      // Сбрасываем состояние VAD
      vadStateRef.current = {
        isSpeaking: false,
        speechStartTime: 0,
        lastSoundTime: 0,
        silenceStartTime: 0,
        audioBuffer: [],
        isBlockedByTTS: false
      };
      
      // Обработчик получения аудио данных
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && isContinuousRecordingRef.current) {
          vadStateRef.current.audioBuffer.push(event.data);
          
          // Ограничиваем размер буфера (защита от переполнения)
          if (vadStateRef.current.audioBuffer.length > 300) { // ~30 секунд
            console.log('⚠️ Буфер переполнен, очищаем старые chunks');
            vadStateRef.current.audioBuffer = vadStateRef.current.audioBuffer.slice(-200);
          }
        }
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder ошибка:', event);
      };
      
      // Запускаем запись
      mediaRecorder.start(RECORDING_CHUNK_SIZE);
      isContinuousRecordingRef.current = true;
      
      // Запускаем VAD анализ
      vadAnalysisIntervalRef.current = setInterval(vadAnalysisLoop, VAD_ANALYSIS_INTERVAL);
      
      console.log('✅ Continuous recording запущен с VAD');
      return true;
      
    } catch (error) {
      console.error('❌ Ошибка запуска continuous recording:', error);
      toast({
        title: "Ошибка микрофона",
        description: "Не удалось получить доступ к микрофону",
        variant: "destructive"
      });
      return false;
    }
  }, [initializeVADAudioContext, vadAnalysisLoop, toast]);

  /**
   * Остановка continuous recording
   */
  const stopContinuousRecording = useCallback(() => {
    console.log('🛑 Остановка continuous recording...');
    
    // Останавливаем VAD анализ
    if (vadAnalysisIntervalRef.current) {
      clearInterval(vadAnalysisIntervalRef.current);
      vadAnalysisIntervalRef.current = null;
    }
    
    // Останавливаем запись
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('⚠️ Ошибка остановки MediaRecorder:', e);
      }
    }
    
    // Останавливаем микрофон
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    // Очищаем VAD AudioContext
    if (vadMicSourceRef.current) {
      vadMicSourceRef.current.disconnect();
      vadMicSourceRef.current = null;
    }
    
    if (vadAudioContextRef.current) {
      vadAudioContextRef.current.close();
      vadAudioContextRef.current = null;
    }
    
    // Сбрасываем флаги
    isContinuousRecordingRef.current = false;
    vadStateRef.current.audioBuffer = [];
    
    console.log('✅ Continuous recording остановлен');
  }, []);

  // Check if Web Speech API is available
  const isWebSpeechAvailable = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition;
    return !!SpeechRecognition;
  }, []);

  // Transcribe audio using OpenAI Whisper API (fallback for browsers without Web Speech API)
  const transcribeWithOpenAI = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    try {
      console.log('🎤 Отправка аудио на транскрибацию через OpenAI Whisper...');
      console.log('📊 Размер аудио blob:', audioBlob.size, 'bytes, тип:', audioBlob.type);
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ Ответ сервера не OK:', response.status, response.statusText, errorData);
        throw new Error(errorData.error || 'Transcription failed');
      }

      const data = await response.json();
      console.log('✅ Транскрибация завершена:', data.text);
      return data.text || null;
    } catch (error) {
      console.error('❌ Ошибка транскрибации:', error);
      console.error('❌ Детали ошибки:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        apiUrl: API_URL,
        hasToken: !!token
      });
      toast({
        title: "Ошибка распознавания",
        description: "Не удалось распознать речь. Попробуйте еще раз.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, [token, toast]);

  // Start fallback recording (MediaRecorder + OpenAI Whisper)
  const startFallbackRecording = useCallback(async () => {
    try {
      console.log('🎤 Запуск fallback записи (MediaRecorder)...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast({
          title: "Микрофон недоступен",
          description: "Ваш браузер не поддерживает запись аудио.",
          variant: "destructive"
        });
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      console.log('✅ Fallback запись начата');
      return true;
    } catch (error) {
      console.error('❌ Ошибка запуска fallback записи:', error);
      toast({
        title: "Ошибка микрофона",
        description: "Не удалось получить доступ к микрофону.",
        variant: "destructive"
      });
      return false;
    }
  }, [toast]);

  // Stop fallback recording and transcribe
  const stopFallbackRecording = useCallback(async () => {
    return new Promise<string | null>((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        console.log('🛑 Fallback запись остановлена, chunks:', audioChunksRef.current.length);

        // Stop all tracks
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }

        if (audioChunksRef.current.length === 0) {
          resolve(null);
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];

        // Transcribe using OpenAI
        const text = await transcribeWithOpenAI(audioBlob);
        resolve(text);
      };

      mediaRecorderRef.current.stop();
    });
  }, [transcribeWithOpenAI]);

  // Initialize Web Speech API
  const initializeSpeechRecognition = useCallback(() => {
    // На устройствах, требующих fallback (Android), используем MediaRecorder + Whisper
    if (needsFallbackTranscription()) {
      console.log('📱 Устройство требует fallback, используем OpenAI Whisper для стабильности');
      setUseFallbackTranscription(true);
      return null;
    }

    // Check if Web Speech API is supported (Chrome, Safari, Firefox, Edge)
    const SpeechRecognition = window.SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition; // Firefox support

    if (!SpeechRecognition) {
      console.log('⚠️ Web Speech API не поддерживается, будет использоваться OpenAI Whisper');
      setUseFallbackTranscription(true);
      return null;
    }

    console.log('🎤 Инициализация Web Speech API...');
    const recognition = new SpeechRecognition();

    // Configure recognition - для десктопа используем continuous mode
    recognition.continuous = true; // Keep listening continuously
    recognition.interimResults = true; // Enable interim results to detect speech early
    recognition.lang = 'ru-RU'; // Russian language
    recognition.maxAlternatives = 1;

    // Event handlers
    recognition.onstart = () => {
      console.log('🎙️ Speech recognition started');
      console.log('🎙️ Recognition состояние: started');
      setIsTranscribing(true);
    };

    // Disabled barge-in based on VAD/Speech start because of echo issues
    // recognition.onspeechstart = () => {
    //   console.log('🎤 Speech started');
    //   // Мы больше не прерываем TTS здесь, так как это вызывает ложные срабатывания от эха
    //   // stopAssistantSpeech();
    // };

    // Добавляем дополнительную проверку на начало речи для фильтрации эха
    recognition.onaudiostart = () => {
      // Небольшая задержка чтобы дать системе определить, является ли это эхом
      setTimeout(() => {
        if (isPlayingAudioRef.current && speechRecognitionRef.current) {
          console.log('🔍 Проверяем на эхо при начале аудио...');
          // Здесь можно добавить дополнительную логику анализа
        }
      }, 100);
    };

    recognition.onresult = async (event) => {
      // Don't process if mic is disabled
      if (!isMicEnabled) {
        console.log('🎤 Микрофон отключен, игнорируем результат');
        return;
      }

      const result = event.results[event.results.length - 1]; // Get the last result

      // Обрабатываем interim результаты
      if (!result.isFinal) {
        const interimTranscript = result[0].transcript.trim();
        console.log('👤 Interim распознанный текст:', interimTranscript);
      }

      // Обрабатываем финальные результаты
      if (result.isFinal) {
        const transcript = result[0].transcript.trim();
        console.log('👤 Финальный распознанный текст:', transcript);

        if (transcript) {
          // Проверяем на дублирование транскрипции
          if (transcript === lastProcessedTranscriptRef.current) {
            console.log('⚠️ Дублирование транскрипции обнаружено, пропускаем:', transcript);
            return;
          }

          // Проверяем, не обрабатывается ли уже запрос
          if (isProcessingLLMRef.current) {
            console.log('⚠️ Запрос к LLM уже обрабатывается, пропускаем');
            return;
          }

          isProcessingLLMRef.current = true;
          lastProcessedTranscriptRef.current = transcript;

          // Stop any current TTS
          if (isSpeaking) {
            console.log('🎤 Останавливаю TTS...');
            stopCurrentTTS();
          }

          // Save current transcript for context
          lastTranscriptRef.current = transcript;

          // Send to LLM and get response
          const llmResponse = await sendToLLM(transcript);

          // Перезапускаем распознавание сразу после отправки в LLM
          // (не ждем ответа, чтобы пользователь мог продолжать говорить)
          if (speechRecognitionRef.current && isRecording && !isSafari()) {
            setTimeout(() => {
              try {
                if (speechRecognitionRef.current && isRecording) {
                  speechRecognitionRef.current.start();
                  console.log('▶️ Перезапуск распознавания после отправки в LLM');
                }
              } catch (e: any) {
                if (e.name !== 'InvalidStateError') {
                  console.warn('⚠️ Ошибка перезапуска распознавания:', e);
                }
              }
            }, 500);
          }

          // Проверяем, не пустой ли ответ (означает прерывание)
          if (!llmResponse) {
            console.log('🛑 Ответ от LLM пустой - генерация была прервана');
            isProcessingLLMRef.current = false;
            return;
          }


          // Small delay to ensure previous TTS is fully stopped
          await new Promise(resolve => setTimeout(resolve, 100));

          // Speak the response (only if not empty)
          if (llmResponse && llmResponse.trim()) {
            await speakText(llmResponse);

            // Проверяем, не завершился ли урок
            const isLessonFinished = checkIfLessonFinished(llmResponse);
            if (isLessonFinished) {
              console.log('🎓 Урок завершен! Возвращаемся к списку курсов...');
              setTimeout(() => {
                navigate('/courses');
              }, 2000); // Даем время дослушать финальное сообщение
            }
          } else {
            console.warn('⚠️ Пропускаем озвучивание пустого ответа');
          }

          isProcessingLLMRef.current = false;
          console.log('✅ Ответ озвучен');
        }
      }
    };

    recognition.onerror = (event) => {
      console.error('❌ Speech recognition error:', event.error);
      setIsTranscribing(false);
      
      // Игнорируем не критичные ошибки и перезапускаем
      const nonCriticalErrors = ['no-speech', 'aborted', 'audio-capture'];
      if (nonCriticalErrors.includes(event.error) && isRecording) {
        console.log('ℹ️ Не критичная ошибка, перезапускаем распознавание...');
        setTimeout(() => {
          if (speechRecognitionRef.current && isRecording) {
            try {
              speechRecognitionRef.current.start();
              console.log('✅ Перезапуск после ошибки:', event.error);
            } catch (e: any) {
              if (e.name !== 'InvalidStateError') {
                console.warn('⚠️ Ошибка перезапуска:', e);
              }
            }
          }
        }, 500);
      }
    };

    recognition.onend = () => {
      console.log('🎙️ Speech recognition ended');
      setIsTranscribing(false);

      // In continuous mode, onend usually means an error occurred or intentional stop
      // Restart if we're still in recording state (даже если TTS играет - для прерывания)
      if (isRecording) {
        console.log('🔄 Перезапуск после неожиданной остановки...');
        setTimeout(() => {
          // Double-check we still want to be recording
          if (speechRecognitionRef.current && isRecording) {
            try {
              speechRecognitionRef.current.start();
              console.log('✅ Перезапуск успешен');
            } catch (e: any) {
              if (e.name !== 'InvalidStateError') {
                console.error('❌ Ошибка перезапуска:', e);
              }
            }
          }
        }, 1000); // Longer delay for error recovery
      }
    };

    speechRecognitionRef.current = recognition;
    console.log('✅ Web Speech API инициализирован');
    return recognition;
  }, [isRecording, isMicEnabled, isSoundEnabled]);

  // Start speech recognition
  const startSpeechRecognition = useCallback(() => {
    if (!speechRecognitionRef.current) {
      console.log('❌ Speech recognition не инициализирован');
      return;
    }

    console.log('🎙️ Попытка запуска распознавания речи...', {
      isRecording,
      isTranscribing,
      recognitionState: speechRecognitionRef.current ? 'exists' : 'null'
    });

    try {
      console.log('🎙️ Запуск распознавания речи...');
      speechRecognitionRef.current.start();
      console.log('✅ start() вызван успешно');
    } catch (error: any) {
      // Handle "already started" error gracefully
      if (error.name === 'InvalidStateError') {
        console.log('ℹ️ Распознавание речи уже запущено, продолжаем');
        return;
      }
      console.error('❌ Ошибка запуска speech recognition:', error);
      console.error('❌ Детали ошибки:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      setIsTranscribing(false);
    }
  }, [isRecording, isTranscribing]);

  // Start/stop recording
  const handleStartStopRecording = useCallback(async () => {
    if (isRecording) {
      // ========================================
      // ОСТАНОВКА ЗАПИСИ
      // ========================================
      console.log('🛑 Остановка записи...');
      setIsRecording(false);
      setIsTranscribing(false);

      // Для Android continuous recording - просто останавливаем
      if (useFallbackTranscription && isContinuousRecordingRef.current) {
        stopContinuousRecording();
        return;
      }

      // Для старого fallback режима (ручной режим) - не используется больше
      if (useFallbackTranscription || !isWebSpeechAvailable()) {
        // Stop fallback recording and transcribe
        const transcript = await stopFallbackRecording();

        if (transcript && transcript.trim()) {
          console.log('🎯 Fallback транскрипция:', transcript);

          // Проверяем, не обрабатывается ли уже запрос
          if (isProcessingLLMRef.current) {
            console.log('⚠️ Запрос к LLM уже обрабатывается, пропускаем fallback');
            return;
          }

          isProcessingLLMRef.current = true;

          // Stop any current TTS
          stopCurrentTTS();

          // Send to LLM
          try {
            const llmResponse = await sendToLLM(transcript);
            if (llmResponse && llmResponse.trim()) {
              await speakText(llmResponse);

              // Проверяем, не завершился ли урок
              const isLessonFinished = checkIfLessonFinished(llmResponse);
              if (isLessonFinished) {
                console.log('🎓 Урок завершен! Возвращаемся к списку курсов...');
                setTimeout(() => {
                  navigate('/courses');
                }, 2000); // Даем время дослушать финальное сообщение
              }

              console.log('✅ Ответ озвучен');
            } else {
              console.warn('⚠️ Пропускаем озвучивание пустого ответа');
            }
          } catch (error) {
            console.error('❌ Ошибка обработки ответа:', error);
          } finally {
            isProcessingLLMRef.current = false;
          }
        }
      } else {
        // Web Speech API mode (iOS, Desktop)
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch (error) {
            console.log('Speech recognition already stopped');
          }
        }
      }
    } else {
      // ========================================
      // ЗАПУСК ЗАПИСИ
      // ========================================
      
      // Start recording (only if mic is enabled)
      if (!isMicEnabled) {
        toast({
          title: "Микрофон отключен",
          description: "Включите микрофон для начала записи",
          variant: "destructive"
        });
        return;
      }

      console.log('🎤 Запуск записи...');

      // Для Android - запускаем continuous recording с автоматическим VAD
      if (needsFallbackTranscription()) {
        console.log('📱 Android устройство - используем continuous recording');
        setUseFallbackTranscription(true);
        
        const started = await startContinuousRecording();
        if (started) {
          setIsRecording(true);
          console.log('✅ Continuous recording запущен');
        }
        return;
      }

      // Check if Web Speech API is available (iOS, Desktop)
      if (!isWebSpeechAvailable()) {
        console.log('🔄 Используется fallback режим (OpenAI Whisper)');
        setUseFallbackTranscription(true);

        const started = await startFallbackRecording();
        if (started) {
          setIsRecording(true);
          console.log('🎤 Fallback запись начата');
        }
        return;
      }

      try {
        // Initialize Web Speech API if not already done
        if (!speechRecognitionRef.current) {
          const recognition = initializeSpeechRecognition();
          if (!recognition) {
            // Fallback to OpenAI Whisper if Web Speech API fails
            console.log('🔄 Переключение на fallback режим (OpenAI Whisper)');
            setUseFallbackTranscription(true);

            const started = await startFallbackRecording();
            if (started) {
              setIsRecording(true);
              console.log('🎤 Fallback запись начата');
            }
            return;
          }
        }

        setIsRecording(true);

        // Start speech recognition
        startSpeechRecognition();

        console.log('🎤 Запись начата');
      } catch (error) {
        console.error('❌ Ошибка запуска записи:', error);

        // Try fallback on error
        console.log('🔄 Ошибка Web Speech API, переключение на fallback');
        setUseFallbackTranscription(true);

        const started = await startFallbackRecording();
        if (started) {
          setIsRecording(true);
        }
      }
    }
  }, [
    isRecording, 
    isMicEnabled, 
    useFallbackTranscription,
    isWebSpeechAvailable,
    startContinuousRecording,
    stopContinuousRecording,
    stopFallbackRecording,
    startFallbackRecording,
    initializeSpeechRecognition,
    startSpeechRecognition,
    stopCurrentTTS,
    navigate,
    toast
  ]);

  // Toggle microphone
  const handleToggleMic = useCallback(() => {
    if (isMicEnabled) {
      // Disable mic
      console.log('🎤 Отключение микрофона...');
      setIsMicEnabled(false);
      if (isRecording) {
        // Stop recording if it's active
        setIsRecording(false);
        setIsTranscribing(false);

        // Stop Web Speech API if active
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch (error) {
            console.log('Speech recognition already stopped');
          }
        }

        // Stop fallback recording if active
        if (mediaRecorderRef.current) {
          try {
            mediaRecorderRef.current.stop();
          } catch (error) {
            console.log('MediaRecorder already stopped');
          }
        }
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }
      }
      toast({
        title: "Микрофон отключен",
        description: "Распознавание речи приостановлено"
      });
    } else {
      // Enable mic
      console.log('🎤 Включение микрофона...');
      setIsMicEnabled(true);
      toast({
        title: "Микрофон включен",
        description: "Распознавание речи активно"
      });
    }
  }, [isMicEnabled, isRecording, toast]);

  // Toggle sound
  const handleToggleSound = useCallback(() => {
    if (isSoundEnabled) {
      // Disable sound
      console.log('🔊 Отключение звука...');
      setIsSoundEnabled(false);
      toast({
        title: "Звук отключен",
        description: "Ответы не будут озвучиваться"
      });
    } else {
      // Enable sound
      console.log('🔊 Включение звука...');
      setIsSoundEnabled(true);
      toast({
        title: "Звук включен",
        description: "Ответы будут озвучиваться"
      });
    }
  }, [isSoundEnabled, toast]);

  // Get user profile from API
  const getUserProfile = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const profile = await response.json();
        setUserProfile(profile);
        console.log('📋 Профиль пользователя загружен:', profile);
        return profile;
      }
    } catch (error) {
      console.error('❌ Ошибка загрузки профиля:', error);
    }
    return null;
  }, [token]);

  // Get course name from courseId
  const getCourseName = useCallback(() => {
    return getCourseDisplayName(courseId || "");
  }, [courseId]);

  // Send transcribed text to LLM with Julia's system prompt
  const sendToLLM = useCallback(async (userMessage: string, retryCount: number = 0): Promise<string> => {
    const MAX_RETRIES = 3; // Увеличили количество попыток
    const originalMessage = userMessage;

    console.log('🚀 sendToLLM вызвана с сообщением:', `"${userMessage}"`, retryCount > 0 ? `(попытка ${retryCount + 1}/${MAX_RETRIES + 1})` : '');
    console.log('📏 Длина сообщения:', userMessage.length);
    console.log('🤖 Используется модель:', VOICE_CHAT_LLM_MODEL);

    setIsGeneratingResponse(true);

    // Захватываем generationId перед асинхронными операциями
    const startGenId = generationIdRef.current;

    // Индикация долгого ожидания (объявляем перед try для доступа в finally)
    let longWaitTimeout: NodeJS.Timeout | null = null;

    try {
      // Индикация долгого ожидания
      longWaitTimeout = setTimeout(() => {
        if (isGeneratingResponse && generationIdRef.current === startGenId) {
          console.log('⏳ LLM запрос занимает больше 5 секунд...');
          // Можно показать toast с информацией, но не будем раздражать пользователя
        }
      }, 5000);
      console.log('🤖 Отправка сообщения в LLM...');

      // Мониторинг запроса
      // monitorLLMRequest(userMessage, courseId || 'unknown');

      // Проверка на подозрительное сообщение (для всех попыток, но с разными стратегиями)
      // if (isSuspiciousMessage(userMessage)) {
      //   console.warn('⚠️ Обнаружено подозрительное сообщение:', userMessage);
      //   const safeAlternative = generateSafeAlternative(userMessage);

      //   // Для retry используем более агрессивную замену
      //   if (retryCount > 0) {
      //     // Более радикальная замена для повторных попыток
      //     userMessage = safeAlternative.replace(/работ[а-я]*/gi, 'учимся')
      //       .replace(/давай/gi, 'скажи')
      //       .replace(/продолж[а-я]*/gi, 'давай')
      //       .replace(/начн[а-я]*/gi, 'скажи');
      //     console.log('🔄 Радикальная замена для retry:', userMessage);
      //   } else if (safeAlternative !== userMessage) {
      //     console.log('🔄 Замена на безопасную альтернативу:', safeAlternative);
      //     userMessage = safeAlternative;
      //   }
      // }

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

      // Get user profile if not loaded
      let profile = userProfile;
      if (!profile) {
        profile = await getUserProfile();
      }

      // Get course information
      const courseName = getCourseDisplayName(courseId || "");

      // Build context information
      const contextInfo = [];
      if (courseName) {
        contextInfo.push(`Курс: ${courseName}`);
      }
      if (profile) {
        console.log('📊 Профиль пользователя для LLM:', profile);
        if (profile.learning_style) {
          contextInfo.push(`Стиль обучения: ${profile.learning_style}`);
        }
        if (profile.difficulty_level) {
          contextInfo.push(`Уровень сложности: ${profile.difficulty_level}`);
        }
        if (profile.interests && profile.interests.length > 0) {
          contextInfo.push(`Интересы: ${profile.interests.join(', ')}`);
        }
      }

      const contextString = contextInfo.length > 0 ? `\nКонтекст: ${contextInfo.join('; ')}` : '';
      const startTime = Date.now();

      if (!token) {
        console.error('❌ Токен не найден, отмена запроса');
        toast({
          title: "Ошибка авторизации",
          description: "Пожалуйста, войдите в систему заново",
          variant: "destructive"
        });
        return "Ошибка авторизации";
      }

      console.log('🔑 Token check:', { length: token.length, start: token.substring(0, 10) + '...' });

      // Determine endpoint and body based on courseId
      let endpoint = `${API_URL}/chat/general`;
      let body: any = {
        content: userMessage + contextString, // Server expects 'content'
        messageType: 'voice' // Mark as voice message so it won't appear in text chat
      };

      if (courseId && courseId !== 'general') {
        endpoint = `${API_URL}/chat/${courseId}/message`;
      }

      // Создаем AbortController для таймаута
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.log('⏱️ Запрос к LLM превысил таймаут (30 секунд)');
      }, 30000); // 30 секунд таймаут

      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(body),
          signal: controller.signal // Добавляем сигнал для отмены
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        console.error('❌ Fetch error:', fetchError);

        // Проверяем, была ли это отмена по таймауту
        if (fetchError.name === 'AbortError') {
          console.error('⏱️ Запрос к LLM превысил таймаут (30 секунд)');
          toast({
            title: "Превышено время ожидания",
            description: "Ответ от преподавателя занимает слишком много времени. Попробуйте еще раз.",
            variant: "destructive"
          });

          // Retry при таймауте
          if (retryCount < MAX_RETRIES) {
            console.log(`🔄 Таймаут, повторная попытка ${retryCount + 1}...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return sendToLLM(originalMessage, retryCount + 1);
          }
        } else if (fetchError.message?.includes('Failed to fetch') || fetchError.message?.includes('network')) {
          // Обработка сетевых ошибок
          toast({
            title: "Проблема с соединением",
            description: "Проверьте интернет-соединение и попробуйте еще раз.",
            variant: "destructive"
          });
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
        if (response.status === 401) {
          toast({
            title: "Ошибка авторизации",
            description: "Сессия истекла. Пожалуйста, обновите страницу.",
            variant: "destructive"
          });
        }
        throw new Error(`Failed to get response from LLM: ${response.status}`);
      }

      const textData = await response.text();
      // console.log('📥 Raw server response:', textData.substring(0, 500)); 

      let data;
      try {
        // Попытка распарсить как обычный JSON
        data = JSON.parse(textData);
      } catch (parseError) {
        // Если не вышло, проверяем, не SSE ли это (Server-Sent Events)
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
          console.error('❌ Failed content:', textData.substring(0, 200) + '...');
          throw new Error('Invalid JSON response from server');
        }
      }

      console.log('🤖 Ответ от LLM получен (длина):', data.message?.length);

      // Мониторинг ответа
      // monitorLLMResponse(
      //   userMessage,
      //   courseId || 'unknown',
      //   data.message,
      //   'msg_' + Date.now(),
      //   Date.now() - startTime
      // );

      // Проверка на пустой ответ и retry логика
      if (!data.message || data.message.trim().length === 0) {
        console.warn('⚠️ Получен пустой ответ от LLM');

        if (retryCount < MAX_RETRIES) {
          console.log(`🔄 Запуск повторной попытки ${retryCount + 1}...`);
          // Экспоненциальная задержка перед повтором
          const delay = Math.pow(2, retryCount) * 500;
          await new Promise(resolve => setTimeout(resolve, delay));
          return sendToLLM(originalMessage, retryCount + 1);
        } else {
          console.error('❌ Все попытки получения ответа исчерпаны');
          // Если все попытки исчерпаны, возвращаем нейтральную фразу
          return "Извините, я не расслышала. Повторите, пожалуйста.";
        }
      }

      // Обучение на успешном ответе (если это был retry)
      if (retryCount > 0) {
        console.log('🎓 Обучение: запоминаем успешную альтернативу для:', originalMessage);
        // updateLearnedAlternatives(originalMessage, userMessage); // Disabled due to type mismatch
      }

      return data.message;
    } catch (error: any) {
      console.error('❌ Ошибка общения с LLM:', error);

      // Улучшенная обработка разных типов ошибок
      const isTimeout = error.name === 'AbortError' || error.message?.includes('timeout');
      const isNetworkError = error.message?.includes('Failed to fetch') || 
                           error.message?.includes('network') ||
                           error.message?.includes('NetworkError');

      // Retry при ошибке сети или таймауте
      if ((isTimeout || isNetworkError) && retryCount < MAX_RETRIES) {
        console.log(`🔄 ${isTimeout ? 'Таймаут' : 'Ошибка сети'}, повторная попытка ${retryCount + 1}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return sendToLLM(originalMessage, retryCount + 1);
      }

      // Показываем конкретное сообщение об ошибке
      if (isTimeout) {
        toast({
          title: "Превышено время ожидания",
          description: "Ответ от преподавателя занимает слишком много времени. Попробуйте еще раз.",
          variant: "destructive"
        });
      } else if (isNetworkError) {
        toast({
          title: "Проблема с соединением",
          description: "Проверьте интернет-соединение и попробуйте еще раз.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Ошибка",
          description: "Не удалось получить ответ от ассистента",
          variant: "destructive"
        });
      }

      return "Извините, произошла ошибка связи. Попробуйте еще раз.";
    } finally {
      // Очищаем таймаут индикации долгого ожидания
      if (longWaitTimeout) {
        clearTimeout(longWaitTimeout);
      }

      // Сбрасываем флаг только если это был последний активный запрос
      if (generationIdRef.current === startGenId) {
        setIsGeneratingResponse(false);
      }
    }
  }, [token, courseId, userProfile, toast]);

  // Speak text using OpenAI TTS
  const speakText = useCallback(async (text: string, retryCount: number = 0) => {
    if (!text || !isSoundEnabled) return;

    const MAX_TTS_RETRIES = 2;

    // Захватываем generationId
    const startGenId = generationIdRef.current;

    try {
      console.log('🔊 Генерация озвучки для:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
      if (retryCount > 0) {
        console.log(`🔄 TTS повторная попытка ${retryCount}/${MAX_TTS_RETRIES}`);
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

      const response = await fetch(`${API_URL}/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text,
          voice: 'nova', // Используем голос nova
          speed: 0.95 // Скорость речи (0.25 - 4.0)
        })
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
        if (retryCount < MAX_TTS_RETRIES) {
          console.log(`🔄 Повторная попытка TTS через 1 секунду...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return speakText(text, retryCount + 1);
        }
        
        throw new Error(`Failed to generate speech: ${response.status} ${errorData.error || ''}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      // Event handlers
      audio.onplay = () => {
        console.log('🔊 Озвучка начата');
        // Устанавливаем isSpeaking = true только когда аудио реально начинает играть
        setIsSpeaking(true);
        console.log('🔘 isSpeaking установлен в true - видео должно запуститься');
        
        // Блокируем VAD для Android continuous recording
        setVADBlockedByTTS(true);
        
        // Для браузеров кроме Safari - останавливаем распознавание когда начинается TTS
        const shouldStop = !isSafari() && speechRecognitionRef.current;
        console.log('🔍 Проверка остановки SR:', { 
          isSafari: isSafari(), 
          hasSpeechRecognition: !!speechRecognitionRef.current,
          shouldStop 
        });
        
        if (shouldStop) {
          try {
            console.log('⏸️ Останавливаем распознавание на время TTS (не Safari)');
            speechRecognitionRef.current.stop();
          } catch (e) {
            console.warn('⚠️ Ошибка остановки распознавания:', e);
          }
        }
      };

      audio.onended = () => {
        console.log('✅ Озвучка завершена');
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        isPlayingAudioRef.current = false;
        setIsSpeaking(false);
        
        // Сбрасываем прогресс озвучки
        ttsProgressRef.current = null;
        
        // Разблокируем VAD для Android continuous recording
        setVADBlockedByTTS(false);
        
        // Для браузеров кроме Safari - перезапускаем распознавание после TTS
        if (!isSafari() && speechRecognitionRef.current && isRecording) {
          setTimeout(() => {
            try {
              console.log('▶️ Перезапускаем распознавание после TTS (не Safari)');
              speechRecognitionRef.current?.start();
            } catch (e: any) {
              if (e.name !== 'InvalidStateError') {
                console.warn('⚠️ Ошибка перезапуска распознавания:', e);
              }
            }
          }, 500); // Увеличили задержку с 300ms до 500ms
        }
      };

      audio.onerror = (event) => {
        console.error('❌ Ошибка воспроизведения аудио:', event);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        isPlayingAudioRef.current = false;
        setIsSpeaking(false);
        
        // Сбрасываем прогресс озвучки
        ttsProgressRef.current = null;

        // Разблокируем VAD для Android continuous recording
        setVADBlockedByTTS(false);

        // Для браузеров кроме Safari - перезапускаем распознавание после ошибки
        if (!isSafari() && speechRecognitionRef.current && isRecording) {
          setTimeout(() => {
            try {
              console.log('▶️ Перезапускаем распознавание после ошибки (не Safari)');
              speechRecognitionRef.current?.start();
            } catch (e: any) {
              if (e.name !== 'InvalidStateError') {
                console.warn('⚠️ Ошибка перезапуска:', e);
              }
            }
          }, 500);
        }
        
        toast({
          title: "Ошибка озвучки",
          description: "Не удалось воспроизвести аудио",
          variant: "destructive"
        });
      };

      // Проверяем прерывание перед воспроизведением
      if (generationIdRef.current !== startGenId) {
        console.log('🛑 Озвучка прервана перед play()');
        return;
      }

      await audio.play();

    } catch (error) {
      console.error('❌ Ошибка TTS:', error);

      // Проверяем, была ли озвучка прервана (generationId изменился)
      const wasInterrupted = generationIdRef.current !== startGenId;
      const audioWasStopped = !currentAudioRef.current || currentAudioRef.current.paused;
      const isPlaybackError = error.name === 'NotAllowedError' || error.name === 'AbortError' ||
                             error.message?.includes('play') || error.message?.includes('paused');

      console.log('🔍 TTS error analysis:', {
        wasInterrupted,
        audioWasStopped,
        isPlaybackError,
        retryCount,
        currentGenId: generationIdRef.current,
        startGenId,
        error: error.message,
        errorName: error.name
      });

      setIsSpeaking(false);
      isPlayingAudioRef.current = false;
      ttsProgressRef.current = null;

      // Показываем уведомление только если это реальная ошибка TTS, а не прерывание
      if (retryCount === 0 && !wasInterrupted && !audioWasStopped && !isPlaybackError) {
        toast({
          title: "Озвучка временно недоступна",
          description: "Ассистент ответит текстом. Вы можете продолжать разговор.",
          variant: "default"
        });
      } else if (wasInterrupted || audioWasStopped || isPlaybackError) {
        console.log('✅ TTS прервана пользователем или возникла ошибка воспроизведения - уведомление не показывается');
      }
    }
  }, [token, isSoundEnabled, toast, isRecording]);

  // Load user profile on mount
  useEffect(() => {
    getUserProfile();
  }, [getUserProfile]);

  // Update function refs for VAD (чтобы избежать проблем с порядком объявления)
  useEffect(() => {
    transcribeWithOpenAIRef.current = transcribeWithOpenAI;
    sendToLLMRef.current = sendToLLM;
    speakTextRef.current = speakText;
    stopCurrentTTSRef.current = stopCurrentTTS;
  }, [transcribeWithOpenAI, sendToLLM, speakText, stopCurrentTTS]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 Очистка ресурсов при размонтировании...');
      
      // Останавливаем continuous recording
      if (isContinuousRecordingRef.current) {
        stopContinuousRecording();
      }
      
      // Останавливаем Speech Recognition
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (e) { 
          console.warn('⚠️ Ошибка остановки Speech Recognition:', e);
        }
      }
      
      // Останавливаем аудио
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      
      // Останавливаем MediaRecorder
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) { 
          console.warn('⚠️ Ошибка остановки MediaRecorder:', e);
        }
      }
      
      // Останавливаем микрофон
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      console.log('✅ Ресурсы очищены');
    };
  }, [stopContinuousRecording]);

  // Determine Orb state
  const orbState = useMemo(() => {
    if (isSpeaking) return 'speaking';
    if (isGeneratingResponse) return 'processing';
    if (isRecording && isTranscribing) return 'listening';
    if (isRecording) return 'listening';
    return 'idle';
  }, [isSpeaking, isGeneratingResponse, isRecording, isTranscribing]);

  // Determine status text
  const statusText = useMemo(() => {
    if (isSpeaking) return 'Говорю...';
    if (isGeneratingResponse) return 'Думаю...';
    if (isRecording) {
      // Для Android continuous recording - всегда "Слушаю..."
      if (isContinuousRecordingRef.current) {
        return isTranscribing ? 'Распознаю речь...' : 'Слушаю...';
      }
      // Для старого fallback режима (не используется)
      if (useFallbackTranscription) {
        return 'Запись... (нажмите снова, чтобы остановить)';
      }
      return 'Слушаю...';
    }
    // Для Android continuous recording - другой текст
    if (useFallbackTranscription) {
      return 'Нажмите на микрофон, чтобы начать';
    }
    return 'Нажмите на микрофон, чтобы начать';
  }, [isSpeaking, isGeneratingResponse, isRecording, isTranscribing, useFallbackTranscription]);
  
  // Показываем кнопку прерывания для браузеров кроме Safari во время TTS или генерации
  const showInterruptButton = (isSpeaking || isGeneratingResponse) && !isSafari();
  
  // Отладка кнопки прерывания
  useEffect(() => {
    console.log('🔘 Кнопка прерывания:', { 
      showInterruptButton, 
      isSpeaking, 
      isSafari: isSafari() 
    });
  }, [showInterruptButton, isSpeaking]);

  return (
    <div className="relative w-full h-screen bg-background overflow-hidden flex flex-col font-sans">
      {/* Navigation */}
      <Navigation />

      {/* Course Title */}
      <div className="absolute top-20 left-0 right-0 z-40 flex justify-center px-4">
        <div className="bg-background/80 backdrop-blur-sm px-6 py-2 rounded-full border border-border/50 shadow-sm">
          <span className="text-foreground/70 text-sm md:text-base font-medium">
            {getCourseName()}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-4 pt-16 pb-32 md:pb-24">
        
        {/* Assistant Orb */}
        <div className="relative flex items-center justify-center mb-12 md:mb-16 scale-90 md:scale-100 transition-transform duration-500">
          <AssistantOrb state={orbState} />
        </div>

        {/* Status */}
        <div className="flex flex-col items-center space-y-6 text-center max-w-2xl px-4">
          <div className="text-foreground/80 text-xl md:text-2xl font-light tracking-widest uppercase transition-colors duration-300">
            {statusText}
          </div>
          
          {/* Interrupt Button - показывается во время TTS для браузеров кроме Safari */}
          {showInterruptButton && (
            <Button
              variant="outline"
              size="lg"
              className="bg-green-500 hover:bg-green-600 text-white border-green-600 hover:border-green-700 shadow-lg animate-in fade-in-0 zoom-in-95 duration-300"
              onClick={() => {
                console.log('🛑 Пользователь нажал кнопку прерывания');
                stopAssistantSpeech();
                
                // Перезапускаем распознавание, если оно было активно
                if (speechRecognitionRef.current && isRecording) {
                  setTimeout(() => {
                    try {
                      console.log('▶️ Перезапуск распознавания после прерывания кнопкой');
                      speechRecognitionRef.current?.start();
                    } catch (e: any) {
                      if (e.name !== 'InvalidStateError') {
                        console.warn('⚠️ Ошибка перезапуска:', e);
                      }
                    }
                  }, 300);
                }
              }}
            >
              <span className="font-medium">Прервать</span>
            </Button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 z-50 flex items-center justify-center space-x-6 md:space-x-12 px-4 pb-safe">
        {/* Sound Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className={`w-12 h-12 md:w-14 md:h-14 rounded-full transition-all duration-300 border ${isSoundEnabled ? 'bg-background border-border text-foreground hover:bg-accent' : 'bg-destructive/10 border-destructive/20 text-destructive hover:bg-destructive/20'}`}
          onClick={handleToggleSound}
        >
          {isSoundEnabled ? <Volume2 className="w-5 h-5 md:w-6 md:h-6" /> : <VolumeX className="w-5 h-5 md:w-6 md:h-6" />}
        </Button>

        {/* Mic Toggle (Main Action) */}
        <Button
          variant="default"
          size="icon"
          className={`w-16 h-16 md:w-20 md:h-20 rounded-full shadow-lg transition-all duration-500 transform hover:scale-105 ${isRecording
            ? 'bg-destructive hover:bg-destructive/90 shadow-destructive/20'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          onClick={handleStartStopRecording}
        >
          {isRecording ? (
            <MicOff className="w-6 h-6 md:w-8 md:h-8" />
          ) : (
            <Mic className="w-6 h-6 md:w-8 md:h-8" />
          )}
        </Button>

        {/* End Call (Exit) */}
        <Button
          variant="ghost"
          size="icon"
          className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 hover:text-destructive transition-all duration-300"
          onClick={() => navigate(-1)}
        >
          <PhoneOff className="w-5 h-5 md:w-6 md:h-6" />
        </Button>
      </div>
    </div>
  );
};

export default VoiceChat;
