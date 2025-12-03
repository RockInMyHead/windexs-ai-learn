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
  const SPEECH_DETECTION_THRESHOLD = 2.0; // Minimum volume level to detect speech (reduced for better detection)
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
      const isMobile = isIOSDevice() || isAndroidDevice();
      addDebugLog(`[Volume] Starting volume monitoring... (mobile: ${isMobile})`);
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();

      // Resume audio context for iOS/Safari (required for proper audio processing)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
        addDebugLog(`[AudioContext] Resumed suspended context`);
      }

      addDebugLog(`[AudioContext] Initialized: ${audioContext.state}, sampleRate: ${audioContext.sampleRate}`);

      const source = audioContext.createMediaStreamSource(stream);
      addDebugLog(`[Volume] ✅ MediaStreamSource created from stream (tracks: ${stream.getTracks().length})`);
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      audioAnalyserRef.current = analyser;
      addDebugLog(`[Volume] ✅ Analyser connected, fftSize: ${analyser.fftSize}, frequencyBinCount: ${analyser.frequencyBinCount}`);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      let lastLogTime = 0;
      let frameCount = 0;
      
      const checkVolume = () => {
        frameCount++;
        const now = Date.now();
        const isMobile = isIOSDevice() || isAndroidDevice();
        
        // Подробная проверка состояния
        if (!recognitionActiveRef.current || !audioAnalyserRef.current) {
          if (isMobile) {
            // Логируем каждые 2 секунды, чтобы не спамить
            if (now - lastLogTime > 2000) {
              addDebugLog(`[Mobile] ⚠️ Volume monitoring stopped - active: ${recognitionActiveRef.current}, analyser: ${!!audioAnalyserRef.current}, frame: ${frameCount}`);
              addDebugLog(`[Mobile] State check - recognitionActiveRef: ${recognitionActiveRef.current}, audioAnalyserRef: ${!!audioAnalyserRef.current}`);
              lastLogTime = now;
            }
          }
          return;
        }

        try {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const maxVolume = Math.max(...Array.from(dataArray));

          // Debug volume levels - более частые логи для мобильных устройств
          if (isMobile) {
            // Логируем каждую секунду для мобильных устройств
            if (now - lastLogTime >= 1000) {
              addDebugLog(`[Mobile] 🔊 Volume: avg=${average.toFixed(2)}, max=${maxVolume}, threshold=${SPEECH_DETECTION_THRESHOLD}, speechActive=${speechActiveRef.current}, frame=${frameCount}`);
              addDebugLog(`[Mobile] State - recognitionActive: ${recognitionActiveRef.current}, analyser: ${!!audioAnalyserRef.current}, stream: ${!!audioStreamRef.current}`);
              lastLogTime = now;
            }
          } else {
            // Less frequent for desktop
            if (average > SPEECH_DETECTION_THRESHOLD * 1.5 || (average < 0.5 && Math.floor(now / 1000) % 5 === 0)) {
              addDebugLog(`[Volume] Level: ${average.toFixed(2)} (threshold: ${SPEECH_DETECTION_THRESHOLD})`);
            }
          }

          // Speech detection for mobile devices (OpenAI mode)
          const isDesktop = !isMobile;

          // Debug device detection once
          if (!window.deviceDebugLogged) {
            addDebugLog(`[Device] Mobile: ${isMobile}, Desktop: ${isDesktop}, iOS: ${isIOSDevice()}, Android: ${isAndroidDevice()}`);
            window.deviceDebugLogged = true;
          }

          if (isMobile) {
            // Lower threshold for mobile devices - microphones may be less sensitive
            const mobileThreshold = SPEECH_DETECTION_THRESHOLD * 0.5; // 1.0 instead of 2.0
            const isAboveThreshold = average > mobileThreshold;
            
            // Подробное логирование для мобильных устройств
            if (now - lastLogTime >= 1000) {
              addDebugLog(`[Mobile] 🎤 Speech check - volume: ${average.toFixed(2)}, threshold: ${mobileThreshold.toFixed(2)}, above: ${isAboveThreshold}, speechActive: ${speechActiveRef.current}, endFrames: ${speechEndFrameCountRef.current}/${SPEECH_END_FRAMES}`);
            }
            
            if (isAboveThreshold) {
              // Speech detected
              if (!speechActiveRef.current) {
                addDebugLog(`[Speech] 🎙️ Mobile speech STARTED (volume: ${average.toFixed(2)}, threshold: ${mobileThreshold.toFixed(2)}, max: ${maxVolume})`);
                speechActiveRef.current = true;
                onSpeechStart?.();
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
                if (now - lastLogTime >= 1000) {
                  addDebugLog(`[Mobile] 🔇 Silence detected - volume: ${average.toFixed(2)}, endFrames: ${speechEndFrameCountRef.current}/${SPEECH_END_FRAMES}`);
                }
                if (speechEndFrameCountRef.current >= SPEECH_END_FRAMES) {
                  // Speech has ended
                  addDebugLog(`[Speech] 🛑 Mobile speech ENDED (volume: ${average.toFixed(2)}), frames below threshold: ${speechEndFrameCountRef.current}`);
                  handleSpeechEnd();
                }
              } else {
                // Логируем тишину, когда речь не активна (для отладки)
                if (now - lastLogTime >= 2000 && average < 0.5) {
                  addDebugLog(`[Mobile] 🔇 Very quiet - volume: ${average.toFixed(2)}, may indicate mic issue`);
                }
              }
            }
          } else if (isDesktop) {
            // Desktop speech detection - try lower threshold if mobile detection isn't working
            const desktopThreshold = SPEECH_DETECTION_THRESHOLD * 0.8; // 1.6 for even better detection
            if (average > desktopThreshold) {
              if (!speechActiveRef.current) {
                addDebugLog(`[Speech] 🎙️ Desktop speech started (volume: ${average.toFixed(1)}, threshold: ${desktopThreshold.toFixed(1)})`);
                speechActiveRef.current = true;
              }
              speechEndFrameCountRef.current = 0;

              if (speechEndTimeoutRef.current) {
                clearTimeout(speechEndTimeoutRef.current);
                speechEndTimeoutRef.current = null;
              }
            } else {
              if (speechActiveRef.current) {
                speechEndFrameCountRef.current++;
                if (speechEndFrameCountRef.current >= SPEECH_END_FRAMES) {
                  addDebugLog(`[Speech] Desktop speech ended (volume: ${average.toFixed(1)})`);
                  handleSpeechEnd();
                }
              }
            }
          }

          // Fallback: if no device-specific detection worked but volume is very high
          if (!speechActiveRef.current && average > SPEECH_DETECTION_THRESHOLD * 2) {
            addDebugLog(`[Speech] 🚨 HIGH VOLUME detected: ${average.toFixed(1)} - forcing speech start`);
            speechActiveRef.current = true;
            speechEndFrameCountRef.current = 0;
            if (speechEndTimeoutRef.current) {
              clearTimeout(speechEndTimeoutRef.current);
              speechEndTimeoutRef.current = null;
            }
          }

        } catch (error: any) {
          const isMobile = isIOSDevice() || isAndroidDevice();
          if (isMobile) {
            addDebugLog(`[Mobile] ❌ Audio analysis error: ${error?.message || error}, frame: ${frameCount}`);
            addDebugLog(`[Mobile] Error details - analyser: ${!!audioAnalyserRef.current}, stream: ${!!audioStreamRef.current}, active: ${recognitionActiveRef.current}`);
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
      
      addDebugLog(`[Volume] ✅ Starting volume check loop...`);
      volumeMonitorRef.current = requestAnimationFrame(checkVolume);
      
      // Проверка через секунду, что все работает
      setTimeout(() => {
        const isMobile = isIOSDevice() || isAndroidDevice();
        if (isMobile) {
          addDebugLog(`[Volume] 1s check - active: ${recognitionActiveRef.current}, analyser: ${!!audioAnalyserRef.current}, monitor: ${!!volumeMonitorRef.current}`);
        }
      }, 1000);
      
    } catch (error: any) {
      const isMobile = isIOSDevice() || isAndroidDevice();
      const errorMsg = `[Volume] ❌ Volume monitoring failed: ${error?.message || error}`;
      addDebugLog(errorMsg);
      if (isMobile) {
        addDebugLog(`[Volume] Mobile error details - stream: ${!!stream}, stream tracks: ${stream?.getTracks().length || 0}`);
      }
      console.warn("[Transcription] Volume monitoring failed:", error);
    }
  };

  const stopVolumeMonitoring = () => {
    const isMobile = isIOSDevice() || isAndroidDevice();
    if (isMobile) {
      addDebugLog(`[Volume] 🛑 Stopping volume monitoring...`);
    }
    
    if (volumeMonitorRef.current) {
      cancelAnimationFrame(volumeMonitorRef.current);
      volumeMonitorRef.current = null;
      if (isMobile) {
        addDebugLog(`[Volume] ✅ Animation frame cancelled`);
      }
    }
    if (audioAnalyserRef.current) {
      audioAnalyserRef.current.disconnect();
      audioAnalyserRef.current = null;
      if (isMobile) {
        addDebugLog(`[Volume] ✅ Analyser disconnected`);
      }
    }
  };

  // Initialize recognition
  const initializeRecognition = useCallback(async () => {
    console.log("[Transcription] 🚀 Starting recognition initialization...");

    await checkMicrophonePermissions();
    lastProcessedTextRef.current = '';

    const ios = isIOSDevice();
    const android = isAndroidDevice();
    const mobile = isMobileDevice();
    setIsIOS(ios);

    const speechRecognitionSupport = !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
    const shouldForceOpenAI = ios || android || !speechRecognitionSupport;

    addDebugLog(`[Device] iOS: ${ios}, Android: ${android}, Mobile: ${mobile}`);
    addDebugLog(`[Strategy] ${shouldForceOpenAI ? 'OpenAI Mode (forced)' : 'Browser Mode'} - SpeechRecognition: ${speechRecognitionSupport}`);

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
      addDebugLog(`[Init] Starting volume monitoring...`);
      startVolumeMonitoring(stream);

      if (ios || android) {
        addDebugLog(`[Init] Mobile speech detection enabled (${SPEECH_END_PAUSE_MS}ms pause after speech ends)`);
        addDebugLog(`[Init] 💡 Continue speaking within ${SPEECH_END_PAUSE_MS/1000}s to add more to your message`);
        // Speech detection is now handled in volume monitoring, no timer needed
      }

      if (shouldForceOpenAI) {
        // For mobile devices using OpenAI mode, we need to set recognitionActive to true
        // so that volume monitoring continues to work
        recognitionActiveRef.current = true;
        addDebugLog(`[Init] ✅ Mobile OpenAI mode ready - volume monitoring active`);
        addDebugLog(`[Init] State set - recognitionActiveRef: ${recognitionActiveRef.current}, audioStream: ${!!audioStreamRef.current}`);
        
        // Проверяем состояние через небольшую задержку
        setTimeout(() => {
          addDebugLog(`[Init] Post-init check - recognitionActive: ${recognitionActiveRef.current}, analyser: ${!!audioAnalyserRef.current}, stream: ${!!audioStreamRef.current}`);
        }, 500);
        
        return;
      }

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
    const isMobile = isIOSDevice() || isAndroidDevice();
    if (isMobile) {
      addDebugLog(`[Cleanup] 🧹 Starting cleanup...`);
    }
    
    lastProcessedTextRef.current = '';
    recognitionActiveRef.current = false;
    speechActiveRef.current = false;
    
    if (isMobile) {
      addDebugLog(`[Cleanup] State reset - recognitionActive: false, speechActive: false`);
    }
    
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
    
    if (isMobile) {
      addDebugLog(`[Cleanup] ✅ Cleanup complete`);
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
      const isMobile = isIOSDevice() || isAndroidDevice();
      if (isMobile) {
        addDebugLog(`[Recognition] 🛑 stopRecognition called`);
      }
      recognitionActiveRef.current = false;
      recognitionRef.current?.stop();
      if (isMobile) {
        addDebugLog(`[Recognition] State - recognitionActive: ${recognitionActiveRef.current}`);
      }
    },
    startRecognition: () => {
      const isMobile = isIOSDevice() || isAndroidDevice();
      if (isMobile) {
        addDebugLog(`[Recognition] ▶️ startRecognition called`);
      }
      recognitionActiveRef.current = true;
      try { recognitionRef.current?.start(); } catch(e) {}
      if (isMobile) {
        addDebugLog(`[Recognition] State - recognitionActive: ${recognitionActiveRef.current}`);
      }
    }
  };
};

