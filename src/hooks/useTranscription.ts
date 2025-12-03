/**
 * useTranscription - Голосовая система с ScriptProcessorNode VAD
 * 
 * Архитектура:
 * - iOS/Android: OpenAI Whisper + VAD через ScriptProcessorNode (raw PCM анализ)
 * - Desktop: Browser SpeechRecognition + OpenAI fallback
 * 
 * Ключевое отличие:
 * - Анализ громкости через ScriptProcessorNode (работает на iOS!)
 * - MediaRecorder только для записи аудио
 * - ScriptProcessorNode дает raw PCM данные для анализа в реальном времени
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
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const volumeMonitorRef = useRef<number | null>(null);
  const speechTimeoutRef = useRef<number | null>(null);
  const browserRetryCountRef = useRef(0);
  const lastProcessedTextRef = useRef<string>('');

  // Mobile VAD refs
  const speechActiveRef = useRef(false);
  const silenceStartTimeRef = useRef<number>(0);
  const speechStartTimeRef = useRef<number>(0);
  const isProcessingRef = useRef(false);
  const currentVolumeRef = useRef<number>(0);
  const volumeHistoryRef = useRef<number[]>([]);

  // Safari interruption state
  const safariSpeechCountRef = useRef(0);
  const lastSafariSpeechTimeRef = useRef(0);

  // === CONSTANTS ===
  const SAFARI_VOICE_THRESHOLD = 60;
  const SAFARI_CONFIRMATION_FRAMES = 3;
  const SAFARI_DEBOUNCE = 1000;

  // Mobile VAD constants
  const MOBILE_SPEECH_THRESHOLD = 1.5;    // 1.5% громкости для определения речи
  const MOBILE_SILENCE_DURATION = 1500;   // 1.5 сек тишины для окончания речи
  const MOBILE_MIN_SPEECH_DURATION = 500; // Минимум 500ms речи
  const MOBILE_MIN_AUDIO_SIZE = 5000;     // Минимум 5KB аудио

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
      /^\s*\.+\s*$/,
      /^\s*,+\s*$/,
    ];

    for (const pattern of hallucinationPatterns) {
      if (pattern.test(lowerText)) {
        addDebugLog(`[Filter] ⚠️ Hallucination: "${text}"`);
        return null;
      }
    }

    if (text.length > 200 || text.length < 2) return null;
    if (text.split(/[.!?]/).filter(s => s.trim()).length > 4) return null;

    const meaninglessPatterns = [
      /^[а-яa-z]{1}$/i,
      /^[эээ]+$/i,
      /^[ммм]+$/i,
      /^[ааа]+$/i,
      /^[а-яa-z]{1,2}$/i,
    ];

    for (const pattern of meaninglessPatterns) {
      if (pattern.test(text.trim())) return null;
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

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onerror = (event: any) => {
        addDebugLog(`[MediaRec] ❌ Error: ${event.error?.message || 'Unknown'}`);
      };

      // Записываем непрерывно, chunks каждую секунду
      recorder.start(1000);
      addDebugLog(`[MediaRec] ✅ Started (1s chunks)`);
    } catch (error: any) {
      addDebugLog(`[MediaRec] ❌ Start failed: ${error.message}`);
    }
  }, [addDebugLog]);

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
        addDebugLog(`[MediaRec] 🛑 Stopped, blob size: ${blob.size} bytes`);
        recordedChunksRef.current = [];
        mediaRecorderRef.current = null;
        resolve(blob);
      };

      recorder.stop();
    });
  }, [addDebugLog]);

  // === SCRIPT PROCESSOR VAD (работает на iOS!) ===
  const setupScriptProcessorVAD = useCallback((stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
      
      // Резюмируем контекст (важно для iOS)
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          addDebugLog(`[VAD] AudioContext resumed`);
        });
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // ScriptProcessorNode дает доступ к raw PCM данным
      // Используем размер буфера 4096 для баланса между latency и производительностью
      const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      let lastLogTime = 0;
      let frameCount = 0;

      scriptProcessor.onaudioprocess = (event) => {
        // Пропускаем если TTS активен
        if (isTTSActiveRef.current) {
          if (speechActiveRef.current) {
            addDebugLog(`[VAD] 🔇 TTS active - resetting speech state`);
            speechActiveRef.current = false;
            silenceStartTimeRef.current = 0;
            recordedChunksRef.current = [];
          }
          return;
        }

        if (isProcessingRef.current) return;

        frameCount++;
        const now = Date.now();

        // Получаем raw PCM данные
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Вычисляем RMS (Root Mean Square) - реальная громкость
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const volumePercent = rms * 100;

        // Сохраняем текущую громкость
        currentVolumeRef.current = volumePercent;

        // Сохраняем историю громкости (последние 10 значений)
        volumeHistoryRef.current.push(volumePercent);
        if (volumeHistoryRef.current.length > 10) {
          volumeHistoryRef.current.shift();
        }

        // Средняя громкость за последние измерения
        const avgVolume = volumeHistoryRef.current.reduce((a, b) => a + b, 0) / volumeHistoryRef.current.length;

        const isSpeaking = avgVolume > MOBILE_SPEECH_THRESHOLD;

        // Логируем каждую секунду
        if (now - lastLogTime >= 1000) {
          addDebugLog(`[VAD] 📊 Vol: ${avgVolume.toFixed(2)}% (raw: ${volumePercent.toFixed(2)}%) | Speaking: ${isSpeaking} | Active: ${speechActiveRef.current}`);
          lastLogTime = now;
        }

        if (isSpeaking) {
          // === ОБНАРУЖЕНА РЕЧЬ ===
          if (!speechActiveRef.current) {
            addDebugLog(`[VAD] 🎤 Speech STARTED (vol: ${avgVolume.toFixed(2)}%)`);
            speechActiveRef.current = true;
            speechStartTimeRef.current = now;
            onSpeechStart?.();
          }
          silenceStartTimeRef.current = 0;
          
        } else {
          // === ТИШИНА ===
          if (speechActiveRef.current) {
            if (!silenceStartTimeRef.current) {
              silenceStartTimeRef.current = now;
              addDebugLog(`[VAD] 🔇 Silence started, waiting ${MOBILE_SILENCE_DURATION}ms...`);
            }
            
            const silenceDuration = now - silenceStartTimeRef.current;
            const speechDuration = now - speechStartTimeRef.current;
            
            if (silenceDuration >= MOBILE_SILENCE_DURATION) {
              addDebugLog(`[VAD] ✅ Speech ENDED (duration: ${speechDuration}ms, silence: ${silenceDuration}ms)`);
              
              speechActiveRef.current = false;
              silenceStartTimeRef.current = 0;
              
              // Проверяем минимальную длительность
              if (speechDuration < MOBILE_MIN_SPEECH_DURATION) {
                addDebugLog(`[VAD] ⚠️ Speech too short (${speechDuration}ms < ${MOBILE_MIN_SPEECH_DURATION}ms)`);
                return;
              }
              
              // Останавливаем запись и отправляем на транскрибацию
              isProcessingRef.current = true;
              
              (async () => {
                try {
                  const audioBlob = await stopMediaRecording();
                  
                  // Сразу перезапускаем запись
                  if (audioStreamRef.current) {
                    startMediaRecording(audioStreamRef.current);
                  }
                  
                  if (!audioBlob || audioBlob.size < MOBILE_MIN_AUDIO_SIZE) {
                    addDebugLog(`[VAD] ⚠️ Audio too small (${audioBlob?.size || 0} bytes)`);
                    return;
                  }
                  
                  addDebugLog(`[VAD] 📤 Sending ${audioBlob.size} bytes to OpenAI...`);
                  
                  const text = await transcribeWithOpenAI(audioBlob);
                  
                  if (text?.trim()) {
                    const filteredText = filterHallucinatedText(text.trim());
                    
                    if (filteredText) {
                      addDebugLog(`[VAD] ✅ Transcribed: "${filteredText}"`);
                      onTranscriptionComplete(filteredText, 'openai');
                    }
                  }
                } catch (error: any) {
                  addDebugLog(`[VAD] ❌ Error: ${error.message}`);
                  // Перезапускаем запись при ошибке
                  if (audioStreamRef.current && !mediaRecorderRef.current) {
                    startMediaRecording(audioStreamRef.current);
                  }
                } finally {
                  isProcessingRef.current = false;
                }
              })();
            }
          }
        }
      };

      // Подключаем цепочку
      source.connect(scriptProcessor);
      scriptProcessor.connect(audioContextRef.current.destination);

      addDebugLog(`[VAD] ✅ ScriptProcessor VAD started (buffer: 4096, sampleRate: ${audioContextRef.current.sampleRate})`);
      
    } catch (error: any) {
      addDebugLog(`[VAD] ❌ Setup failed: ${error.message}`);
    }
  }, [
    isTTSActiveRef,
    onSpeechStart,
    onTranscriptionComplete,
    stopMediaRecording,
    startMediaRecording,
    transcribeWithOpenAI,
    filterHallucinatedText,
    addDebugLog,
    MOBILE_SPEECH_THRESHOLD,
    MOBILE_SILENCE_DURATION,
    MOBILE_MIN_SPEECH_DURATION,
    MOBILE_MIN_AUDIO_SIZE
  ]);

  const stopScriptProcessorVAD = useCallback(() => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
      addDebugLog(`[VAD] 🛑 ScriptProcessor stopped`);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    speechActiveRef.current = false;
    silenceStartTimeRef.current = 0;
    volumeHistoryRef.current = [];
  }, [addDebugLog]);

  // === VOLUME MONITORING FOR DESKTOP ===
  const startVolumeMonitoring = useCallback(async (stream: MediaStream) => {
    if (isMobileDevice()) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const tempContext = new AudioContextClass();
      
      if (tempContext.state === 'suspended') {
        await tempContext.resume();
      }

      const source = tempContext.createMediaStreamSource(stream);
      const analyser = tempContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!recognitionActiveRef.current) return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

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
    } catch (error: any) {
      addDebugLog(`[Volume] ❌ Failed: ${error.message}`);
    }
  }, [hasEchoProblems, isMobileDevice, isTTSActiveRef, onInterruption, addDebugLog]);

  const stopVolumeMonitoring = useCallback(() => {
    if (volumeMonitorRef.current) {
      cancelAnimationFrame(volumeMonitorRef.current);
      volumeMonitorRef.current = null;
    }
  }, []);

  // === MAIN INITIALIZATION ===
  const initializeRecognition = useCallback(async () => {
    addDebugLog(`[Init] 🚀 Starting recognition initialization...`);

    await checkMicrophonePermissions();
    lastProcessedTextRef.current = '';

    const ios = isIOSDevice();
    const android = isAndroidDevice();
    const mobile = isMobileDevice();
    setIsIOS(ios);

    const speechRecognitionSupport = !!(window as any).SpeechRecognition || 
                                      !!(window as any).webkitSpeechRecognition;

    addDebugLog(`[Device] iOS: ${ios}, Android: ${android}, Mobile: ${mobile}`);
    addDebugLog(`[API] SpeechRecognition: ${speechRecognitionSupport}`);

    const shouldForceOpenAI = ios || android || !speechRecognitionSupport;
    
    addDebugLog(`[Strategy] ${shouldForceOpenAI ? '📱 OpenAI Mode (ScriptProcessor VAD)' : '💻 Browser Mode'}`);

    setForceOpenAI(shouldForceOpenAI);
    if (shouldForceOpenAI) setTranscriptionMode('openai');

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
      
      const tracks = stream.getAudioTracks();
      addDebugLog(`[Mic] ✅ Access granted (${tracks.length} tracks)`);
      tracks.forEach((track, i) => {
        addDebugLog(`[Mic] Track ${i}: ${track.label}, enabled=${track.enabled}, state=${track.readyState}`);
      });

      audioStreamRef.current = stream;
      setMicrophoneAccessGranted(true);

      // === MOBILE: ScriptProcessor VAD + MediaRecorder ===
      if (ios || android) {
        addDebugLog(`[Init] 📱 Starting ScriptProcessor VAD for mobile`);
        
        // Сначала запускаем запись
        startMediaRecording(stream);
        
        // Затем VAD для анализа громкости
        setupScriptProcessorVAD(stream);
        
        recognitionActiveRef.current = true;
        addDebugLog(`[Init] ✅ Mobile VAD active - speak to test!`);
        return;
      }

      // === DESKTOP ===
      startVolumeMonitoring(stream);
      startMediaRecording(stream);

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
    setupScriptProcessorVAD,
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
    stopScriptProcessorVAD();
    
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
  }, [stopVolumeMonitoring, stopScriptProcessorVAD, addDebugLog]);

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
      stopScriptProcessorVAD();
    }, [stopScriptProcessorVAD, addDebugLog]),
    startRecognition: useCallback(() => {
      addDebugLog(`[Recognition] ▶️ Starting`);
      recognitionActiveRef.current = true;
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch(e) {}
      }
      if (isMobileDevice() && audioStreamRef.current) {
        setupScriptProcessorVAD(audioStreamRef.current);
        if (!mediaRecorderRef.current) {
          startMediaRecording(audioStreamRef.current);
        }
      }
    }, [setupScriptProcessorVAD, startMediaRecording, isMobileDevice, addDebugLog])
  };
};
