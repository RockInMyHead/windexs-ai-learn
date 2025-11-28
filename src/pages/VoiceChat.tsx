import Navigation from "@/components/Navigation";
import { useParams } from "react-router-dom";
import { getCourseDisplayName } from "@/lib/utils";
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// Web Speech API types

// Константы для обнаружения голоса и фильтрации эха
const VOICE_DETECTION_THRESHOLD = 15; // Базовый порог громкости для обнаружения голоса
const ECHO_SIMILARITY_THRESHOLD = 0.7; // Порог схожести для определения эха
const ECHO_BUFFER_TIME = 500; // Время в мс после начала TTS, когда эхо наиболее вероятно
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
      console.log('🎤 Speech started - stopping assistant speech');
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


        // ПОКАЗЫВАЕМ РЕЧЬ ПОЛЬЗОВАТЕЛЯ НЕМЕДЛЕННО
        console.log('👤 Interim распознанный текст:', interimTranscript);

        // ПРЕРЫВАНИЕ TTS: если есть активный TTS и уверенность достаточная
        if (isPlayingAudioRef.current && result[0].confidence > 0.2 && interimTranscript.length > 1) {
          console.log('🛑 Пользователь прерывает TTS речью:', interimTranscript);
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
        console.log('👤 Финальный распознанный текст:', transcript);


        if (transcript) {
          // Stop any current TTS (на случай если не было прерывания через interim)
          if (isSpeaking) {
            console.log('🎤 Останавливаю TTS...');
            stopCurrentTTS();
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

          // Speak the response
          await speakText(llmResponse);

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
          
          // Stop any current TTS
          stopCurrentTTS();
          
          // Send to LLM
          try {
            const llmResponse = await sendToLLM(transcript);
            await speakText(llmResponse);
            console.log('✅ Ответ озвучен');
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
  const sendToLLM = useCallback(async (userMessage: string): Promise<string> => {
    setIsGeneratingResponse(true);

    // Захватываем generationId перед асинхронными операциями
    const startGenId = generationIdRef.current;

    try {
      console.log('🤖 Отправка сообщения в LLM...');

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
        if (profile.interests) {
          // Safely handle interests - could be string, array, or object
          let interestsStr = '';
          if (typeof profile.interests === 'string') {
            interestsStr = profile.interests;
          } else if (Array.isArray(profile.interests)) {
            interestsStr = profile.interests.join(', ');
          } else if (profile.interests) {
            interestsStr = JSON.stringify(profile.interests);
          }
          if (interestsStr) {
            contextInfo.push(`Интересы: ${interestsStr}`);
          }
        }
      }

      const contextString = contextInfo.length > 0 ? `\nИнформация о пользователе:\n${contextInfo.join('\n')}` : '';

      // NOTE:
      // Раньше мы формировали здесь полный промт учителя Юлии (teacherJuliaPrompt)
      // и отправляли его как content. Теперь ЭТО ДЕЛАЕТ СЕРВЕР:
      //  - сервер знает курс, профиль, домашки
      //  - сам генерирует системный промт (generateVoiceChatPrompt)
      // Поэтому с фронта отправляем ТОЛЬКО чистую реплику пользователя.

      // Prepare message with context if TTS was interrupted
      let messageContent = userMessage;
      if (isSpeaking && lastTranscriptRef.current && lastTranscriptRef.current !== userMessage) {
        // Include previous context when TTS was interrupted
        messageContent = `Предыдущий контекст: "${lastTranscriptRef.current}". Новый вопрос: "${userMessage}"`;
        console.log('📝 Передаю контекст прерванного разговора:', messageContent);
      }

      // Send raw user message to server API
      console.log('🚀 Отправка в VoiceChat:', {
        url: `https://teacher.windexs.ru/api/chat/${courseId}/message`,
        content: messageContent,
        messageType: 'voice',
        token: token ? 'present' : 'missing'
      });

      const response = await fetch(`https://teacher.windexs.ru/api/chat/${courseId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          // В content отправляем сообщение пользователя с контекстом если нужно.
          // Сервер построит системный промт учителя Юлии сам.
          content: messageContent,
          messageType: 'voice',
          interrupted: isSpeaking // Flag to indicate if this was an interruption
        })
      });

      if (!response.ok) {
        let errorData = { error: 'Unknown error' };
        try {
          const text = await response.text();
          if (text) {
            errorData = JSON.parse(text);
          }
        } catch (parseError) {
          console.error('❌ Ошибка парсинга ответа:', parseError);
        }
        console.error('❌ Ответ сервера с ошибкой:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to get LLM response');
      }

      // Parse response safely
      let data;
      try {
        const text = await response.text();
        console.log('📥 Сырой ответ сервера:', text.substring(0, 200));
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('❌ Ошибка парсинга JSON:', parseError);
        throw new Error('Invalid JSON response from server');
      }

      // Проверяем, не было ли прерывания генерации
      if (generationIdRef.current !== startGenId) {
        console.log('🛑 Генерация ответа была прервана');
        return '';
      }

      console.log('✅ LLM ответил:', data.message);

      return data.message || 'Извини, я не смогла сформулировать ответ. Попробуй перефразировать вопрос.';

    } catch (error) {
      console.error('❌ Ошибка LLM:', error);
      console.error('❌ Детали ошибки:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      return 'Извини, у меня технические неполадки. Попробуй еще раз через минуту.';
    } finally {
      setIsGeneratingResponse(false);
    }
  }, [token, userProfile, courseId, getUserProfile]);





// Очистка состояния TTS
  const clearTTSState = useCallback(() => {
    currentTTSTextRef.current = '';
    setIsSpeaking(false);
  }, []);

  // Convert text to speech using OpenAI TTS
  const speakText = useCallback(async (text: string) => {
    // Don't speak if sound is disabled
    if (!isSoundEnabled) {
      console.log('🔇 Звук отключен, пропускаем озвучку');
      return;
    }

    // Устанавливаем состояние воспроизведения
    isPlayingAudioRef.current = true;
    // Store the TTS text for echo detection
    currentTTSTextRef.current = text;

    // Инициализируем прогресс озвучки для фильтрации эха
    const normalizedText = text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    const words = normalizedText.split(/\s+/).filter(w => w.length > 0);
    const estimatedDuration = words.length * 150; // ~150мс на слово

    ttsProgressRef.current = {
      startTime: Date.now(),
      text: normalizedText,
      duration: estimatedDuration,
      words: words,
      currentWordIndex: 0
    };

    setIsSpeaking(true);


    // Захватываем generationId для проверки прерывания
    const myGenId = generationIdRef.current;

    try {
      // Проверяем, не было ли прерывания перед синтезом
      if (generationIdRef.current !== myGenId) {
        console.log('🛑 Синтез речи был отменен');
        return;
      }

      console.log('🔊 Отправка текста в OpenAI TTS...');

      const response = await fetch('https://teacher.windexs.ru/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: text,
          voice: 'nova' // High-quality educational voice (HD model)
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to generate speech');
      }

      // Проверяем, не было ли прерывания после получения ответа
      if (generationIdRef.current !== myGenId) {
        console.log('🛑 Синтез речи был отменен после получения аудио');
        return;
      }

      // Get audio blob
      const audioBlob = await response.blob();
      console.log('✅ Получен аудио файл, размер:', audioBlob.size);


      // ОБЯЗАТЕЛЬНО остановить предыдущее аудио перед запуском нового
      // Это предотвращает наложение нескольких TTS потоков
      if (currentAudioRef.current) {
        stopCurrentTTS();
      }

      // Небольшая задержка чтобы убедиться что предыдущее аудио полностью остановлено
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create audio element and play
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

      // Small delay to ensure clean start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Start playing
      await audio.play();

    } catch (error) {
      console.error('❌ Ошибка TTS:', error);
      setIsSpeaking(false);

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
        description: `Не удалось озвучить текст: ${error.message}`,
        variant: "destructive"
      });
    }
  }, [token, toast, isSoundEnabled, stopCurrentTTS]);


  // Load user profile on component mount
  useEffect(() => {
    if (token) {
      getUserProfile();
    }
  }, [token, getUserProfile]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 Очистка при размонтировании');
      // Stop Web Speech API
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (error) {
          // Already stopped
        }
      }
      // Stop fallback MediaRecorder
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.stop();
        } catch (error) {
          // Already stopped
        }
      }
      // Stop media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      // Stop current TTS and monitoring
      stopAssistantSpeech();
      // Stop speech synthesis (fallback)
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      // Close audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />


      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
              Голосовое общение
            </h1>
            <p className="text-muted-foreground">
              {getCourseDisplayName(courseId || "")}
            </p>
          </div>

          <Card className="shadow-2xl animate-fade-in">
            <CardContent className="p-8 md:p-12">
              <div className="text-center space-y-6">
                {/* Status Indicator */}
                <div className="relative inline-block">
                  <div className={`w-32 h-32 md:w-40 md:h-40 rounded-full ${
                    isRecording ? 'bg-green-500/20' : 'bg-muted'
                  } flex items-center justify-center transition-all duration-300`}>
                    <Mic className={`w-16 h-16 md:w-20 md:h-20 ${
                      isRecording ? 'text-green-500' : 'text-muted-foreground'
                    }`} />
                  </div>
                  {isRecording && (
                    <div className="absolute inset-0 rounded-full animate-ping bg-green-500/20"></div>
                  )}
                </div>

                {/* Status Text */}
                <div>
                  <h2 className="text-2xl font-bold mb-2">
                    {isRecording ? "Идет запись и распознавание" : "Готов к записи"}
                  </h2>
                  <p className="text-muted-foreground mb-3">
                    {isRecording
                      ? "Говорите свободно - текст выводится в консоль"
                      : "Нажмите кнопку для начала записи и распознавания речи"
                    }
                  </p>

                  {/* Recording Status */}
                  <div className="flex flex-wrap justify-center gap-2">
                    {isRecording && (
                      <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200 animate-pulse">
                        🎤 {useFallbackTranscription ? 'Запись (OpenAI)...' : 'Запись активна...'}
                      </Badge>
                    )}
                    {isTranscribing && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Распознавание...
                      </Badge>
                    )}
                    {isGeneratingResponse && (
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        🤖 Думаю...
                      </Badge>
                    )}
                    {isSpeaking && (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 animate-pulse">
                        🔊 Говорю...
                      </Badge>
                    )}
                    {!isRecording && (
                      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                        🔇 Ожидание начала
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Control Buttons */}
                <div className="flex flex-wrap justify-center gap-4">
                  <Button
                    variant="outline"
                    size="lg"
                    className={`w-16 h-16 rounded-full ${isMicEnabled ? 'bg-green-50 border-green-200 hover:bg-green-100' : 'bg-red-50 border-red-200 hover:bg-red-100'}`}
                    onClick={handleToggleMic}
                    title={isMicEnabled ? "Отключить микрофон" : "Включить микрофон"}
                  >
                    {isMicEnabled ? (
                      <Mic className="w-6 h-6 text-green-600" />
                    ) : (
                      <MicOff className="w-6 h-6 text-red-600" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className={`w-16 h-16 rounded-full ${isSoundEnabled ? 'bg-blue-50 border-blue-200 hover:bg-blue-100' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
                    onClick={handleToggleSound}
                    title={isSoundEnabled ? "Отключить звук" : "Включить звук"}
                  >
                    {isSoundEnabled ? (
                      <Volume2 className="w-6 h-6 text-blue-600" />
                    ) : (
                      <VolumeX className="w-6 h-6 text-gray-600" />
                    )}
                  </Button>
                </div>

                {/* Main Action Button */}
                <Button
                  size="lg"
                  className={`w-full max-w-xs h-14 text-lg ${isRecording ? 'bg-red-500 hover:bg-red-600' : ''}`}
                  onClick={handleStartStopRecording}
                >
                  {isRecording ? (
                    <>
                      <PhoneOff className="w-5 h-5 mr-2" />
                      Остановить запись
                    </>
                  ) : (
                    <>
                      <Phone className="w-5 h-5 mr-2" />
                      Начать урок
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
};

export default VoiceChat;
