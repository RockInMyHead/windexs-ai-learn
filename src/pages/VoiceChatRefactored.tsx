/**
 * VoiceChat Component - Refactored with State Machine
 * Clean, maintainable voice chat implementation
 */

import Navigation from "@/components/Navigation";
import { useParams, useNavigate } from "react-router-dom";
import { getCourseDisplayName } from "@/lib/utils";
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useVoiceChatState } from "@/hooks/useVoiceChatState";
import { monitorLLMRequest, monitorLLMResponse, isSuspiciousMessage, generateSafeAlternative } from "@/utils/llmMonitoring";

// Error Handling
import {
  CircuitBreaker,
  RetryManager,
  featureManager,
  setupGlobalErrorHandling,
  createError,
  getUserFriendlyMessage,
  ErrorCodes
} from "@/utils/errorHandling";

// Browser Compatibility
import {
  UniversalSpeechRecognition,
  browserDetector,
  webAudioPolyfill,
  checkBrowserCompatibility
} from "@/utils/browserCompatibility";

// Echo Detection
import { echoDetectorV2 } from "@/utils/echoDetection";

// WebRTC Components
import { useWebRTC } from "@/webrtc";
import VideoCall from "@/webrtc/components/VideoCall";
import DeviceSelector from "@/webrtc/components/DeviceSelector";

// API and Utils
const API_URL = import.meta.env.VITE_API_URL || 'https://teacher.windexs.ru/api';

// Voice Chat Model
const VOICE_CHAT_LLM_MODEL = 'gpt-4o'; // Updated to supported model

// Safari detection utility
const isSafari = (): boolean => {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium');
};

