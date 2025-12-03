/**
 * useTranscription - Голосовая система с blob-based VAD
 * 
 * Архитектура:
 * - iOS/Android: OpenAI Whisper + VAD на основе анализа blob'ов (работает!)
 * - Desktop: Browser SpeechRecognition + OpenAI fallback
 * 
 * Ключевое отличие от старой системы:
 * - Анализ громкости происходит по записанным blob'ам (decodeAudioData)
 * - А НЕ через AnalyserNode в реальном времени (не работает на iOS)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { psychologistAI } from '@/services/openai';

interface UseTranscriptionProps {
  onTranscriptionComplete: (text: string, source: 'browser' | 'openai' | 'manual') => void;
  onSpeechStart?: () => void;
  onInterruption?: () => void;
  isTTSActiveRef: React.MutableRefObject<boolean>;
  onError?: (error: string) => void;
  addDebugLog?: (message: string) => void;
}

// Расширяем window для deviceDebugLogged
declare global {
  interface Window {
    deviceDebugLogged?: boolean;
  }
}

export const useTranscription = ({
  onTranscriptionComplete,
  onSpeechStart,
  onInterruption,
  isTTSActiveRef,
  onError,
  addDebugLog = console.log
}: UseTranscriptionProps) => {
  // === STATE ===
  const [transcriptionStatus, setTranscriptionStatus] = useState<string | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [forceOpenAI, setForceOpenAI] = useState(false);
  const [transcriptionMode, setTranscriptionMode] = useState<'browser' | 'openai'>('browser');
  const [microphoneAccessGranted, setMicrophoneAccessGranted] = useState(false);
  const [microphonePermissionStatus, setMicrophonePermissionStatus] = useState<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');

  // === REFS ===
  const recognitionRef = useRef<any>(null);
  const recognitionActiveRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const volumeMonitorRef = useRef<number | null>(null);
  const speechTimeoutRef = useRef<number | null>(null);
  const browserRetryCountRef = useRef(0);
  const lastProcessedTextRef = useRef<string>('');

  // Mobile VAD refs
  const mobileVADIntervalRef = useRef<number | null>(null);
  const speechActiveRef = useRef(false);
  const silenceStartTimeRef = useRef<number>(0);
  const speechStartTimeRef = useRef<number>(0);
  const speechChunksRef = useRef<Blob[]>([]);
  const isProcessingRef = useRef(false);
  const lastChunkIndexRef = useRef(0);

  // Safari interruption state
  const safariSpeechCountRef = useRef(0);
  const lastSafariSpeechTimeRef = useRef(0);

  // === CONSTANTS ===
  const SAFARI_VOICE_THRESHOLD = 60;
  const SAFARI_CONFIRMATION_FRAMES = 3;
  const SAFARI_DEBOUNCE = 1000;

  // Mobile VAD constants - оптимизированы для реального использования
  const MOBILE_VAD_INTERVAL = 400;        // Анализ каждые 400ms
  const MOBILE_SPEECH_THRESHOLD = 1.0;    // 1.0% громкости для определения речи (чувствительный)
  const MOBILE_SILENCE_DURATION = 1200;   // 1.2 сек тишины для окончания речи
  const MOBILE_MIN_SPEECH_DURATION = 400; // Минимум 400ms речи
  const MOBILE_MIN_AUDIO_SIZE = 4000;     // Минимум 4KB аудио

  // === BROWSER DETECTION ===
  const isIOSDevice = useCallback(() => {
    const ua = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }, []);

  const isAndroidDevice = useCallback(() => {
    return /android/.test(navigator.userAgent.toLowerCase());
  }, []);

  const isMobileDevice = useCallback(() => {
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      navigator.userAgent.toLowerCase()
    );
  }, []);

  const hasEchoProblems = useCallback(() => {
    return /chrome|chromium|edg\/|opera|brave/.test(navigator.userAgent.toLowerCase());
  }, []);

  // === HALLUCINATION FILTER ===
  const filterHallucinatedText = useCallback((text: string): string | null => {
    if (!text) return null;
    
    const lowerText = text.toLowerCase();

    // Паттерны галлюцинаций Whisper
    const hallucinationPatterns = [
      /продолжение следует/i,
      /с вами был/i,
      /до свидания/i,
      /до новых встреч/i,
      /спасибо за внимание/i,
      /конец$/i,
      /закончили/i,
      /субтитры/i,
      /подписывайтесь/i,
      /ставьте лайк/i,
      /благодарю за просмотр/i,
      /^\s*\.+\s*$/,  // Только точки
      /^\s*,+\s*$/,   // Только запятые
    ];

    for (const pattern of hallucinationPatterns) {
      if (pattern.test(lowerText)) {
        addDebugLog(`[Filter] ⚠️ Hallucination detected: "${text}"`);
        return null;
      }
    }

    // Фильтр по длине
    if (text.length > 200) {
      addDebugLog(`[Filter] ⚠️ Too long (${text.length} chars): "${text.substring(0, 50)}..."`);
      return null;
    }
    
    if (text.length < 2) {
      addDebugLog(`[Filter] ⚠️ Too short (${text.length} chars)`);
      return null;
    }

    // Слишком много предложений
    if (text.split(/[.!?]/).filter(s => s.trim()).length > 4) {
      addDebugLog(`[Filter] ⚠️ Too many sentences`);
      return null;
    }

    // Бессмысленные звуки
    const meaninglessPatterns = [
      /^[а-яa-z]{1}$/i,
      /^[эээ]+$/i,
      /^[ммм]+$/i,
      /^[ааа]+$/i,
      /^[ууу]+$/i,
      /^[ооо]+$/i,
      /^[а-яa-z]{1,2}$/i,
    ];

    for (const pattern of meaninglessPatterns) {
      if (pattern.test(text.trim())) {
        addDebugLog(`[Filter] ⚠️ Meaningless sound: "${text}"`);
        return null;
      }
    }

    return text;
  }, [addDebugLog]);

  // === MICROPHONE PERMISSIONS ===
  const checkMicrophonePermissions = useCallback(async () => {
    if (!navigator.permissions?.query) return;
    
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setMicrophonePermissionStatus(result.state);
      result.addEventListener('change', () => setMicrophonePermissionStatus(result.state));
    } catch (error) {
      addDebugLog(`[Permissions] Could not query: ${error}`);
    }
  }, [addDebugLog]);

  // === AUDIO VOLUME CHECK (BLOB-BASED) ===
  // Это ключевая функция! Анализирует громкость по записанному blob'у
  // Работает на iOS в отличие от AnalyserNode.getByteFrequencyData()
  const checkAudioVolume = useCallback(async (audioBlob: Blob): Promise<number> => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const tempContext = new AudioContextClass();
      
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await tempContext.decodeAudioData(arrayBuffer);
      
      let sum = 0;
      let count = 0;
      
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < channelData.length; i++) {
          sum += Math.abs(channelData[i]);
          count++;
        }
      }
      
      await tempContext.close();
      return (sum / count) * 100; // Возвращаем в процентах
    } catch (error) {
      // Если не удалось декодировать - возвращаем 0
      return 0;
    }
  }, []);

  // === OPENAI TRANSCRIPTION ===
  const transcribeWithOpenAI = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    try {
      addDebugLog(`[OpenAI] 🎤 Transcribing ${audioBlob.size} bytes...`);
      setTranscriptionStatus("Распознаю речь...");

      const text = await psychologistAI.transcribeAudio(audioBlob);

      if (text?.trim()) {
        addDebugLog(`[OpenAI] ✅ Result: "${text.substring(0, 60)}..."`);
        return text.trim();
      }
      
      addDebugLog(`[OpenAI] ⚠️ Empty result`);
      return null;
    } catch (error: any) {
      addDebugLog(`[OpenAI] ❌ Error: ${error.message}`);
      return null;
    } finally {
      setTranscriptionStatus(null);
    }
  }, [addDebugLog]);

  // === MEDIA RECORDER ===
  const startMediaRecording = useCallback((stream: MediaStream) => {
    if (mediaRecorderRef.current) return;

    try {
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/wav',
        'audio/ogg'
      ];
      const selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

      if (!selectedMimeType) {
        addDebugLog(`[MediaRec] ❌ No supported format`);
        return;
      }

      addDebugLog(`[MediaRec] Using format: ${selectedMimeType}`);

      const recorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      lastChunkIndexRef.current = 0;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onerror = (event: any) => {
        addDebugLog(`[MediaRec] ❌ Error: ${event.error?.message || 'Unknown'}`);
      };

      // Записываем chunks с интервалом для VAD анализа
      recorder.start(MOBILE_VAD_INTERVAL);
      addDebugLog(`[MediaRec] ✅ Started (${MOBILE_VAD_INTERVAL}ms chunks)`);
    } catch (error: any) {
      addDebugLog(`[MediaRec] ❌ Start failed: ${error.message}`);
    }
  }, [addDebugLog, MOBILE_VAD_INTERVAL]);

  const stopMediaRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }

      const recorder = mediaRecorderRef.current;
      
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'audio/webm'
        });
        recordedChunksRef.current = [];
        mediaRecorderRef.current = null;
        resolve(blob);
      };

      recorder.stop();
    });
  }, []);

  // === MOBILE VAD (BLOB-BASED) ===
  // Главная логика определения речи для мобильных устройств
  const startMobileVAD = useCallback(() => {
    if (mobileVADIntervalRef.current) return;

    addDebugLog(`[MobileVAD] 🎤 Starting blob-based voice detection`);
    addDebugLog(`[MobileVAD] Settings: threshold=${MOBILE_SPEECH_THRESHOLD}%, silence=${MOBILE_SILENCE_DURATION}ms`);

    mobileVADIntervalRef.current = window.setInterval(async () => {
      // Пропускаем если TTS активен (эхо-подавление)
      if (isTTSActiveRef.current) {
        if (speechActiveRef.current) {
          addDebugLog(`[MobileVAD] 🔇 TTS active - clearing speech buffer`);
          speechChunksRef.current = [];
          speechActiveRef.current = false;
          silenceStartTimeRef.current = 0;
        }
        return;
      }

      // Пропускаем если уже обрабатываем предыдущую речь
      if (isProcessingRef.current) return;

      // Получаем новые chunks с момента последней проверки
      const currentChunks = recordedChunksRef.current;
      const newChunks = currentChunks.slice(lastChunkIndexRef.current);
      lastChunkIndexRef.current = currentChunks.length;

      if (newChunks.length === 0) return;

      // Анализируем громкость последнего chunk
      const latestChunk = newChunks[newChunks.length - 1];
      const volumeLevel = await checkAudioVolume(latestChunk);

      const now = Date.now();
      const isSpeaking = volumeLevel > MOBILE_SPEECH_THRESHOLD;

      // Логирование каждую секунду для отладки
      if (Math.floor(now / 1000) !== Math.floor((now - MOBILE_VAD_INTERVAL) / 1000)) {
        addDebugLog(`[MobileVAD] 📊 Vol: ${volumeLevel.toFixed(2)}% | Speaking: ${isSpeaking} | Active: ${speechActiveRef.current}`);
      }

      if (isSpeaking) {
        // === ОБНАРУЖЕНА РЕЧЬ ===
        if (!speechActiveRef.current) {
          addDebugLog(`[MobileVAD] 🎤 Speech STARTED (vol: ${volumeLevel.toFixed(2)}%)`);
          speechActiveRef.current = true;
          speechStartTimeRef.current = now;
          speechChunksRef.current = [];
          onSpeechStart?.();
        }
        
        // Добавляем chunks в буфер речи
        speechChunksRef.current.push(...newChunks);
        silenceStartTimeRef.current = 0; // Сбрасываем счетчик тишины
        
      } else {
        // === ТИШИНА ===
        if (speechActiveRef.current) {
          // Добавляем тихие chunks (могут содержать конец слова)
          speechChunksRef.current.push(...newChunks);
          
          if (!silenceStartTimeRef.current) {
            silenceStartTimeRef.current = now;
            addDebugLog(`[MobileVAD] 🔇 Silence started, waiting ${MOBILE_SILENCE_DURATION}ms...`);
          }
          
          const silenceDuration = now - silenceStartTimeRef.current;
          const speechDuration = now - speechStartTimeRef.current;
          
          // Проверяем достаточно ли длинная тишина
          if (silenceDuration >= MOBILE_SILENCE_DURATION) {
            addDebugLog(`[MobileVAD] ✅ Speech ENDED (duration: ${speechDuration}ms, silence: ${silenceDuration}ms)`);
            
            // Сбрасываем состояние
            speechActiveRef.current = false;
            silenceStartTimeRef.current = 0;
            
            // Проверяем минимальную длительность речи
            if (speechDuration < MOBILE_MIN_SPEECH_DURATION) {
              addDebugLog(`[MobileVAD] ⚠️ Speech too short (${speechDuration}ms < ${MOBILE_MIN_SPEECH_DURATION}ms), skipping`);
              speechChunksRef.current = [];
              return;
            }
            
            // Создаем blob из накопленных chunks
            if (speechChunksRef.current.length > 0) {
              const speechBlob = new Blob(speechChunksRef.current, { type: 'audio/webm' });
              speechChunksRef.current = [];
              
              // Проверяем размер
              if (speechBlob.size < MOBILE_MIN_AUDIO_SIZE) {
                addDebugLog(`[MobileVAD] ⚠️ Audio too small (${speechBlob.size} < ${MOBILE_MIN_AUDIO_SIZE} bytes), skipping`);
                return;
              }
              
              // Финальная проверка громкости всего аудио
              const finalVolume = await checkAudioVolume(speechBlob);
              
              if (finalVolume < MOBILE_SPEECH_THRESHOLD * 0.5) {
                addDebugLog(`[MobileVAD] ⚠️ Final volume too low (${finalVolume.toFixed(2)}%), skipping`);
                return;
              }
              
              // === ОТПРАВЛЯЕМ НА ТРАНСКРИБАЦИЮ ===
              addDebugLog(`[MobileVAD] 📤 Sending ${speechBlob.size} bytes (vol: ${finalVolume.toFixed(2)}%)`);
              
              isProcessingRef.current = true;
              
              try {
                const text = await transcribeWithOpenAI(speechBlob);
                
                if (text?.trim()) {
            const filteredText = filterHallucinatedText(text.trim());
                  
            if (filteredText) {
                    addDebugLog(`[MobileVAD] ✅ Transcribed: "${filteredText}"`);
              onTranscriptionComplete(filteredText, 'openai');
                  }
                }
              } catch (error: any) {
                addDebugLog(`[MobileVAD] ❌ Transcription error: ${error.message}`);
              } finally {
                isProcessingRef.current = false;
              }
            }
          }
        }
      }
    }, MOBILE_VAD_INTERVAL);
  }, [
    checkAudioVolume, 
    transcribeWithOpenAI, 
    filterHallucinatedText, 
    onTranscriptionComplete, 
    onSpeechStart, 
    isTTSActiveRef, 
    addDebugLog,
    MOBILE_VAD_INTERVAL,
    MOBILE_SPEECH_THRESHOLD,
    MOBILE_SILENCE_DURATION,
    MOBILE_MIN_SPEECH_DURATION,
    MOBILE_MIN_AUDIO_SIZE
  ]);

  const stopMobileVAD = useCallback(() => {
    if (mobileVADIntervalRef.current) {
      addDebugLog(`[MobileVAD] 🛑 Stopping`);
      clearInterval(mobileVADIntervalRef.current);
      mobileVADIntervalRef.current = null;
    }
    speechActiveRef.current = false;
    speechChunksRef.current = [];
    silenceStartTimeRef.current = 0;
  }, [addDebugLog]);

  // === VOLUME MONITORING FOR DESKTOP (Safari interruption) ===
  const startVolumeMonitoring = useCallback(async (stream: MediaStream) => {
    // Только для десктопа - на мобильных используем blob-based VAD
    if (isMobileDevice()) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const checkVolume = () => {
        if (!recognitionActiveRef.current) return;
        
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        // Safari interruption logic
        if (!hasEchoProblems()) {
          const threshold = isTTSActiveRef.current 
            ? SAFARI_VOICE_THRESHOLD + 15 
            : SAFARI_VOICE_THRESHOLD;

          if (average > threshold) {
            safariSpeechCountRef.current++;
            if (safariSpeechCountRef.current >= SAFARI_CONFIRMATION_FRAMES) {
              const now = Date.now();
              if (now - lastSafariSpeechTimeRef.current > SAFARI_DEBOUNCE) {
                lastSafariSpeechTimeRef.current = now;
                  onInterruption?.();
                safariSpeechCountRef.current = 0;
              }
            }
          } else {
            safariSpeechCountRef.current = 0;
          }
        }
        
        volumeMonitorRef.current = requestAnimationFrame(checkVolume);
      };
      
      volumeMonitorRef.current = requestAnimationFrame(checkVolume);
      addDebugLog(`[Volume] ✅ Desktop monitoring started`);
    } catch (error: any) {
      addDebugLog(`[Volume] ❌ Failed: ${error.message}`);
    }
  }, [hasEchoProblems, isMobileDevice, isTTSActiveRef, onInterruption, addDebugLog]);

  const stopVolumeMonitoring = useCallback(() => {
    if (volumeMonitorRef.current) {
      cancelAnimationFrame(volumeMonitorRef.current);
      volumeMonitorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  // === MAIN INITIALIZATION ===
  const initializeRecognition = useCallback(async () => {
    addDebugLog(`[Init] 🚀 Starting recognition initialization...`);

    await checkMicrophonePermissions();
    lastProcessedTextRef.current = '';

    // Device detection
    const ios = isIOSDevice();
    const android = isAndroidDevice();
    const mobile = isMobileDevice();
    setIsIOS(ios);

    // API support check
    const speechRecognitionSupport = !!(window as any).SpeechRecognition || 
                                      !!(window as any).webkitSpeechRecognition;

    addDebugLog(`[Device] iOS: ${ios}, Android: ${android}, Mobile: ${mobile}`);
    addDebugLog(`[API] SpeechRecognition: ${speechRecognitionSupport}`);

    // Determine strategy
    const shouldForceOpenAI = ios || android || !speechRecognitionSupport;
    
    addDebugLog(`[Strategy] ${shouldForceOpenAI ? '📱 OpenAI Mode (Mobile VAD)' : '💻 Browser Mode'}`);

    setForceOpenAI(shouldForceOpenAI);
    if (shouldForceOpenAI) setTranscriptionMode('openai');

    // Get microphone access
    try {
      const constraints = mobile ? {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100 },
          channelCount: { ideal: 1 }
        }
      } : { audio: true };

      addDebugLog(`[Mic] 🎤 Requesting access...`);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Log track info
      const tracks = stream.getAudioTracks();
      addDebugLog(`[Mic] ✅ Access granted (${tracks.length} tracks)`);
      tracks.forEach((track, i) => {
        addDebugLog(`[Mic] Track ${i}: ${track.label}, enabled=${track.enabled}, state=${track.readyState}`);
      });

      audioStreamRef.current = stream;
      setMicrophoneAccessGranted(true);

      // Start recording
      startMediaRecording(stream);

      // === MOBILE: Use blob-based VAD ===
      if (ios || android) {
        addDebugLog(`[Init] 📱 Starting Mobile VAD system`);
        startMobileVAD();
        recognitionActiveRef.current = true;
        addDebugLog(`[Init] ✅ Mobile VAD active - speak to test!`);
        return;
      }

      // === DESKTOP: Volume monitoring + Browser Recognition ===
      startVolumeMonitoring(stream);

      if (!shouldForceOpenAI) {
        addDebugLog(`[Init] 💻 Starting Browser SpeechRecognition`);
        
        const SpeechRecognition = (window as any).SpeechRecognition || 
                                  (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
        
      recognition.lang = "ru-RU";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
          // Echo prevention for Chrome
        if (hasEchoProblems() && isTTSActiveRef.current) return;

        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
            if (result.isFinal) {
              finalTranscript += result[0].transcript;
            } else {
              interimTranscript += result[0].transcript;
            }
        }

        if (finalTranscript.trim()) {
          const trimmedText = finalTranscript.trim();
          const lastText = lastProcessedTextRef.current;

            // Dedupe logic
            const isExtension = lastText && 
                               trimmedText.startsWith(lastText) && 
                               (trimmedText.length - lastText.length) > 5;
          const lengthDiff = Math.abs(trimmedText.length - (lastText?.length || 0));
          const maxLength = Math.max(trimmedText.length, lastText?.length || 0);
          const isMinorCorrection = lastText && (lengthDiff / maxLength) < 0.2 && lengthDiff < 50;

          if (isExtension || isMinorCorrection || lastProcessedTextRef.current === trimmedText) {
            lastProcessedTextRef.current = trimmedText;
            return;
          }

          lastProcessedTextRef.current = trimmedText;
          if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
          browserRetryCountRef.current = 0;
            
            addDebugLog(`[Browser] ✅ Final: "${trimmedText}"`);
          onTranscriptionComplete(trimmedText, 'browser');
            
        } else if (interimTranscript.trim()) {
          if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
            
          speechTimeoutRef.current = window.setTimeout(() => {
            if (hasEchoProblems() && isTTSActiveRef.current) return;
              
            const trimmedInterim = interimTranscript.trim();
              addDebugLog(`[Browser] ⏱️ Interim timeout: "${trimmedInterim}"`);
            onTranscriptionComplete(trimmedInterim, 'browser');
          }, 1500);
        }
      };

      recognition.onspeechstart = () => {
        lastProcessedTextRef.current = '';
        onSpeechStart?.();
          
          // Safari interruption
        if (!hasEchoProblems() && isTTSActiveRef.current) {
            const now = Date.now();
            if (now - lastSafariSpeechTimeRef.current > SAFARI_DEBOUNCE) {
              lastSafariSpeechTimeRef.current = now;
            onInterruption?.();
          }
        }
      };

      recognition.onerror = async (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
          
          addDebugLog(`[Browser] ❌ Error: ${event.error}`);

        const retryable = ['network', 'audio-capture', 'not-allowed'];
        if (retryable.includes(event.error) && browserRetryCountRef.current < 3) {
          browserRetryCountRef.current++;
          setTimeout(() => {
            if (recognitionActiveRef.current) {
              try { recognition.start(); } catch(e) {}
            }
          }, 1000 * browserRetryCountRef.current);
          return;
        }

          // Fallback to OpenAI
        if (browserRetryCountRef.current >= 3 || ['network', 'audio-capture'].includes(event.error)) {
            addDebugLog(`[Fallback] Switching to OpenAI`);
          setTranscriptionMode('openai');
            
          const blob = await stopMediaRecording();
          if (blob && blob.size > 1000) {
            const text = await transcribeWithOpenAI(blob);
            if (text) {
                const filtered = filterHallucinatedText(text);
                if (filtered) {
                  onTranscriptionComplete(filtered, 'openai');
                }
            } else {
              onError?.("Не удалось распознать речь");
            }
          }
            
          setTranscriptionMode('browser');
          browserRetryCountRef.current = 0;
            
            // Restart recording
            if (audioStreamRef.current) {
              startMediaRecording(audioStreamRef.current);
            }
        }
      };

      recognition.onend = () => {
        if (recognitionActiveRef.current && !isTTSActiveRef.current) {
          try { recognition.start(); } catch (e) {}
        }
      };

      recognitionRef.current = recognition;
      recognitionActiveRef.current = true;
      recognition.start();
        
        addDebugLog(`[Init] ✅ Browser recognition started`);
      }

    } catch (error: any) {
      addDebugLog(`[Mic] ❌ Failed: ${error.name} - ${error.message}`);

      let errorMessage = "Ошибка доступа к микрофону";
      
      switch (error.name) {
        case 'NotAllowedError':
          errorMessage = "Доступ к микрофону запрещен. Разрешите в настройках браузера.";
          break;
        case 'NotFoundError':
        errorMessage = "Микрофон не найден.";
          break;
        case 'NotReadableError':
          errorMessage = "Микрофон занят другим приложением.";
          break;
        case 'SecurityError':
        errorMessage = "Требуется HTTPS для доступа к микрофону.";
          break;
      }

      onError?.(errorMessage);
      setMicrophoneAccessGranted(false);
    }
  }, [
    checkMicrophonePermissions,
    isIOSDevice,
    isAndroidDevice,
    isMobileDevice,
    hasEchoProblems,
    startMediaRecording,
    stopMediaRecording,
    startMobileVAD,
    startVolumeMonitoring,
    transcribeWithOpenAI,
    filterHallucinatedText,
    onTranscriptionComplete,
    onSpeechStart,
    onInterruption,
    onError,
    isTTSActiveRef,
    addDebugLog
  ]);

  // === CLEANUP ===
  const cleanup = useCallback(() => {
    addDebugLog(`[Cleanup] 🧹 Cleaning up...`);
    
    lastProcessedTextRef.current = '';
    recognitionActiveRef.current = false;
    speechActiveRef.current = false;
    isProcessingRef.current = false;
    
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
      recognitionRef.current = null;
    }
    
    stopVolumeMonitoring();
    stopMobileVAD();
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch(e) {}
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
    
    addDebugLog(`[Cleanup] ✅ Done`);
  }, [stopVolumeMonitoring, stopMobileVAD, addDebugLog]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // === RETURN ===
  return {
    initializeRecognition,
    cleanup,
    transcriptionStatus,
    microphoneAccessGranted,
    microphonePermissionStatus,
    isIOS,
    forceOpenAI,
    transcriptionMode,
    stopRecognition: useCallback(() => {
      addDebugLog(`[Recognition] 🛑 Stopping`);
      recognitionActiveRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
      }
      stopMobileVAD();
    }, [stopMobileVAD, addDebugLog]),
    startRecognition: useCallback(() => {
      addDebugLog(`[Recognition] ▶️ Starting`);
      recognitionActiveRef.current = true;
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch(e) {}
      }
      if (isMobileDevice() && audioStreamRef.current) {
        startMobileVAD();
    }
    }, [startMobileVAD, isMobileDevice, addDebugLog])
  };
};
