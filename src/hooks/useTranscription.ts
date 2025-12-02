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

export const useTranscription = ({
  onTranscriptionComplete,
  onSpeechStart,
  onInterruption,
  isTTSActiveRef,
  onError,
  addDebugLog = console.log
}: UseTranscriptionProps) => {
  const [transcriptionStatus, setTranscriptionStatus] = useState<string | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [forceOpenAI, setForceOpenAI] = useState(false);
  const [transcriptionMode, setTranscriptionMode] = useState<'browser' | 'openai'>('browser');
  const [microphoneAccessGranted, setMicrophoneAccessGranted] = useState(false);
  const [microphonePermissionStatus, setMicrophonePermissionStatus] = useState<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');
  const mobileTranscriptionTimerRef = useRef<number | null>(null);
  const speechEndTimeoutRef = useRef<number | null>(null);
  const speechActiveRef = useRef(false);

  // Refs
  const recognitionRef = useRef<any>(null);
  const recognitionActiveRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const volumeMonitorRef = useRef<number | null>(null);
  const speechTimeoutRef = useRef<number | null>(null);
  const browserRetryCountRef = useRef(0);
  const lastProcessedTextRef = useRef<string>('');

  // Constants
  const SAFARI_VOICE_DETECTION_THRESHOLD = 60;
  const SAFARI_SPEECH_CONFIRMATION_FRAMES = 3;
  const SAFARI_SPEECH_DEBOUNCE = 1000;

  // Speech detection constants
  const SPEECH_DETECTION_THRESHOLD = 3.0; // Minimum volume level to detect speech
  const SPEECH_END_FRAMES = 15; // Number of consecutive frames below threshold to end speech
  const SPEECH_END_PAUSE_MS = 5000; // 5 second pause after speech ends (increased for better UX)

  // Safari Interruption State
  const [safariSpeechDetectionCount, setSafariSpeechDetectionCount] = useState(0);
  const [lastSafariSpeechTime, setLastSafariSpeechTime] = useState(0);

  // Speech end detection state
  const speechEndFrameCountRef = useRef(0);

  // Filter hallucinated text
  const filterHallucinatedText = (text: string): string | null => {
    if (!text) return null;
    const lowerText = text.toLowerCase();

    const hallucinationPatterns = [
      /продолжение следует/i,
      /с вами был/i,
      /до свидания/i,
      /до новых встреч/i,
      /спасибо за внимание/i,
      /конец/i,
      /закончили/i,
      /субтитры/i,
    ];

    for (const pattern of hallucinationPatterns) {
      if (pattern.test(lowerText)) return null;
    }

    if (text.length > 150 || text.length < 2) return null;
    if (text.split(/[.!?]/).length > 3) return null;

    const meaninglessPatterns = [
      /^[а-я]{1}$/i,
      /^[эээ|ммм|ааа|ууу|ооо]+$/i,
      /^[а-я]{1,2}$/i,
    ];

    for (const pattern of meaninglessPatterns) {
      if (pattern.test(text)) return null;
    }

    return text;
  };

  // Browser detection helpers
  const isSafari = useCallback(() => /^((?!chrome|android).)*safari/i.test(navigator.userAgent), []);
  const hasEchoProblems = useCallback(() => /chrome|chromium|edg\/|opera|brave/.test(navigator.userAgent.toLowerCase()), []);
  const isIOSDevice = useCallback(() => /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), []);
  const isAndroidDevice = useCallback(() => /android/.test(navigator.userAgent.toLowerCase()), []);
  const isMobileDevice = useCallback(() => /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase()), []);

  // Check microphone permissions
  const checkMicrophonePermissions = useCallback(async () => {
    if (!navigator.permissions || !navigator.permissions.query) return;
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setMicrophonePermissionStatus(result.state);
      result.addEventListener('change', () => setMicrophonePermissionStatus(result.state));
    } catch (error) {
      console.log("[Permissions] Could not query microphone permissions:", error);
    }
  }, []);

  // Check audio volume
  const checkAudioVolume = async (audioBlob: Blob): Promise<number> => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      let sum = 0;
      let count = 0;
      
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < channelData.length; i++) {
          sum += Math.abs(channelData[i]);
          count++;
        }
      }
      
      audioContext.close();
      return (sum / count) * 100;
    } catch (error) {
      return 0;
    }
  };

  // Handle speech end with pause
  const handleSpeechEnd = useCallback(async () => {
    if (!speechActiveRef.current || !audioStreamRef.current) return;

    addDebugLog(`[Speech] 🎤 Speech ended, waiting ${SPEECH_END_PAUSE_MS}ms before transcription...`);
    addDebugLog(`[Speech] 💡 If you want to add more, just continue speaking!`);

    // Clear existing timeout
    if (speechEndTimeoutRef.current) {
      clearTimeout(speechEndTimeoutRef.current);
    }

    // Set pause before transcription
    speechEndTimeoutRef.current = window.setTimeout(async () => {
      if (!speechActiveRef.current) {
        addDebugLog(`[Speech] ❌ Transcription cancelled - user continued speaking`);
        return; // Speech might have restarted
      }

      try {
        addDebugLog(`[Speech] ⏰ ${SPEECH_END_PAUSE_MS}ms pause completed, sending to transcription...`);

        const blob = await stopMediaRecording();
        speechActiveRef.current = false;

        if (audioStreamRef.current) {
          startMediaRecording(audioStreamRef.current);
        }

        if (blob && blob.size > 5000) {
          const volumeLevel = await checkAudioVolume(blob);
          if (volumeLevel < 2.0) {
            addDebugLog(`[Speech] Audio too quiet (${volumeLevel}), skipping`);
            return;
          }

          addDebugLog(`[Speech] ✅ Sending ${blob.size} bytes to OpenAI...`);
          const text = await transcribeWithOpenAI(blob);

          if (text && text.trim()) {
            const filteredText = filterHallucinatedText(text.trim());
            if (filteredText) {
              addDebugLog(`[Speech] ✅ Transcribed: "${filteredText}"`);
              onTranscriptionComplete(filteredText, 'openai');
            }
          }
        }
      } catch (error) {
        addDebugLog(`[Speech] Error during transcription: ${error}`);
        speechActiveRef.current = false;
        if (audioStreamRef.current && !mediaRecorderRef.current) {
          startMediaRecording(audioStreamRef.current);
        }
      }
    }, SPEECH_END_PAUSE_MS);
  }, [onTranscriptionComplete, addDebugLog]);

  // OpenAI transcription
  const transcribeWithOpenAI = async (audioBlob: Blob): Promise<string | null> => {
    try {
      addDebugLog(`[OpenAI] Starting transcription: ${audioBlob.size} bytes`);
      setTranscriptionStatus("Распознаю речь...");

      const text = await psychologistAI.transcribeAudio(audioBlob);

      if (text && text.trim()) {
        addDebugLog(`[OpenAI] ✅ Success: "${text.substring(0, 50)}..."`);
        return text.trim();
      }
      return null;
    } catch (error: any) {
      addDebugLog(`[OpenAI] ❌ Failed: ${error.message}`);
      return null;
    } finally {
      setTranscriptionStatus("");
    }
  };

  // Media Recorder
  const startMediaRecording = (stream: MediaStream) => {
    if (mediaRecorderRef.current) return;

    try {
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/wav'];
      const selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

      if (!selectedMimeType) {
        addDebugLog(`[MediaRec] ❌ No supported format found`);
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.start(1000);
      addDebugLog(`[MediaRec] ✅ Recording started`);
    } catch (error: any) {
      addDebugLog(`[MediaRec] ❌ Start failed: ${error.message}`);
    }
  };

  const stopMediaRecording = async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
        recordedChunksRef.current = [];
        mediaRecorderRef.current = null;
        resolve(blob);
      };

      mediaRecorderRef.current.stop();
    });
  };

  // Mobile transcription timer
  const startMobileTranscriptionTimer = useCallback(() => {
    if (mobileTranscriptionTimerRef.current) return;
    if (isTTSActiveRef.current) return;

    addDebugLog(`[Mobile] Starting transcription timer (3s intervals)`);

    mobileTranscriptionTimerRef.current = window.setInterval(async () => {
      if (isTTSActiveRef.current || !mediaRecorderRef.current) return;

      const isIOS = isIOSDevice();
      const isAndroid = isAndroidDevice();
      if (!isIOS && !isAndroid) return;

      try {
        const blob = await stopMediaRecording();

        if (audioStreamRef.current) {
          startMediaRecording(audioStreamRef.current);
        }

        if (blob && blob.size > 5000) {
          if (isTTSActiveRef.current) return;

          const volumeLevel = await checkAudioVolume(blob);
          if (volumeLevel < 2.0) return;

          addDebugLog(`[Mobile] ✅ Sending ${blob.size} bytes to OpenAI...`);

          const timeoutPromise = new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), 8000);
          });

          const text = await Promise.race([transcribeWithOpenAI(blob), timeoutPromise]);

          if (text && text.trim()) {
            const filteredText = filterHallucinatedText(text.trim());
            if (filteredText) {
              addDebugLog(`[Mobile] ✅ Transcribed: "${filteredText}"`);
              onTranscriptionComplete(filteredText, 'openai');
            }
          }
        }
      } catch (error) {
        addDebugLog(`[Mobile] Error: ${error}`);
        if (audioStreamRef.current && !mediaRecorderRef.current) {
          startMediaRecording(audioStreamRef.current);
        }
      }
    }, 3000);
  }, [isIOSDevice, isAndroidDevice, isTTSActiveRef, onTranscriptionComplete]);

  const stopMobileTranscriptionTimer = useCallback(() => {
    if (mobileTranscriptionTimerRef.current) {
      clearInterval(mobileTranscriptionTimerRef.current);
      mobileTranscriptionTimerRef.current = null;
    }
  }, []);

  // Volume monitoring
  const startVolumeMonitoring = async (stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioAnalyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!recognitionActiveRef.current || !audioAnalyserRef.current) return;

        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        // Speech detection for mobile devices (OpenAI mode)
        if (isIOSDevice() || isAndroidDevice()) {
          if (average > SPEECH_DETECTION_THRESHOLD) {
            // Speech detected
            if (!speechActiveRef.current) {
              addDebugLog(`[Speech] 🎙️ Speech started (volume: ${average.toFixed(1)})`);
              speechActiveRef.current = true;
            }
            speechEndFrameCountRef.current = 0; // Reset end counter

            // Clear any pending speech end timeout (allows user to continue speaking)
            if (speechEndTimeoutRef.current) {
              addDebugLog(`[Speech] 🛑 Transcription timeout cancelled - user continued speaking`);
              clearTimeout(speechEndTimeoutRef.current);
              speechEndTimeoutRef.current = null;
            }
          } else {
            // No speech detected
            if (speechActiveRef.current) {
              speechEndFrameCountRef.current++;
              if (speechEndFrameCountRef.current >= SPEECH_END_FRAMES) {
                // Speech has ended
                addDebugLog(`[Speech] Speech ended (volume: ${average.toFixed(1)}), frames below threshold: ${speechEndFrameCountRef.current}`);
                handleSpeechEnd();
              }
            }
          }
        }

        if (!hasEchoProblems()) {
          const isAssistantActive = isTTSActiveRef.current;
          const threshold = isAssistantActive ? SAFARI_VOICE_DETECTION_THRESHOLD + 15 : SAFARI_VOICE_DETECTION_THRESHOLD;

          if (average > threshold) {
            setSafariSpeechDetectionCount(prev => {
              const newCount = prev + 1;
              if (newCount >= SAFARI_SPEECH_CONFIRMATION_FRAMES) {
                const currentTime = Date.now();
                if (currentTime - lastSafariSpeechTime > SAFARI_SPEECH_DEBOUNCE) {
                  setLastSafariSpeechTime(currentTime);
                  onInterruption?.();
                  return 0;
                }
              }
              return newCount;
            });
          } else {
            setSafariSpeechDetectionCount(0);
          }
        }
        volumeMonitorRef.current = requestAnimationFrame(checkVolume);
      };
      volumeMonitorRef.current = requestAnimationFrame(checkVolume);
    } catch (error) {
      console.warn("[Transcription] Volume monitoring failed:", error);
    }
  };

  const stopVolumeMonitoring = () => {
    if (volumeMonitorRef.current) {
      cancelAnimationFrame(volumeMonitorRef.current);
      volumeMonitorRef.current = null;
    }
    if (audioAnalyserRef.current) {
      audioAnalyserRef.current.disconnect();
      audioAnalyserRef.current = null;
    }
  };

  // Initialize recognition
  const initializeRecognition = useCallback(async () => {
    console.log("[Transcription] 🚀 Starting recognition initialization...");

    await checkMicrophonePermissions();
    lastProcessedTextRef.current = '';

    const ios = isIOSDevice();
    const mobile = isMobileDevice();
    setIsIOS(ios);

    const speechRecognitionSupport = !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
    const android = isAndroidDevice();
    const shouldForceOpenAI = ios || android || !speechRecognitionSupport;

    addDebugLog(`[Strategy] ${shouldForceOpenAI ? 'OpenAI Mode' : 'Browser Mode'}`);

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

      addDebugLog(`[Mic] Requesting access...`);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      addDebugLog(`[Mic] ✅ Access granted`);

      audioStreamRef.current = stream;
      setMicrophoneAccessGranted(true);

      startMediaRecording(stream);
      startVolumeMonitoring(stream);

      if (ios || android) {
        addDebugLog(`[Init] Mobile speech detection enabled (${SPEECH_END_PAUSE_MS}ms pause after speech ends)`);
        addDebugLog(`[Init] 💡 Continue speaking within ${SPEECH_END_PAUSE_MS/1000}s to add more to your message`);
        // Speech detection is now handled in volume monitoring, no timer needed
      }

      if (shouldForceOpenAI) return;

      // Browser Speech Recognition
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
          if (result.isFinal) finalTranscript += result[0].transcript;
          else interimTranscript += result[0].transcript;
        }

        if (finalTranscript.trim()) {
          const trimmedText = finalTranscript.trim();
          const lastText = lastProcessedTextRef.current;

          const isExtension = lastText && trimmedText.startsWith(lastText) && (trimmedText.length - lastText.length) > 5;
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
          onTranscriptionComplete(trimmedText, 'browser');
        } else if (interimTranscript.trim()) {
          if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
          speechTimeoutRef.current = window.setTimeout(() => {
            if (hasEchoProblems() && isTTSActiveRef.current) return;
            const trimmedInterim = interimTranscript.trim();
            onTranscriptionComplete(trimmedInterim, 'browser');
          }, 1500);
        }
      };

      recognition.onspeechstart = () => {
        lastProcessedTextRef.current = '';
        onSpeechStart?.();
        if (!hasEchoProblems() && isTTSActiveRef.current) {
          const currentTime = Date.now();
          if (currentTime - lastSafariSpeechTime > SAFARI_SPEECH_DEBOUNCE) {
            setLastSafariSpeechTime(currentTime);
            onInterruption?.();
          }
        }
      };

      recognition.onerror = async (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        console.error("[Transcription] Error:", event.error);

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
          setTranscriptionMode('openai');
          const blob = await stopMediaRecording();
          if (blob && blob.size > 1000) {
            const text = await transcribeWithOpenAI(blob);
            if (text) {
              onTranscriptionComplete(text, 'openai');
            } else {
              onError?.("Не удалось распознать речь");
            }
          }
          setTranscriptionMode('browser');
          browserRetryCountRef.current = 0;
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

    } catch (error: any) {
      addDebugLog(`[Mic] ❌ Failed: ${error.name} - ${error.message}`);

      let errorMessage = "Ошибка доступа к микрофону";
      if (error.name === 'NotAllowedError') {
        errorMessage = "Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.";
      } else if (error.name === 'NotFoundError') {
        errorMessage = "Микрофон не найден.";
      } else if (error.name === 'SecurityError') {
        errorMessage = "Требуется HTTPS для доступа к микрофону.";
      }

      onError?.(errorMessage);
      setMicrophoneAccessGranted(false);
    }
  }, []);

  // Cleanup
  const cleanup = useCallback(() => {
    lastProcessedTextRef.current = '';
    recognitionActiveRef.current = false;
    speechActiveRef.current = false;
    if (recognitionRef.current) try { recognitionRef.current.stop(); } catch(e) {}
    stopVolumeMonitoring();
    stopMobileTranscriptionTimer();
    stopMediaRecording();
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    if (speechEndTimeoutRef.current) {
      clearTimeout(speechEndTimeoutRef.current);
      speechEndTimeoutRef.current = null;
    }
  }, [stopMobileTranscriptionTimer]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    initializeRecognition,
    cleanup,
    transcriptionStatus,
    microphoneAccessGranted,
    microphonePermissionStatus,
    isIOS,
    forceOpenAI,
    transcriptionMode,
    stopRecognition: () => {
      recognitionActiveRef.current = false;
      recognitionRef.current?.stop();
    },
    startRecognition: () => {
      recognitionActiveRef.current = true;
      try { recognitionRef.current?.start(); } catch(e) {}
    }
  };
};