const VoiceChatRefactored = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { toast } = useToast();

  // State management
  const {
    state,
    context,
    startListening,
    speechDetected,
    speechEnded,
    transcriptReceived,
    responseGenerated,
    startSpeaking,
    speechCompleted,
    setError,
    toggleMic,
    toggleSound,
    startCall,
    endCall,
    reset,
    canStartListening,
    updateContext,
    onEvent
  } = useVoiceChatState();

  // User profile state
  const [userProfile, setUserProfile] = useState<any>(null);

  // Feature support state
  const [degradationLevel, setDegradationLevel] = useState(featureManager.getDegradationLevel());
  const [recommendedSettings, setRecommendedSettings] = useState(featureManager.getRecommendedSettings());

  // Refs for audio components
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Error handling components
  const circuitBreakerRef = useRef(new CircuitBreaker({
    failureThreshold: 5,
    recoveryTimeout: 60000,
    name: 'voice-chat-api'
  }));

  const retryManagerRef = useRef(RetryManager.forAPI({
    maxRetries: 3,
    baseDelay: 1000
  }));

  // WebRTC state
  const {
    isConnected: webrtcConnected,
    activeCalls,
    localStream,
    remoteStreams,
    availableDevices,
    startCall: startWebRTCCall,
    hangupCall: hangupWebRTCCall,
    toggleMute: toggleWebRTCMute,
    toggleVideo: toggleWebRTCVideo,
    switchDevice,
    refreshDevices
  } = useWebRTC('current-user'); // TODO: Use actual user ID

  // Initialize component and error handling
  useEffect(() => {
    // Setup global error handling
    setupGlobalErrorHandling();

    // Initialize echo detector
    echoDetectorV2.initialize().catch(error => {
      console.error('Failed to initialize echo detector:', error);
    });

    // Initialize component
    initializeComponent();
  }, []);

  // State machine event handlers
  useEffect(() => {
    const unsubscribe = onEvent('start_listening', handleStartListening);
    const unsubscribe2 = onEvent('speech_detected', handleSpeechDetected);
    const unsubscribe3 = onEvent('transcript_received', handleTranscriptReceived);
    const unsubscribe4 = onEvent('response_generated', handleResponseGenerated);
    const unsubscribe5 = onEvent('start_speaking', handleStartSpeaking);
    const unsubscribe6 = onEvent('speech_completed', handleSpeechCompleted);
    const unsubscribe7 = onEvent('error_occurred', handleErrorOccurred);

    return () => {
      unsubscribe();
      unsubscribe2();
      unsubscribe3();
      unsubscribe4();
      unsubscribe5();
      unsubscribe6();
      unsubscribe7();
    };
  }, []);

  // Initialize speech recognition with browser compatibility
  useEffect(() => {
    initializeUniversalSpeechRecognition();
  }, []);

  // Component initialization
  const initializeComponent = async () => {
    try {
      // Load user profile
      await loadUserProfile();

      // Initialize WebRTC
      await refreshDevices();

      console.log('✅ VoiceChat component initialized');
    } catch (error) {
      console.error('❌ Failed to initialize VoiceChat:', error);
      handleError(error as Error);
    }
  };

  // Load user profile
  const loadUserProfile = async () => {
    try {
      const response = await fetch(`${API_URL}/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const profile = await response.json();
        setUserProfile(profile);
        updateContext({ userProfile: profile });
      }
    } catch (error) {
      console.warn('Failed to load user profile:', error);
    }
  };

  // Initialize universal speech recognition
  const initializeUniversalSpeechRecognition = useCallback(() => {
    try {
      // Check browser compatibility
      const compatibility = checkBrowserCompatibility();
      if (!compatibility.supported) {
        console.warn('⚠️ Browser compatibility issues:', compatibility.issues);
        compatibility.recommendations.forEach(rec => console.warn('💡', rec));
      }

      // Get browser-specific configuration
      const browserConfig = browserDetector.getOptimizations();

      // Create universal speech recognition
      const recognition = new UniversalSpeechRecognition(
        {
          lang: 'ru-RU',
          ...browserConfig.speechRecognition
        },
        {
          onStart: () => {
            console.log('🎙️ Universal speech recognition started');
            updateContext({ isRecording: true });
          },
          onResult: (result) => {
            if (result.isFinal) {
              const transcript = result.transcript.trim();
              console.log('👤 Final transcript:', transcript);
              handleTranscriptReceived(transcript);
            } else {
              updateContext({ transcript: result.transcript });
            }
          },
          onError: (error) => {
            console.error('🎙️ Universal speech recognition error:', error);
            handleError(error);
          },
          onEnd: () => {
            console.log('🎙️ Universal speech recognition ended');
            updateContext({ isRecording: false });
          }
        }
      );

      speechRecognitionRef.current = recognition as any;

      // Check if fallback mode is used
      if (recognition.isFallbackMode()) {
        updateContext({ useFallbackTranscription: true });
        console.log('⚠️ Using fallback speech recognition (Whisper API)');
      } else {
        updateContext({ useFallbackTranscription: false });
        console.log('✅ Native speech recognition initialized');
      }

    } catch (error) {
      console.error('❌ Failed to initialize universal speech recognition:', error);
      updateContext({ useFallbackTranscription: true });
      handleError(error as Error);
    }
  }, [transcriptReceived, updateContext]);

  // Initialize media recording (fallback)
  const initializeMediaRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      updateContext({ mediaStream: stream });

      const mediaRecorder = new MediaRecorder(stream);
      updateContext({ mediaRecorder });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          updateContext({
            audioChunks: [...(context.audioChunks || []), event.data]
          });
        }
      };

      mediaRecorder.onstop = async () => {
        await processRecordedAudio();
      };

      console.log('✅ Media recording initialized');
    } catch (error) {
      console.error('❌ Failed to initialize media recording:', error);
      handleError(error as Error);
    }
  }, [context.audioChunks, updateContext]);

  // Process recorded audio
  const processRecordedAudio = async () => {
    if (!context.audioChunks?.length) return;

    try {
      const audioBlob = new Blob(context.audioChunks, { type: 'audio/webm' });

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch(`${API_URL}/transcribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        transcriptReceived(result.transcript || '');
      } else {
        throw new Error('Transcription failed');
      }

      // Clear chunks
      updateContext({ audioChunks: [] });

    } catch (error) {
      console.error('❌ Audio processing error:', error);
      handleError(error as Error);
    }
  };

  // Event handlers
  const handleStartListening = useCallback(async () => {
    if (!speechRecognitionRef.current) return;

    try {
      await speechRecognitionRef.current.start();
    } catch (error) {
      console.error('Error starting universal speech recognition:', error);
      handleError(error as Error);
    }
  }, []);

  const handleSpeechDetected = useCallback(() => {
    // Speech detection logic
    console.log('🎤 Speech detected');
  }, []);

  const handleTranscriptReceived = useCallback(async (transcript: string, audioBlob?: Blob) => {
    if (!transcript.trim()) return;

    try {
      // Check for echo using advanced detection
      let audioBuffer: AudioBuffer | undefined;
      if (audioBlob) {
        audioBuffer = await blobToAudioBuffer(audioBlob);
      }

      const echoResult = await echoDetectorV2.detectEcho(transcript, audioBuffer);

      if (echoResult.isEcho) {
        console.log(`🔇 Echo detected (${(echoResult.confidence * 100).toFixed(1)}% confidence), ignoring: "${transcript}"`);
        return;
      }

      console.log(`✅ Valid speech detected: "${transcript}"`);

      // Clean up old echo profiles
      echoDetectorV2.cleanupOldProfiles();

      // Send to LLM
      const llmResponse = await sendToLLM(transcript);

      // Start TTS
      await speakText(llmResponse);

    } catch (error) {
      console.error('Error processing transcript:', error);
      handleError(error as Error);
    }
  }, []);

  const handleResponseGenerated = useCallback(async (response: string) => {
    await speakText(response);
  }, []);

  const handleStartSpeaking = useCallback((text: string) => {
    // TTS start logic
    console.log('🔊 Starting TTS for:', text.substring(0, 50) + '...');
  }, []);

  const handleSpeechCompleted = useCallback(() => {
    console.log('✅ TTS completed');

    // Auto-start listening again if not in call
    if (canStartListening && !context.activeCallId) {
      setTimeout(() => startListening(), 500);
    }
  }, [canStartListening, context.activeCallId, startListening]);

  const handleErrorOccurred = useCallback((error: any) => {
    console.error('Voice chat error:', error);
    toast({
      title: "Ошибка голосового чата",
      description: error.message || "Произошла неизвестная ошибка",
      variant: "destructive"
    });
  }, [toast]);

  // LLM communication with resilience
  const sendToLLM = async (message: string): Promise<string> => {
    return circuitBreakerRef.current.execute(async () => {
      return retryManagerRef.current.executeWithRetry(async () => {
        const startTime = Date.now();
        const suspicious = isSuspiciousMessage(message);

        if (suspicious) {
          const safeAlternative = generateSafeAlternative(message);
          if (safeAlternative) {
            message = safeAlternative;
          }
        }

        monitorLLMRequest(message, context.userProfile);

        const courseIdNum = parseInt(courseId || '1');

        const response = await fetch(`${API_URL}/chat/${courseIdNum}/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            content: message,
            messageType: 'voice'
          }),
          signal: AbortSignal.timeout(30000) // 30 second timeout
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw createError(
            ErrorCodes.API_ERROR,
            `LLM API error: ${response.status} - ${errorText}`,
            response.status >= 500 // Retry on server errors
          );
        }

        const data = await response.json();
        const responseTime = Date.now() - startTime;

        monitorLLMResponse(data.message, responseTime, context.userProfile);

        return data.message || 'Извините, я не смог сформулировать ответ.';

      }, {
        retryCondition: (error) => {
          // Retry on network errors and server errors
          return error.code === ErrorCodes.NETWORK_ERROR ||
                 error.code === ErrorCodes.API_ERROR ||
                 error.message.includes('fetch');
        }
      });
    });
  };

  // TTS functionality with resilience and echo profiling
  const speakText = async (text: string): Promise<void> => {
    if (!text || !context.isSoundEnabled) return;

    try {
      const audioBlob = await retryManagerRef.current.executeWithRetry(async () => {
        const response = await fetch(`${API_URL}/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            text,
            voice: 'nova',
            model: 'tts-1-hd',
            speed: 0.95
          }),
          signal: AbortSignal.timeout(20000) // 20 second timeout for TTS
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw createError(
            ErrorCodes.API_ERROR,
            `TTS API error: ${response.status} - ${errorText}`,
            response.status >= 500
          );
        }

        return await response.blob();
      });

      // Convert blob to AudioBuffer for echo profiling
      const audioBuffer = await this.blobToAudioBuffer(audioBlob);

      // Profile TTS audio for echo detection
      await echoDetectorV2.profileTTSAudio(text, audioBuffer);

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      startSpeaking(text, audioBuffer.duration * 1000); // Actual duration

      return new Promise((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          speechCompleted();
          resolve();
        };

        audio.onerror = (error) => {
          URL.revokeObjectURL(audioUrl);
          reject(createError(
            ErrorCodes.DEVICE_ERROR,
            'Audio playback failed',
            false,
            error
          ));
        };

        audio.play().catch(error => {
          reject(createError(
            ErrorCodes.DEVICE_ERROR,
            'Audio playback not allowed',
            false,
            error
          ));
        });
      });

    } catch (error: any) {
      console.error('TTS error:', error);
      handleError(error);
    }
  };

  // Helper method to convert Blob to AudioBuffer
  const blobToAudioBuffer = async (blob: Blob): Promise<AudioBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          resolve(audioBuffer);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read audio blob'));
      reader.readAsArrayBuffer(blob);
    });
  };

  // Error handler with user-friendly messages
  const handleError = (error: any) => {
    console.error('Voice chat error:', error);

    let errorCode = ErrorCodes.UNKNOWN_ERROR;
    let recoverable = true;

    // Determine error type
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      errorCode = ErrorCodes.TIMEOUT_ERROR;
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      errorCode = ErrorCodes.NETWORK_ERROR;
    } else if (error.message.includes('permission') || error.message.includes('denied')) {
      errorCode = ErrorCodes.PERMISSION_DENIED;
      recoverable = false;
    } else if (error.message.includes('device') || error.message.includes('media')) {
      errorCode = ErrorCodes.DEVICE_ERROR;
    }

    const appError = createError(
      errorCode,
      error.message || 'Unknown error occurred',
      recoverable,
      error
    );

    setError(appError);

    // Show user-friendly message
    toast({
      title: "Ошибка голосового чата",
      description: getUserFriendlyMessage(appError),
      variant: "destructive"
    });
  };

  // UI event handlers
  const handleMicToggle = () => {
    toggleMic(!context.isMicEnabled);
  };

  const handleSoundToggle = () => {
    toggleSound(!context.isSoundEnabled);
  };

  const handleStartCall = async (peerId: string) => {
    try {
      const callId = await startWebRTCCall(peerId);
      startCall(callId, ['current-user', peerId]);
    } catch (error) {
      handleError(error as Error);
    }
  };

  const handleEndCall = async () => {
    if (context.activeCallId) {
      try {
        await hangupWebRTCCall(context.activeCallId);
        endCall();
      } catch (error) {
        handleError(error as Error);
      }
    }
  };

  // Get current course name
  const getCourseName = (): string => {
    return courseId ? getCourseDisplayName(courseId) : 'Общий чат';
  };

  // Render
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="absolute top-20 left-0 right-0 z-40 flex justify-center px-4">
          <div className="bg-background/80 backdrop-blur-sm px-6 py-2 rounded-full border border-border/50 shadow-sm">
            <span className="text-foreground/70 text-sm md:text-base font-medium">
              {getCourseName()}
            </span>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto pt-24">
          {/* Status Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Голосовой чат</span>
                <Badge variant={state === 'error' ? 'destructive' : 'default'}>
                  {state === 'idle' && 'Готов'}
                  {state === 'listening' && 'Слушаю...'}
                  {state === 'processing_speech' && 'Обрабатываю...'}
                  {state === 'generating_response' && 'Генерирую ответ...'}
                  {state === 'speaking' && 'Говорю...'}
                  {state === 'error' && 'Ошибка'}
                  {state === 'call_active' && 'В звонке'}
                </Badge>
              </CardTitle>
            </CardHeader>

            <CardContent>
              {/* Feature Support Warning */}
              {degradationLevel !== 'full' && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    ⚠️ Некоторые функции ограничены для лучшей производительности.
                    Уровень поддержки: <strong>{degradationLevel}</strong>
                  </p>
                </div>
              )}

              {/* Browser Compatibility Info */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-800">
                      🌐 Браузер: {browserDetector.getBrowserInfo().name} {browserDetector.getBrowserInfo().version}
                    </p>
                    <p className="text-xs text-blue-600">
                      Режим распознавания: {context.useFallbackTranscription ? 'Whisper API' : 'Нативный'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-blue-600">
                      Совместимость: {browserDetector.getPerformanceScore()}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Transcript Display */}
              {context.transcript && (
                <div className="mb-4 p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Вы сказали:</p>
                  <p className="text-foreground">{context.transcript}</p>
                </div>
              )}

              {/* Controls */}
              <div className="flex items-center justify-center space-x-4">
                {/* Mic Toggle */}
                <Button
                  variant={context.isMicEnabled ? "default" : "destructive"}
                  size="lg"
                  onClick={handleMicToggle}
                  disabled={state === 'error'}
                  className="rounded-full w-14 h-14"
                >
                  {context.isMicEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </Button>

                {/* Sound Toggle */}
                <Button
                  variant={context.isSoundEnabled ? "default" : "secondary"}
                  size="lg"
                  onClick={handleSoundToggle}
                  disabled={state === 'error'}
                  className="rounded-full w-14 h-14"
                >
                  {context.isSoundEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                </Button>

                {/* Start Listening */}
                <Button
                  variant="default"
                  size="lg"
                  onClick={startListening}
                  disabled={!canStartListening || state === 'error'}
                  className="rounded-full w-16 h-16"
                >
                  {state === 'listening' ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : (
                    <Mic className="w-8 h-8" />
                  )}
                </Button>

                {/* Call Controls */}
                {!context.activeCallId ? (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => handleStartCall('peer-user')} // TODO: Real peer selection
                    disabled={!webrtcConnected}
                    className="rounded-full w-14 h-14"
                  >
                    <Phone className="w-6 h-6" />
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="lg"
                    onClick={handleEndCall}
                    className="rounded-full w-14 h-14"
                  >
                    <PhoneOff className="w-6 h-6" />
                  </Button>
                )}

                {/* Device Settings */}
                <DeviceSelector
                  availableDevices={availableDevices}
                  onDeviceChange={(deviceId, kind) => {
                    if (context.activeCallId) {
                      switchDevice(context.activeCallId, deviceId, kind);
                    }
                  }}
                  currentAudioDevice="" // TODO: Track current devices
                  currentVideoDevice=""
                  callId={context.activeCallId || undefined}
                  disabled={!context.activeCallId}
                />
              </div>
            </CardContent>
          </Card>

          {/* Video Call Component */}
          {context.activeCallId && (
            <VideoCall
              callId={context.activeCallId}
              onHangup={handleEndCall}
              onToggleMute={(muted) => toggleWebRTCMute(context.activeCallId!, muted)}
              onToggleVideo={(enabled) => toggleWebRTCVideo(context.activeCallId!, enabled)}
              className="mb-6"
            />
          )}

          {/* Debug Info */}
          {process.env.NODE_ENV === 'development' && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-sm">Debug Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs space-y-1">
                  <div>State: {state}</div>
                  <div>Recording: {context.isRecording ? 'Yes' : 'No'}</div>
                  <div>Transcribing: {context.isTranscribing ? 'Yes' : 'No'}</div>
                  <div>Generating: {context.isGeneratingResponse ? 'Yes' : 'No'}</div>
                  <div>Speaking: {context.isSpeaking ? 'Yes' : 'No'}</div>
                  <div>Call ID: {context.activeCallId || 'None'}</div>
                  <div>WebRTC Connected: {webrtcConnected ? 'Yes' : 'No'}</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceChatRefactored;
