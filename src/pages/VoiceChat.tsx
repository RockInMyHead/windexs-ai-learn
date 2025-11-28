import Navigation from "@/components/Navigation";
import { useParams, useNavigate } from "react-router-dom";
import { getCourseDisplayName } from "@/lib/utils";
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { monitorLLMRequest, monitorLLMResponse, isSuspiciousMessage, generateSafeAlternative, generateSuperSafePhrase, updateLearnedAlternatives } from "@/utils/llmMonitoring";
import AssistantOrb from "@/components/AssistantOrb";
import BackgroundStars from "@/components/BackgroundStars";

// Web Speech API types

// Константы для обнаружения голоса и фильтрации эха
const VOICE_DETECTION_THRESHOLD = 15; // Базовый порог громкости для обнаружения голоса
const ECHO_SIMILARITY_THRESHOLD = 0.7; // Порог схожести для определения эха
const ECHO_BUFFER_TIME = 500; // Время в мс после начала TTS, когда эхо наиболее вероятно

// Модель LLM для голосового чата
const VOICE_CHAT_LLM_MODEL = 'gpt-5.1'; // GPT-5.1 для высококачественного голосового общения
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
  const [transcriptDisplay, setTranscriptDisplay] = useState<string>("");

  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastTranscriptRef = useRef<string>('');
  const cleanTranscriptRef = useRef<string>(''); // Track clean transcript without TTS echo
  const currentTTSTextRef = useRef<string>(''); // Store current TTS text to detect echo

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

  // Основная функция прерывания речи ассистента
  const stopAssistantSpeech = useCallback(() => {
    console.log('🛑 Прерываем речь ассистента');

    // Увеличиваем generationId для отмены текущей генерации
    generationIdRef.current += 1;

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
  }, []);

  // Function to stop current TTS playback
  const stopCurrentTTS = useCallback(() => {
    stopAssistantSpeech();
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
      setIsTranscribing(true);

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch('https://teacher.windexs.ru/api/transcribe', {
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
      console.log('✅ Транскрибация завершена:', data.text);
      return data.text || null;
    } catch (error) {
      console.error('❌ Ошибка транскрибации:', error);
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

    // Configure recognition
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

    recognition.onspeechstart = () => {
      console.log('🎤 Speech started - IMMEDIATELY stopping assistant speech');
      // Прерываем TTS НЕМЕДЛЕННО при начале любой речи пользователя
      stopAssistantSpeech();
    };

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
        setTranscriptDisplay(interimTranscript);

        // ДОПОЛНИТЕЛЬНОЕ ПРЕРЫВАНИЕ: прерываем TTS при начале любой речевой активности
        if (isPlayingAudioRef.current) {
          console.log('🚨 Речевая активность обнаружена - НЕМЕДЛЕННО прерываем TTS');
          console.log('🛑 Прерывание TTS из-за речи пользователя');
          stopAssistantSpeech();
        }

        // ПОКАЗЫВАЕМ РЕЧЬ ПОЛЬЗОВАТЕЛЯ НЕМЕДЛЕННО
        console.log('👤 Interim распознанный текст:', interimTranscript);

        // ПРЕРЫВАНИЕ TTS: прерываем при ЛЮБОЙ речи пользователя, даже с низкой уверенностью
        if (isPlayingAudioRef.current && interimTranscript.length > 0) {
          console.log('🛑 Пользователь прерывает TTS речью (даже с низкой уверенностью):', interimTranscript, `(уверенность: ${result[0].confidence})`);

          // Проверяем, является ли это командой прерывания
          const interruptCommands = ['подожди', 'стоп', 'прекрати', 'перестань', 'хватит', 'тихо', 'молчать', 'замолчи', 'stop', 'wait'];
          const isInterruptCommand = interruptCommands.some(cmd =>
            interimTranscript.toLowerCase().includes(cmd)
          );

          if (isInterruptCommand) {
            console.log('🚨 Команда прерывания обнаружена:', interimTranscript);
          }

          stopAssistantSpeech();

          // Сохраняем текст для финальной обработки
          cleanTranscriptRef.current = interimTranscript;

          // Останавливаем распознавание речи временно
          if (speechRecognitionRef.current && isRecording) {
            try {
              speechRecognitionRef.current.stop();
              setIsRecording(false);
              console.log('🎤 Распознавание речи остановлено после прерывания TTS');
            } catch (e) {
              console.log('⚠️ Ошибка остановки распознавания:', e);
            }
          }
          return; // Прерываем обработку
        }

        // Сохраняем interim результат для финальной обработки
        cleanTranscriptRef.current = interimTranscript;
      }

      // Обрабатываем финальные результаты
      if (result.isFinal) {
        const transcript = result[0].transcript.trim();
        setTranscriptDisplay(transcript);
        console.log('👤 Финальный распознанный текст:', transcript);

        // Проверяем, является ли это командой прерывания
        const interruptCommands = ['подожди', 'стоп', 'прекрати', 'перестань', 'хватит', 'тихо', 'молчать', 'замолчи', 'stop', 'wait'];
        const isInterruptCommand = interruptCommands.some(cmd =>
          transcript.toLowerCase().includes(cmd)
        );

        if (transcript) {
          // Stop any current TTS (на случай если не было прерывания через interim)
          if (isSpeaking) {
            console.log('🎤 Останавливаю TTS...');
            stopCurrentTTS();
          }

          // Обработка команд прерывания
          if (isInterruptCommand) {
            console.log('🚨 Обнаружена команда прерывания в финальном результате:', transcript);
            toast({
              title: "Готово",
              description: "Озвучка прервана",
              variant: "default"
            });
            return; // Не отправляем на LLM
          }

          // Save current transcript for context
          lastTranscriptRef.current = transcript;

          // Send to LLM and get response
          const llmResponse = await sendToLLM(transcript);

          // Проверяем, не пустой ли ответ (означает прерывание)
          if (!llmResponse) {
            console.log('🛑 Ответ от LLM пустой - генерация была прервана');
            return;
          }

          // Small delay to ensure previous TTS is fully stopped
          await new Promise(resolve => setTimeout(resolve, 100));

          // Speak the response (only if not empty)
          if (llmResponse && llmResponse.trim()) {
            await speakText(llmResponse);
          } else {
            console.warn('⚠️ Пропускаем озвучивание пустого ответа');
          }

          console.log('✅ Ответ озвучен');
        }
      }
    };

    recognition.onerror = (event) => {
      console.error('❌ Speech recognition error:', event.error);
      setIsTranscribing(false);
    };

    recognition.onend = () => {
      console.log('🎙️ Speech recognition ended');
      setIsTranscribing(false);

      // In continuous mode, onend usually means an error occurred or intentional stop
      // Only restart if we're still in recording state and not speaking (to avoid conflicts)
      if (isRecording && !isSpeaking) {
        console.log('🔄 Перезапуск после неожиданной остановки...');
        setTimeout(() => {
          // Double-check we still want to be recording
          if (speechRecognitionRef.current) {
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
      // Stop recording
      console.log('🛑 Остановка записи...');
      setIsRecording(false);
      setIsTranscribing(false);

      // Check if using fallback (OpenAI Whisper) mode
      if (useFallbackTranscription || !isWebSpeechAvailable()) {
        // Stop fallback recording and transcribe
        const transcript = await stopFallbackRecording();

        if (transcript && transcript.trim()) {
          console.log('🎯 Fallback транскрипция:', transcript);
          setTranscriptDisplay(transcript);

          // Stop any current TTS
          stopCurrentTTS();

          // Send to LLM
          try {
            const llmResponse = await sendToLLM(transcript);
            if (llmResponse && llmResponse.trim()) {
              await speakText(llmResponse);
              console.log('✅ Ответ озвучен');
            } else {
              console.warn('⚠️ Пропускаем озвучивание пустого ответа');
            }
          } catch (error) {
            console.error('❌ Ошибка обработки ответа:', error);
          }
        }
      } else {
        // Web Speech API mode
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch (error) {
            console.log('Speech recognition already stopped');
          }
        }
      }
    } else {
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
      setTranscriptDisplay("");

      // Check if Web Speech API is available
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
  }, [isRecording, isMicEnabled, toast]);

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
      const response = await fetch('https://teacher.windexs.ru/api/profile', {
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

    try {
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
      let endpoint = 'https://teacher.windexs.ru/api/chat/general';
      let body: any = {
        content: userMessage + contextString, // Server expects 'content'
        messageType: 'text'
      };

      if (courseId && courseId !== 'general') {
        endpoint = `https://teacher.windexs.ru/api/chat/${courseId}/message`;
      }

      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(body)
        });
      } catch (fetchError) {
        console.error('❌ Fetch error:', fetchError);
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
    } catch (error) {
      console.error('❌ Ошибка общения с LLM:', error);

      // Retry при ошибке сети
      if (retryCount < MAX_RETRIES) {
        console.log(`🔄 Ошибка сети, повторная попытка ${retryCount + 1}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return sendToLLM(originalMessage, retryCount + 1);
      }

      toast({
        title: "Ошибка",
        description: "Не удалось получить ответ от ассистента",
        variant: "destructive"
      });
      return "Извините, произошла ошибка связи. Попробуйте еще раз.";
    } finally {
      // Сбрасываем флаг только если это был последний активный запрос
      if (generationIdRef.current === startGenId) {
        setIsGeneratingResponse(false);
      }
    }
  }, [token, courseId, userProfile, toast]);

  // Speak text using OpenAI TTS
  const speakText = useCallback(async (text: string) => {
    if (!text || !isSoundEnabled) return;

    // Захватываем generationId
    const startGenId = generationIdRef.current;

    try {
      console.log('🔊 Генерация озвучки для:', text);
      setIsSpeaking(true);
      isPlayingAudioRef.current = true;
      currentTTSTextRef.current = text; // Сохраняем текст для фильтрации эха

      // Инициализируем прогресс озвучки
      ttsProgressRef.current = {
        startTime: Date.now(),
        text: text,
        duration: text.length * 60, // Грубая оценка: 60мс на символ
        words: text.split(' '),
        currentWordIndex: 0
      };

      const response = await fetch('https://teacher.windexs.ru/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text,
          voice: 'nova', // Используем голос nova (как в описании)
          model: 'tts-1-hd' // HD модель для лучшего качества
        })
      });

      // Проверяем прерывание
      if (generationIdRef.current !== startGenId) {
        console.log('🛑 Озвучка прервана до начала воспроизведения');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to generate speech');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      // Event handlers
      audio.onplay = () => {
        console.log('🔊 Озвучка начата');
      };

      audio.onended = () => {
        console.log('✅ Озвучка завершена');
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        isPlayingAudioRef.current = false;
        setIsSpeaking(false);
        // Сбрасываем прогресс озвучки
        ttsProgressRef.current = null;
      };

      audio.onerror = (event) => {
        console.error('❌ Ошибка воспроизведения аудио:', event);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        isPlayingAudioRef.current = false; // Сбрасываем флаг воспроизведения
        setIsSpeaking(false);
        // Сбрасываем прогресс озвучки
        ttsProgressRef.current = null;

        // Остановить распознавание речи в случае ошибки
        if (speechRecognitionRef.current && isRecording) {
          try {
            speechRecognitionRef.current.stop();
            setIsRecording(false);
          } catch (e) {
            console.log('⚠️ Ошибка остановки распознавания при ошибке TTS:', e);
          }
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
      setIsSpeaking(false);
      isPlayingAudioRef.current = false;
      ttsProgressRef.current = null;
    }
  }, [token, isSoundEnabled, toast, isRecording]);

  // Load user profile on mount
  useEffect(() => {
    getUserProfile();
  }, [getUserProfile]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (e) { }
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) { }
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

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
    if (isRecording) return 'Слушаю...';
    return 'Нажмите на микрофон, чтобы начать';
  }, [isSpeaking, isGeneratingResponse, isRecording]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col items-center justify-center font-sans">
      {/* Background Stars */}
      <BackgroundStars />

      {/* Navigation / Back Button */}
      <div className="absolute top-6 left-6 z-50">
        <Button
          variant="ghost"
          size="icon"
          className="text-white/70 hover:text-white hover:bg-white/10 rounded-full w-12 h-12"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="z-10 flex flex-col items-center justify-center space-y-12 w-full max-w-4xl px-4">

        {/* Assistant Orb */}
        <div className="relative flex items-center justify-center">
          <AssistantOrb state={orbState} />
        </div>

        {/* Status & Transcript */}
        <div className="flex flex-col items-center space-y-6 text-center max-w-2xl">
          <div className="text-white/90 text-2xl font-light tracking-widest uppercase animate-pulse">
            {statusText}
          </div>

          {transcriptDisplay && (
            <div className="text-white/70 text-lg font-light leading-relaxed backdrop-blur-sm bg-black/30 p-4 rounded-xl border border-white/10 transition-all duration-300">
              "{transcriptDisplay}"
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-12 z-50 flex items-center space-x-8">
        {/* Sound Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className={`w-14 h-14 rounded-full transition-all duration-300 ${isSoundEnabled ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
          onClick={handleToggleSound}
        >
          {isSoundEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
        </Button>

        {/* Mic Toggle (Main Action) */}
        <Button
          variant="default"
          size="icon"
          className={`w-20 h-20 rounded-full shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] transition-all duration-500 transform hover:scale-105 ${isRecording
            ? 'bg-red-500 hover:bg-red-600 shadow-[0_0_50px_-10px_rgba(239,68,68,0.5)]'
            : 'bg-white text-black hover:bg-gray-200'
            }`}
          onClick={handleStartStopRecording}
        >
          {isRecording ? (
            <MicOff className="w-8 h-8" />
          ) : (
            <Mic className="w-8 h-8" />
          )}
        </Button>

        {/* End Call (Exit) */}
        <Button
          variant="ghost"
          size="icon"
          className="w-14 h-14 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-all duration-300"
          onClick={() => navigate(-1)}
        >
          <PhoneOff className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
};

export default VoiceChat;
