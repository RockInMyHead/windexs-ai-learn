import { useState, useRef, useEffect, useCallback } from 'react';
// TranscriptionService interface moved to types/services.ts
  transcribeAudio(audioBlob: Blob): Promise<string>;
}

interface UseTranscriptionProps {
  transcriptionService?: TranscriptionService;
  onTranscriptionComplete: (text: string, source: 'browser' | 'openai' | 'manual') => void;
  onSpeechStart?: () => void;
  onInterruption?: () => void; // Called when user interrupts via voice
  isTTSActiveRef: React.MutableRefObject<boolean>; // To check if TTS is playing for echo cancellation
  onError?: (error: string) => void;
}

export const useTranscription = ({ transcriptionService,
  onTranscriptionComplete,
  onSpeechStart,
  onInterruption,
  isTTSActiveRef,
  onError,
  addDebugLog = console.log // Default to console.log if not provided
}: UseTranscriptionProps & { addDebugLog?: (message: string) => void }) => {
  const [transcriptionStatus, setTranscriptionStatus] = useState<string | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [forceOpenAI, setForceOpenAI] = useState(false);
  const [transcriptionMode, setTranscriptionMode] = useState<'browser' | 'openai'>('browser');
  const [microphoneAccessGranted, setMicrophoneAccessGranted] = useState(false);
  const [microphonePermissionStatus, setMicrophonePermissionStatus] = useState<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');
  const mobileTranscriptionTimerRef = useRef<number | null>(null);
  
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

  // Constants
  const SAFARI_VOICE_DETECTION_THRESHOLD = 60;
  const SAFARI_SPEECH_CONFIRMATION_FRAMES = 3;
  const SAFARI_SPEECH_DEBOUNCE = 1000;

  // Filter out hallucinated text patterns
  const filterHallucinatedText = (text: string): string | null => {
    if (!text) return null;

    const lowerText = text.toLowerCase();

    // Common hallucinated patterns
    const hallucinationPatterns = [
      /продолжение следует/i,
      /с вами был/i,
      /до свидания/i,
      /до новых встреч/i,
      /спасибо за внимание/i,
      /конец/i,
      /закончили/i,
      /я мухаммад асад/i,
      /здравствуйте! я мухаммад асад/i,
      /я марк/i, // Filter out AI introducing itself
      /здравствуйте, я марк/i,
    ];

    // Check if text matches hallucination patterns
    for (const pattern of hallucinationPatterns) {
      if (pattern.test(lowerText)) {
        return null;
      }
    }

    // Filter out text that's too long (likely hallucination)
    if (text.length > 100) {
      return null;
    }

    // Filter out text with multiple sentences (likely not user speech)
    if (text.split(/[.!?]/).length > 2) {
      return null;
    }

    // Filter out very short text (likely noise/misinterpretation)
    if (text.length < 2) {
      return null;
    }

    // Filter out single characters or meaningless sounds
    const meaninglessPatterns = [
      /^[а-я]{1}$/i, // Single letter
      /^[эээ|ммм|ааа|ууу|ооо]+$/i, // Only filler sounds
      /^[а-я]{1,2}$/i, // 1-2 letters (likely noise)
    ];

    for (const pattern of meaninglessPatterns) {
      if (pattern.test(text)) {
        return null;
      }
    }

    return text;
  };

  // Safari Interruption State
  const [safariSpeechDetectionCount, setSafariSpeechDetectionCount] = useState(0);
  const [lastSafariSpeechTime, setLastSafariSpeechTime] = useState(0);

  // --- Browser Detection Helpers ---
  const isSafari = useCallback(() => {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  }, []);

  const hasEchoProblems = useCallback(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    return /chrome|chromium|edg\/|opera|brave/.test(userAgent);
  }, []);

  const isIOSDevice = useCallback(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }, []);

  const isAndroidDevice = useCallback(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    return /android/.test(userAgent);
  }, []);

  const isMobileDevice = useCallback(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    addDebugLog(`[Mobile] Device: ${isMobile ? 'Mobile' : 'Desktop'} | iOS: ${isIOSDevice()} | Android: ${isAndroidDevice()} | Platform: ${navigator.platform}`);
    return isMobile;
  }, [isIOSDevice]);

  // Check microphone permissions (for modern browsers)
  const checkMicrophonePermissions = useCallback(async () => {
    if (!navigator.permissions || !navigator.permissions.query) {
      console.log("[Permissions] Permissions API not available");
      return;
    }

    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      console.log("[Permissions] Microphone permission status:", result.state);
      setMicrophonePermissionStatus(result.state);

      result.addEventListener('change', () => {
        console.log("[Permissions] Microphone permission changed to:", result.state);
        setMicrophonePermissionStatus(result.state);
      });
    } catch (error) {
      console.log("[Permissions] Could not query microphone permissions:", error);
    }
  }, []);

  // Mobile-specific transcription timer (sends audio to OpenAI every 5 seconds for smaller chunks)
  const startMobileTranscriptionTimer = useCallback(() => {
    if (mobileTranscriptionTimerRef.current) return;

    // Don't start timer if TTS is active
    if (isTTSActiveRef.current) {
      addDebugLog(`[Mobile] TTS active - not starting transcription timer`);
      return;
    }

    addDebugLog(`[Mobile] Starting transcription timer (3s intervals)`);

    mobileTranscriptionTimerRef.current = window.setInterval(async () => {
      addDebugLog(`[Timer] ⏰ Tick - checking conditions...`);

      // Skip if TTS is playing (echo prevention)
      if (isTTSActiveRef.current) {
        addDebugLog(`[Timer] ⏸️ TTS active - skipping to prevent echo`);
        return;
      }

      if (!mediaRecorderRef.current) {
        addDebugLog(`[Timer] ❌ No media recorder active`);
        return;
      }

      const isIOS = isIOSDevice();
      const isAndroid = isAndroidDevice();

      if (!isIOS && !isAndroid) {
        addDebugLog(`[Timer] ❌ Not a mobile device (iOS: ${isIOS}, Android: ${isAndroid})`);
        return;
      }

      addDebugLog(`[Timer] ✅ Conditions met (iOS: ${isIOS}, Android: ${isAndroid}, TTS: off), processing audio...`);

      try {
        addDebugLog(`[Timer] Stopping recording to get blob...`);
        const blob = await stopMediaRecording();
        addDebugLog(`[Timer] Got blob: ${blob?.size || 0} bytes`);

        // IMMEDIATELY restart recording - don't wait for OpenAI!
        if (audioStreamRef.current) {
          addDebugLog(`[Timer] 🔄 Restarting recording immediately...`);
          startMediaRecording(audioStreamRef.current);
        }

        // Minimum 5KB for meaningful audio
        if (blob && blob.size > 5000) {
          // Additional TTS check before sending to OpenAI
          if (isTTSActiveRef.current) {
            addDebugLog(`[Mobile] ❌ TTS active, skipping`);
            return;
          }

          // Check audio volume to filter out silence/background noise
          const volumeLevel = await checkAudioVolume(blob);
          addDebugLog(`[Mobile] Audio volume: ${volumeLevel.toFixed(2)}%`);

          // Only send if volume is above threshold (2% = user actually speaking)
          if (volumeLevel < 2.0) {
            addDebugLog(`[Mobile] ⚠️ Too quiet (${volumeLevel.toFixed(2)}%), skipping`);
            return;
          }

          addDebugLog(`[Mobile] ✅ Sending ${blob.size} bytes to OpenAI...`);

          // Send to OpenAI with timeout (don't block recording!)
          const transcriptionPromise = transcribeWithOpenAI(blob);
          
          // Add 8 second timeout
          const timeoutPromise = new Promise<null>((resolve) => {
            setTimeout(() => {
              addDebugLog(`[Mobile] ⏱️ OpenAI timeout (8s), skipping`);
              resolve(null);
            }, 8000);
          });

          // Race between transcription and timeout
          const text = await Promise.race([transcriptionPromise, timeoutPromise]);

          if (text && text.trim()) {
            // Filter out hallucinated responses
            const filteredText = filterHallucinatedText(text.trim());
            if (filteredText) {
              addDebugLog(`[Mobile] ✅ Transcribed: "${filteredText}"`);
              onTranscriptionComplete(filteredText, 'openai');
            } else {
              addDebugLog(`[Mobile] ⚠️ Filtered hallucination: "${text}"`);
            }
          } else if (text === null) {
            // Timeout occurred, already logged
          } else {
            addDebugLog(`[Mobile] ⚠️ Empty result`);
          }
        } else {
          addDebugLog(`[Mobile] Audio too short: ${blob?.size || 0} bytes`);
        }
      } catch (error) {
        addDebugLog(`[Mobile] Error: ${error}`);
        // Make sure recording restarts even on error
        if (audioStreamRef.current && !mediaRecorderRef.current) {
          addDebugLog(`[Timer] 🔄 Restarting after error...`);
          startMediaRecording(audioStreamRef.current);
        }
      }
    }, 3000); // Every 3 seconds - faster response after user speaks
  }, [isIOSDevice]);

  const stopMobileTranscriptionTimer = useCallback(() => {
    if (mobileTranscriptionTimerRef.current) {
      addDebugLog(`[Mobile] Stopping transcription timer`);
      clearInterval(mobileTranscriptionTimerRef.current);
      mobileTranscriptionTimerRef.current = null;
    }
  }, []);

  // Check audio volume level to filter out silence/noise
  const checkAudioVolume = async (audioBlob: Blob): Promise<number> => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Get average volume across all channels
      let sum = 0;
      let count = 0;
      
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < channelData.length; i++) {
          const abs = Math.abs(channelData[i]);
          sum += abs;
          count++;
        }
      }
      
      const averageVolume = sum / count;
      const volumePercent = averageVolume * 100; // Convert to percentage
      
      audioContext.close();
      return volumePercent;
    } catch (error) {
      addDebugLog(`[VolumeCheck] Error checking volume: ${error}`);
      return 0;
    }
  };

  // --- OpenAI Fallback Logic ---
  const transcribeWithOpenAI = async (audioBlob: Blob): Promise<string | null> => {
    try {
      addDebugLog(`[OpenAI] Starting transcription: ${audioBlob.size} bytes`);
      setTranscriptionStatus("Отправляю аудио в OpenAI...");

      const text = await transcriptionService?.transcribeAudio(audioBlob);
      
      if (text && text.trim()) {
        addDebugLog(`[OpenAI] ✅ Success: "${text.substring(0, 50)}..."`);
        return text.trim();
      }
      addDebugLog(`[OpenAI] ⚠️ Empty result`);
      return null;
    } catch (error: any) {
      addDebugLog(`[OpenAI] ❌ Failed: ${error.message}`);
      return null;
    } finally {
      setTranscriptionStatus("");
    }
  };

  // --- Media Recorder Logic ---
  const startMediaRecording = (stream: MediaStream) => {
    if (mediaRecorderRef.current) return;

    try {
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/wav'];
      const supportedTypes = mimeTypes.filter(type => MediaRecorder.isTypeSupported(type));

      addDebugLog(`[MediaRec] Supported types: ${supportedTypes.join(', ')}`);

      const selectedMimeType = supportedTypes[0];

      if (!selectedMimeType) {
        addDebugLog(`[MediaRec] ❌ No supported MediaRecorder format found`);
        return;
      }

      addDebugLog(`[MediaRec] Using format: ${selectedMimeType}`);

      const recorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
          addDebugLog(`[MediaRec] Recorded chunk: ${e.data.size} bytes`);
        }
      };

      recorder.onstart = () => {
        addDebugLog(`[MediaRec] ✅ Recording started (${selectedMimeType})`);
      };

      recorder.onstop = () => {
        addDebugLog(`[MediaRec] 🛑 Recording stopped`);
      };

      recorder.onerror = (event) => {
        addDebugLog(`[MediaRec] ❌ Recording error: ${event.error?.message || 'Unknown error'}`);
      };

      recorder.start(1000);
      addDebugLog(`[MediaRec] Starting recording with 1s chunks`);
    } catch (error: any) {
      addDebugLog(`[MediaRec] ❌ Start failed: ${error.message} | Name: ${error.name}`);
    }
  };

  const stopMediaRecording = async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        addDebugLog(`[MediaRec] No active recorder to stop`);
        resolve(null);
        return;
      }

      addDebugLog(`[MediaRec] Stopping recording...`);

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || 'audio/webm'
        });
        addDebugLog(`[MediaRec] Created blob: ${blob.size} bytes, type: ${blob.type}`);
        recordedChunksRef.current = [];
        mediaRecorderRef.current = null;
        resolve(blob);
      };

      mediaRecorderRef.current.stop();
    });
  };

  // --- Volume Monitoring (Interruption) ---
  const startVolumeMonitoring = async (stream: MediaStream) => {
    try {
      addDebugLog(`[Volume] Starting audio analysis...`);
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioAnalyserRef.current = analyser;
      addDebugLog(`[Volume] ✅ Audio context created`);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!recognitionActiveRef.current || !audioAnalyserRef.current) return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        // Safari Optimization Logic
        if (!hasEchoProblems()) {
          const isAssistantActive = isTTSActiveRef.current;
          const threshold = isAssistantActive ? SAFARI_VOICE_DETECTION_THRESHOLD + 15 : SAFARI_VOICE_DETECTION_THRESHOLD;
          const currentTime = Date.now();

          if (average > threshold) {
             setSafariSpeechDetectionCount(prev => {
               const newCount = prev + 1;
               if (newCount >= SAFARI_SPEECH_CONFIRMATION_FRAMES) {
                 if (currentTime - lastSafariSpeechTime > SAFARI_SPEECH_DEBOUNCE) {
                   addDebugLog(`[Volume] 🎤 Voice interruption (vol: ${average.toFixed(1)})`);
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

    // Track last processed text to prevent duplicates
  const lastProcessedTextRef = useRef<string>('');

  // --- Speech Recognition Setup ---
  const initializeRecognition = useCallback(async () => {
    console.log("[Transcription] 🚀 Starting recognition initialization...");

    // Check microphone permissions first
    await checkMicrophonePermissions();

    // Reset processed text on initialization
    lastProcessedTextRef.current = '';

    // Device Checks
    const ios = isIOSDevice();
    const mobile = isMobileDevice();
    setIsIOS(ios);

    // API Support Check
    const speechRecognitionSupport = !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
    const mediaDevicesSupport = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const mediaRecorderSupport = typeof MediaRecorder !== 'undefined';

    addDebugLog(`[API] SpeechRec: ${speechRecognitionSupport ? '✅' : '❌'} | MediaDev: ${mediaDevicesSupport ? '✅' : '❌'} | MediaRec: ${mediaRecorderSupport ? '✅' : '❌'}`);
    addDebugLog(`[Device] iOS: ${ios} | Mobile: ${mobile} | HTTPS: ${location.protocol === 'https:'} | Touch: ${navigator.maxTouchPoints > 0}`);

    // Check Support
    const hasSupport = speechRecognitionSupport;
    const android = isAndroidDevice();
    const shouldForceOpenAI = ios || android || !hasSupport;

    addDebugLog(`[Strategy] ${shouldForceOpenAI ? 'OpenAI Mode' : 'Browser Mode'} | Reason: ${ios ? 'iOS' : android ? 'Android' : (!hasSupport ? 'No Support' : 'Native')}`);

    setForceOpenAI(shouldForceOpenAI);

    if (shouldForceOpenAI) {
      setTranscriptionMode('openai');
    }

    // Get Microphone Stream
    try {
      const isMobile = isMobileDevice();
      const constraints = isMobile ? {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100 },
          channelCount: { ideal: 1 }
        }
      } : { audio: true };

      addDebugLog(`[Mic] Requesting access | Mobile: ${isMobile} | Constraints: ${JSON.stringify(constraints).substring(0, 50)}...`);

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      addDebugLog(`[Mic] ✅ Access granted | Tracks: ${stream.getTracks().length} | Audio: ${stream.getAudioTracks().length}`);

      // Log track details
      stream.getAudioTracks().forEach((track, index) => {
        console.log(`[Transcription] 🎵 Audio track ${index}:`, {
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          kind: track.kind,
          label: track.label,
          id: track.id.substring(0, 8) + '...'
        });
      });

      audioStreamRef.current = stream;
      setMicrophoneAccessGranted(true);

      // Start Fallback Recording & Monitoring
      startMediaRecording(stream);
      startVolumeMonitoring(stream);

      // For iOS and Android, start periodic transcription timer
      const android = isAndroidDevice();
      addDebugLog(`[Init] Checking mobile timer: iOS=${ios}, Android=${android}`);

      if (ios || android) {
        addDebugLog(`[Init] Starting mobile transcription timer`);
        startMobileTranscriptionTimer();
      } else {
        addDebugLog(`[Init] Not starting mobile timer (not iOS/Android)`);
      }

      // If forcing OpenAI, don't start browser recognition
      if (shouldForceOpenAI) return;

      // Setup Browser Recognition
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = "ru-RU";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        // Echo Prevention for Chrome
        if (hasEchoProblems() && isTTSActiveRef.current) {
          console.log("[Transcription] Ignoring input during TTS (Echo Prevention)");
          return;
        }

        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) finalTranscript += result[0].transcript;
          else interimTranscript += result[0].transcript;
        }

        if (finalTranscript.trim()) {
          console.log(`[Transcription] Final transcript: "${finalTranscript}"`);

          // Prevent duplicate processing - check if this is just an extension of previous text
          const trimmedText = finalTranscript.trim();
          const lastText = lastProcessedTextRef.current;

          // If new text starts with previous text and is significantly longer, it's a continuation
          // Allow small differences (up to 20% length difference) to account for corrections
          const isExtension = lastText &&
                             trimmedText.startsWith(lastText) &&
                             (trimmedText.length - lastText.length) > 5; // At least 5 characters added

          // If it's a minor correction (less than 20% difference), skip it
          const lengthDiff = Math.abs(trimmedText.length - (lastText?.length || 0));
          const maxLength = Math.max(trimmedText.length, lastText?.length || 0);
          const isMinorCorrection = lastText && (lengthDiff / maxLength) < 0.2 && lengthDiff < 50;

          if (isExtension) {
            console.log(`[Transcription] Text is extension of previous (${lastText?.length} -> ${trimmedText.length} chars), skipping`);
            lastProcessedTextRef.current = trimmedText;
            return;
          } else if (isMinorCorrection) {
            console.log(`[Transcription] Text is minor correction of previous (${lengthDiff} chars diff), skipping`);
            lastProcessedTextRef.current = trimmedText;
            return;
          } else if (lastProcessedTextRef.current === trimmedText) {
            console.log(`[Transcription] Skipping exact duplicate text: "${trimmedText}"`);
            return;
          }

          console.log(`[Transcription] Processing new final transcript`);
          lastProcessedTextRef.current = trimmedText;

          if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
          browserRetryCountRef.current = 0;
          console.log(`[Transcription] Calling onTranscriptionComplete with final transcript`);
          onTranscriptionComplete(trimmedText, 'browser');
        } else if (interimTranscript.trim()) {
           console.log(`[Transcription] Interim transcript: "${interimTranscript}"`);

           if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
           speechTimeoutRef.current = window.setTimeout(() => {
             if (hasEchoProblems() && isTTSActiveRef.current) {
               console.log(`[Transcription] Skipping interim due to TTS activity`);
               return;
             }

             // Check if we already processed this interim text as final or as a better version
             const trimmedInterim = interimTranscript.trim();
             const lastProcessed = lastProcessedTextRef.current;

             // Skip if interim is already contained in processed text
             if (lastProcessed && lastProcessed.includes(trimmedInterim) && lastProcessed.length > trimmedInterim.length) {
               console.log(`[Transcription] Skipping interim already contained in processed text: "${trimmedInterim}"`);
               return;
             }

             // Skip if interim is just a prefix of processed text (user continued speaking)
             if (lastProcessed && lastProcessed.startsWith(trimmedInterim) && lastProcessed.length > trimmedInterim.length) {
               console.log(`[Transcription] Skipping interim that became final: "${trimmedInterim}"`);
               return;
             }

             console.log(`[Transcription] Calling onTranscriptionComplete with interim transcript`);
             onTranscriptionComplete(trimmedInterim, 'browser');
           }, 1500);
        }
      };

      recognition.onspeechstart = () => {
        addDebugLog(`[Speech] 🎤 Speech started - resetting processed text`);
        lastProcessedTextRef.current = ''; // Reset for new speech
        onSpeechStart?.();
        // Safari Optimizations for Interruption
        if (!hasEchoProblems() && isTTSActiveRef.current) {
           const currentTime = Date.now();
           if (currentTime - lastSafariSpeechTime > SAFARI_SPEECH_DEBOUNCE) {
             addDebugLog(`[Speech] 🎤 Safari voice interruption`);
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

        // Switch to OpenAI Fallback
        if (browserRetryCountRef.current >= 3 || ['network', 'audio-capture'].includes(event.error)) {
           addDebugLog(`[Fallback] Switching to OpenAI (error: ${event.error})`);
           setTranscriptionMode('openai');

           const blob = await stopMediaRecording();
           addDebugLog(`[Fallback] Recorded blob: ${blob?.size || 0} bytes`);

           if (blob && blob.size > 1000) {
             const text = await transcribeWithOpenAI(blob);
             if (text) {
               addDebugLog(`[Fallback] ✅ Transcribed: "${text}"`);
               onTranscriptionComplete(text, 'openai');
             } else {
               addDebugLog(`[Fallback] ❌ Transcription failed`);
               onError?.("Не удалось распознать речь (OpenAI)");
             }
           } else {
             addDebugLog(`[Fallback] ⚠️ Blob too small: ${blob?.size || 0} bytes`);
           }
           // Resume browser mode attempt later
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

      // More specific error messages for mobile
      let errorMessage = "Ошибка доступа к микрофону";
      if (error.name === 'NotAllowedError') {
        errorMessage = "Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.";
      } else if (error.name === 'NotFoundError') {
        errorMessage = "Микрофон не найден. Проверьте подключение микрофона.";
      } else if (error.name === 'NotReadableError') {
        errorMessage = "Микрофон занят другим приложением.";
      } else if (error.name === 'OverconstrainedError') {
        errorMessage = "Настройки микрофона не поддерживаются устройством.";
      } else if (error.name === 'SecurityError') {
        errorMessage = "Требуется HTTPS для доступа к микрофону.";
      } else if (error.name === 'AbortError') {
        errorMessage = "Доступ к микрофону был прерван.";
      }

      console.error(`[Transcription] 📱 Mobile-specific error analysis:`, {
        errorType: error.name,
        isMobile: isMobileDevice(),
        isIOS: isIOSDevice(),
        httpsRequired: !window.isSecureContext,
        suggestedAction: isIOSDevice() ?
          "На iOS: Убедитесь что Safari имеет доступ к микрофону в настройках" :
          "На Android: Проверьте разрешения приложения и браузера"
      });

      onError?.(errorMessage);
      setMicrophoneAccessGranted(false);
    }
  }, []); // Dependencies intentionally empty for init

  // Cleanup
  const cleanup = useCallback(() => {
    lastProcessedTextRef.current = ''; // Reset processed text
    recognitionActiveRef.current = false;
    if (recognitionRef.current) try { recognitionRef.current.stop(); } catch(e){}
    stopVolumeMonitoring();
    stopMobileTranscriptionTimer(); // Stop mobile transcription timer
    stopMediaRecording(); // Just stop, don't return blob
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
  }, []);

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
      try { recognitionRef.current?.start(); } catch(e){}
    }
  };
};

