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
  const [ttsInterrupted, setTtsInterrupted] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);

  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastTranscriptRef = useRef<string>('');

  // Function to stop current TTS playback
  const stopCurrentTTS = useCallback(() => {
    if (currentAudioRef.current) {
      console.log('🛑 Агрессивно прерываю текущую озвучку...');

      // Multiple ways to ensure audio stops
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current.volume = 0;
        currentAudioRef.current.muted = true;

        // Remove all event listeners
        currentAudioRef.current.onplay = null;
        currentAudioRef.current.onended = null;
        currentAudioRef.current.onerror = null;

        // Force garbage collection hint
        currentAudioRef.current.src = '';
        currentAudioRef.current.load();
      } catch (error) {
        console.log('⚠️ Ошибка при прерывании audio:', error);
      }

    currentAudioRef.current = null;
  }

  setIsSpeaking(false);
  setTtsInterrupted(true);

  // Сбросить индикатор через 2 секунды
  setTimeout(() => setTtsInterrupted(false), 2000);
}, []);

  // Initialize Web Speech API
  const initializeSpeechRecognition = useCallback(() => {
    // Check if Web Speech API is supported
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('❌ Web Speech API не поддерживается в этом браузере');
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

    recognition.onresult = async (event) => {
      // Don't process if mic is disabled
      if (!isMicEnabled) {
        console.log('🎤 Микрофон отключен, игнорируем результат');
        return;
      }

      const result = event.results[event.results.length - 1]; // Get the last result

      // Проверять не только isSpeaking, но и наличие активного аудио
      if (!result.isFinal && (isSpeaking || currentAudioRef.current)) {
        const interimTranscript = result[0].transcript.trim();

        // Прерывать даже при коротких звуках (чтобы реагировать быстрее)
        if (interimTranscript.length > 0 || result[0].confidence > 0.3) {
          console.log('🛑 Обнаружена речь пользователя, останавливаю TTS...');
          console.log('📝 Interim transcript:', interimTranscript);
          stopCurrentTTS();
        }
      }

      if (result.isFinal) {
        const transcript = result[0].transcript.trim();
        console.log('👤 Распознанный текст:', transcript);
        console.log('🎯 Текст для вывода:', transcript);

        if (transcript) {
          // Double-check TTS is stopped
          if (isSpeaking) {
            console.log('🎤 Пользователь прервал озвучку, останавливаю TTS...');
            stopCurrentTTS();
          }

          // Save current transcript for context
          lastTranscriptRef.current = transcript;

          // Send to LLM and get response (include previous context if interrupted)
          const llmResponse = await sendToLLM(transcript);

          // Small delay to ensure previous TTS is fully stopped
          await new Promise(resolve => setTimeout(resolve, 100));

          // Speak the response (recognition continues automatically in continuous mode)
          await speakText(llmResponse);

          console.log('✅ Ответ озвучен, продолжаем прослушивание...');
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

      // In continuous mode, onend usually means an error occurred
      // Try to restart if we're still recording
      if (isRecording) {
        console.log('🔄 Перезапуск после неожиданной остановки...');
        setTimeout(() => {
          startSpeechRecognition();
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
      // Ensure recognition is stopped before starting
      try {
        speechRecognitionRef.current.stop();
        console.log('🛑 Recognition остановлен перед перезапуском');
      } catch (e) {
        // Ignore if already stopped
        console.log('🛑 Recognition уже остановлен');
      }

      console.log('🎙️ Запуск распознавания речи...');
      speechRecognitionRef.current.start();
      console.log('✅ start() вызван успешно');
    } catch (error) {
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

      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (error) {
          console.log('Speech recognition already stopped');
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

      try {
        // Initialize Web Speech API if not already done
        if (!speechRecognitionRef.current) {
          const recognition = initializeSpeechRecognition();
          if (!recognition) {
            console.error('❌ Не удалось инициализировать Web Speech API');
            return;
          }
        }

        setIsRecording(true);

        // Start speech recognition
        startSpeechRecognition();

        console.log('🎤 Запись начата');
      } catch (error) {
        console.error('❌ Ошибка запуска записи:', error);
      }
    }
  }, [isRecording, initializeSpeechRecognition, startSpeechRecognition, isMicEnabled, toast]);

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
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch (error) {
            console.log('Speech recognition already stopped');
          }
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
        throw new Error(errorData.error || errorData.details || 'Failed to get LLM response');
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
  }, [token, userProfile, courseId, getUserProfile, isSpeaking]);

  // Convert text to speech using OpenAI TTS
  const speakText = useCallback(async (text: string) => {
    // Don't speak if sound is disabled
    if (!isSoundEnabled) {
      console.log('🔇 Звук отключен, пропускаем озвучку');
      return;
    }

    setIsSpeaking(true);

    // Активировать распознавание речи для прерывания TTS (если микрофон включен)
    if (isMicEnabled && !isRecording) {
      console.log('🎤 Включаю распознавание речи для прерывания TTS');
      try {
        if (!speechRecognitionRef.current) {
          const recognition = initializeSpeechRecognition();
          if (recognition) {
            speechRecognitionRef.current = recognition;
          }
        }
        if (speechRecognitionRef.current) {
          speechRecognitionRef.current.start();
          setIsRecording(true);
          console.log('✅ Распознавание речи запущено для TTS прерывания');
        }
      } catch (error) {
        console.error('❌ Не удалось запустить распознавание речи:', error);
      }
    }

    try {
      console.log('🔊 Отправка текста в OpenAI TTS...');

      const response = await fetch('https://teacher.windexs.ru/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: text,
          voice: 'shimmer' // Bright and energetic female voice
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || errorData.details || 'Failed to generate speech');
      }

      // Get audio blob
      const audioBlob = await response.blob();
      console.log('✅ Получен аудио файл, размер:', audioBlob.size);

      // УБРАТЬ: stopCurrentTTS(); - не останавливать TTS перед новым!

      // Double-check that audio is stopped (на случай если что-то осталось)
      if (currentAudioRef.current) {
        console.log('⚠️ Audio все еще существует после остановки, принудительно очищаем...');
        currentAudioRef.current = null;
      }

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
        setIsSpeaking(false);

        // Остановить распознавание речи после завершения TTS
        if (speechRecognitionRef.current && isRecording) {
          console.log('🎤 Останавливаю распознавание речи после TTS');
          try {
            speechRecognitionRef.current.stop();
            setIsRecording(false);
          } catch (error) {
            console.log('⚠️ Ошибка остановки распознавания:', error);
          }
        }
      };

      audio.onerror = (event) => {
        console.error('❌ Ошибка воспроизведения аудио:', event);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
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
  }, [token, toast, isSoundEnabled]);

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
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (error) {
          // Already stopped
        }
      }
      // Stop current TTS
      stopCurrentTTS();
      // Stop speech synthesis (fallback)
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopCurrentTTS]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* TTS interruption indicator */}
      {ttsInterrupted && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg animate-bounce flex items-center gap-2">
            <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">🎤 Речь распознана - TTS остановлен</span>
          </div>
        </div>
      )}

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
                        🎤 Запись активна...
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
