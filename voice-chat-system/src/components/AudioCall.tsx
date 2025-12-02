import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Phone, PhoneOff, Mic, MicOff, Square, Bug, X } from "lucide-react";
import Navigation from "@/components/Navigation";
import { userApi, audioCallApi, subscriptionApi } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

// Hooks
import { useTTS } from "@/hooks/useTTS";
import { useLLM } from "@/hooks/useLLM";
import { useTranscription } from "@/hooks/useTranscription";

// Debug Logs Component
const DebugLogs = ({ logs, isVisible, onToggle, onClear }: {
  logs: string[];
  isVisible: boolean;
  onToggle: () => void;
  onClear: () => void;
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-96 bg-black/90 text-green-400 font-mono text-xs rounded-lg border border-gray-600 overflow-hidden z-50">
      <div className="flex items-center justify-between p-2 bg-gray-800 border-b border-gray-600">
        <span className="flex items-center gap-2">
          <Bug className="w-4 h-4" />
          Debug Logs
        </span>
        <div className="flex gap-1">
          <Button
            onClick={onClear}
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs text-gray-400 hover:text-white"
          >
            Clear
          </Button>
          <Button
            onClick={onToggle}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
      <div className="p-2 max-h-80 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="text-gray-500 italic">No logs yet...</div>
        ) : (
          logs.slice(-50).map((log, index) => (
            <div key={index} className="mb-1 leading-tight">
              <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span> {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const AudioCall = () => {
  const { user: authUser } = useAuth();
  const navigate = useNavigate();
  
  // UI State
  const [isCallActive, setIsCallActive] = useState(false);
  const [isInitializingCall, setIsInitializingCall] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  // Debug Logs State
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  
  // Data State
  const [user, setUser] = useState<any | null>(null);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<any | null>(null);
  
  // Audio/Video State
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const callTimerRef = useRef<number | null>(null);

  // Debug logging functions
  const addDebugLog = useCallback((message: string) => {
    console.log(message); // Keep console logging
    setDebugLogs(prev => [...prev, message]);
  }, []);

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);

  const toggleDebugLogs = useCallback(() => {
    setShowDebugLogs(prev => !prev);
  }, []);
  
  // --- Hooks Initialization ---
  
  // 1. TTS Service (Speech Synthesis)
  const {
    speak,
    stop: stopTTS,
    resetDeduplication,
    isPlaying: isTTSPlaying,
    isSynthesizing: isTTSSynthesizing,
    isPlayingRef: isTTSPlayingRef, // Needed for transcription hook ref
    isSynthesizingRef: isTTSSynthesizingRef // Needed for logic
  } = useTTS({
    onPlaybackStatusChange: (isActive) => {
      // Reset TTS deduplication when TTS stops
      if (!isActive) {
        console.log('[TTS] TTS session ended, ready for new text');
      }
    }
  });

  // Combined ref for "Is Assistant Speaking" to pass to transcription hook
  // We use a manual ref sync or just pass a getter. 
  // `useTranscription` needs a ref to know if it should ignore input for echo cancellation.
  const isAssistantSpeakingRef = useRef(false);
  
  useEffect(() => {
    isAssistantSpeakingRef.current = isTTSPlaying || isTTSSynthesizing;
    
    // Update video based on TTS state
    if (videoRef.current) {
      if (isAssistantSpeakingRef.current) {
        videoRef.current.play().catch(() => {});
    } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isTTSPlaying, isTTSSynthesizing]);

  // 2. LLM Service (Logic)
  const {
    processUserMessage,
    loadUserProfile,
    updateUserProfile,
    addToConversation,
    isProcessing: isAIProcessing
  } = useLLM({
    userId: user?.id,
    callId: currentCallId,
    onResponseGenerated: async (text) => {
      await speak(text);
    },
    onError: (err) => setError(err)
  });

  // 3. Transcription Service (Speech Recognition)
  const {
    initializeRecognition,
    cleanup: cleanupRecognition,
    transcriptionStatus,
    microphoneAccessGranted,
    microphonePermissionStatus,
    forceOpenAI,
    isIOS,
    stopRecognition,
    startRecognition
  } = useTranscription({
    isTTSActiveRef: isAssistantSpeakingRef,
    addDebugLog,
    onTranscriptionComplete: async (text, source) => {
      const transcribeId = Date.now();
      console.log(`[AudioCall] onTranscriptionComplete (ID: ${transcribeId}) called with: "${text}" from ${source}`);
      if (!text) return;

      // Stop TTS if user interrupted (handled by hook, but good to ensure)
      if (source !== 'manual') stopTTS();

      // Reset TTS deduplication for new user input
      resetDeduplication();

      console.log(`[AudioCall] About to call processUserMessage (ID: ${transcribeId})`);
      await processUserMessage(text);
      console.log(`[AudioCall] processUserMessage completed (ID: ${transcribeId})`);
    },
    onInterruption: () => {
      stopTTS();
    },
    onSpeechStart: () => {
       // Optional: UI indication
    },
    onError: (err) => setError(err)
  });

  // --- Lifecycle & Logic ---

  const initializeUser = useCallback(async () => {
    try {
      const email = authUser?.email ?? 'user@zenmindmate.com';
      const name = authUser?.name ?? authUser?.email ?? 'Пользователь';
      const userData = await userApi.getOrCreateUser(email, name);
      setUser(userData);
      
      const info = await subscriptionApi.getAudioSessionInfo(userData.id);
      setSubscriptionInfo(info);
    } catch (err) {
      console.error('Error initializing user:', err);
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    initializeUser();
  }, [initializeUser]);

  const startCall = async () => {
    if (!user || isCallActive) return;
    setIsInitializingCall(true);
    setError(null);

    try {
      // Check Subscription
      const accessCheck = await subscriptionApi.checkAudioAccess(user.id);
      if (!accessCheck.hasAccess) {
        if (accessCheck.reason === 'no_sessions_left') {
          navigate('/subscription');
          return;
        }
        throw new Error("Доступ к аудио сессиям ограничен.");
      }

      // Create Call Session
      await subscriptionApi.useAudioSession(user.id);
      const call = await audioCallApi.createAudioCall(user.id);
      setCurrentCallId(call.id);
      
      // Load User Profile
      await loadUserProfile();

      // Increment session count
      await updateUserProfile("", ""); // Empty strings to just increment counter

      // Initialize Audio/Recognition
      await initializeRecognition();
      
      // UI Updates
      setIsCallActive(true);
      setCallDuration(0);
      
      // Initial Greeting
      setTimeout(async () => {
         const greeting = "Здравствуйте. Я Марк, психолог. Рад вас слышать. Что вас беспокоит?";
         addToConversation('assistant', greeting);
         await speak(greeting);
      }, 1000);

      // Start Timer
      callTimerRef.current = window.setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error("Start call error:", err);
      setError(err.message || "Не удалось начать звонок");
      cleanupRecognition();
      setCurrentCallId(null);
                } finally {
      setIsInitializingCall(false);
    }
  };

  const endCall = async () => {
    stopTTS();
    cleanupRecognition();
    
    if (currentCallId) {
      try {
        await audioCallApi.endAudioCall(currentCallId, callDuration);
        if (subscriptionInfo?.plan === 'premium') {
            await subscriptionApi.recordAudioSession(user.id);
        }
      } catch (err) {
        console.error("Error ending call:", err);
      }
    }

    // Update user profile with final session data
    try {
      await updateUserProfile("", ""); // Empty strings to trigger profile save
    } catch (err) {
      console.error("Error updating user profile:", err);
    }

      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
    }

      setIsCallActive(false);
      setCallDuration(0);
      setCurrentCallId(null);
    setError(null);
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      startRecognition();
    } else {
      setIsMuted(true);
      stopRecognition();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // --- Render ---

  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());

  return (
    <div className="h-screen overflow-hidden bg-calm-gradient flex flex-col">
      <Navigation />
      <div className="flex-1 overflow-hidden px-4 pt-20 pb-4 flex items-center">
        <div className="container mx-auto max-w-2xl">
          <div className="text-center mb-6 animate-fade-in">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">Аудио звонок</h1>
            <p className="text-muted-foreground">Голосовая сессия с ИИ-психологом</p>
          </div>

          <Card className="bg-card-gradient border-2 border-border shadow-strong p-6 md:p-8 text-center animate-scale-in">
            {isInitializingCall ? (
              <div className="space-y-8">
                 <div className="w-[180px] h-[180px] sm:w-[260px] sm:h-[260px] mx-auto rounded-full overflow-hidden shadow-strong">
                  <video ref={videoRef} src="/Untitled Video.mp4" className="w-full h-full object-cover pointer-events-none" muted loop playsInline />
                </div>
                <h2 className="text-2xl font-bold">Инициализация...</h2>
              </div>
            ) : !isCallActive ? (
              <div className="space-y-8">
                <div className="w-[180px] h-[180px] sm:w-[260px] sm:h-[260px] mx-auto rounded-full overflow-hidden shadow-strong">
                  <video ref={videoRef} src="/Untitled Video.mp4" className="w-full h-full object-cover pointer-events-none" muted loop playsInline />
                </div>

                <div>
                  <h2 className="text-2xl font-bold mb-2">Начать звонок</h2>
                  <p className="text-muted-foreground">Нажмите кнопку ниже, чтобы начать</p>
                  
                  {isMobile && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-800">📱 Мобильное устройство обнаружено</p>
                      {isIOS && <p className="text-xs text-blue-600 mt-1">Оптимизировано для iOS</p>}
                    </div>
                  )}

                  {subscriptionInfo && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Осталось сессий: {subscriptionInfo.remaining}/{subscriptionInfo.limit}
                    </p>
                  )}
                </div>

                <Button
                  onClick={startCall}
                  size="lg"
                  className="bg-hero-gradient text-white hover:shadow-lg shadow-medium text-lg px-12 py-6"
                  disabled={loading}
                >
                  <Phone className="w-6 h-6 mr-2" />
                  {loading ? "Загрузка..." : "Позвонить"}
                </Button>

                {error && <p className="text-sm text-destructive mt-4">{error}</p>}
              </div>
            ) : (
              <div className="space-y-8">
                 <div className="w-[220px] h-[220px] sm:w-[320px] sm:h-[320px] mx-auto rounded-full overflow-hidden shadow-strong">
                  <video ref={videoRef} src="/Untitled Video.mp4" className="w-full h-full object-cover pointer-events-none" muted loop playsInline />
                </div>

                <div>
                  <h2 className="text-2xl font-bold mb-2">Звонок идет</h2>
                  <div className="text-lg font-medium text-primary">{formatDuration(callDuration)}</div>
                </div>

                <div className="flex justify-center gap-4">
                  <Button
                    onClick={toggleMute}
                    size="lg"
                    variant={isMuted ? "destructive" : "outline"}
                    className="rounded-full w-16 h-16 p-0"
                  >
                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </Button>

                  {(isTTSPlaying || isTTSSynthesizing) && (
                    <Button
                      onClick={stopTTS}
                      size="lg"
                      variant="destructive"
                      className="rounded-full w-16 h-16 p-0 animate-pulse"
                      title="Прервать"
                    >
                      <Square className="w-6 h-6" />
                    </Button>
                  )}

                  <Button
                    onClick={endCall}
                    size="lg"
                    variant="destructive"
                    className="rounded-full w-16 h-16 p-0 shadow-medium"
                  >
                    <PhoneOff className="w-6 h-6" />
                  </Button>
                </div>

                {/* Debug Logs Toggle */}
                <div className="mt-4 flex justify-center">
                      <Button
                    onClick={toggleDebugLogs}
                        size="sm"
                        variant="outline"
                    className="flex items-center gap-2 text-xs"
                      >
                    <Bug className="w-3 h-3" />
                    {showDebugLogs ? 'Скрыть логи' : 'Показать логи'}
                      </Button>
                </div>

                {/* Mobile/No-Mic Text Fallback */}
                {!microphoneAccessGranted && (
                   <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                     <h3 className="text-sm font-medium mb-3 text-red-800">
                       🚫 Проблема с микрофоном
                     </h3>
                     <p className="text-sm text-red-600 mb-3">
                       {forceOpenAI ?
                         "Используется текстовый режим (OpenAI)" :
                         "Микрофон недоступен. Проверьте разрешения."}
                     </p>
                     <div className="text-xs text-gray-500 mb-3 space-y-1">
                       <div>📱 Устройство: iOS={isIOS ? 'Да' : 'Нет'} | Мобильный={isMobile ? 'Да' : 'Нет'}</div>
                       <div>🎯 Режим: OpenAI={forceOpenAI ? 'Включен' : 'Отключен'}</div>
                       <div>🔐 Разрешения: {microphonePermissionStatus}</div>
                       <div>🔍 Проверьте консоль (F12) для детальных логов</div>
                     </div>
                     {forceOpenAI && (
                      <Button
                        onClick={() => {
                           const msg = prompt("Сообщение:");
                           if(msg) processUserMessage(msg);
                         }}
                        variant="outline"
                        size="sm"
                      >
                         Отправить сообщение
                      </Button>
                    )}
                  </div>
                )}

                {transcriptionStatus && (
                  <p className="text-sm text-primary/80 animate-pulse">{transcriptionStatus}</p>
                )}
                
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Debug Logs Panel */}
      <DebugLogs
        logs={debugLogs}
        isVisible={showDebugLogs}
        onToggle={toggleDebugLogs}
        onClear={clearDebugLogs}
      />
    </div>
  );
};

export default AudioCall;
