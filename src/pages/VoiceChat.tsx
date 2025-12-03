import Navigation from "@/components/Navigation";
import { useParams, useNavigate } from "react-router-dom";
import { getCourseDisplayName } from "@/lib/utils";
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff, Loader2, Bug, X, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import AssistantOrb from "@/components/AssistantOrb";

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
    <div className="fixed bottom-4 right-4 w-96 max-h-96 bg-black/90 text-green-400 font-mono text-xs rounded-lg border border-gray-600 overflow-hidden z-50 shadow-2xl">
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

const VoiceChat = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  // UI State
  const [isCallActive, setIsCallActive] = useState(false);
  const [isInitializingCall, setIsInitializingCall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Debug Logs State
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState(false);

  // Refs
  const callTimerRef = useRef<number | null>(null);
  const isAssistantSpeakingRef = useRef(false);

  // Debug logging functions
  const addDebugLog = useCallback((message: string) => {
    console.log(message);
    setDebugLogs(prev => [...prev, message]);
  }, []);

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);

  const toggleDebugLogs = useCallback(() => {
    addDebugLog(`[UI] Debug logs toggled: ${!showDebugLogs}`);
    setShowDebugLogs(prev => !prev);
  }, [showDebugLogs, addDebugLog]);

  // --- Hooks Initialization ---

  // 1. TTS Service
  const {
    speak,
    stop: stopTTS,
    resetDeduplication,
    isPlaying: isTTSPlaying,
    isSynthesizing: isTTSSynthesizing,
  } = useTTS({
    onPlaybackStatusChange: (isActive) => {
      isAssistantSpeakingRef.current = isActive;
      if (!isActive) {
        console.log('[TTS] TTS session ended, ready for new text');
      }
    }
  });

  // Update speaking ref
  useEffect(() => {
    isAssistantSpeakingRef.current = isTTSPlaying || isTTSSynthesizing;
  }, [isTTSPlaying, isTTSSynthesizing]);

  // 2. LLM Service
  const {
    processUserMessage,
    loadUserProfile,
    addToConversation,
    isProcessing: isAIProcessing
  } = useLLM({
    courseId,
    onResponseGenerated: async (text) => {
      await speak(text);
    },
    onError: (err) => setError(err)
  });

  // 3. Transcription Service
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
      console.log(`[VoiceChat] onTranscriptionComplete: "${text}" from ${source}`);
      if (!text) return;

      if (source !== 'manual') stopTTS();
      resetDeduplication();

      await processUserMessage(text);
    },
    onInterruption: () => {
      stopTTS();
    },
    onSpeechStart: () => {
      // Optional: UI indication
    },
    onError: (err) => setError(err)
  });

  // --- Call Logic ---

  const startCall = async () => {
    if (isCallActive) return;
    setIsInitializingCall(true);
    setError(null);

    try {
      // Load user context
      await loadUserProfile();

      // Initialize Audio/Recognition
      await initializeRecognition();

      // UI Updates
      addDebugLog('[UI] Call started - setting isCallActive to true');
      setIsCallActive(true);
      setCallDuration(0);

      // Initial Greeting
      const courseName = getCourseDisplayName(courseId || "");
      setTimeout(async () => {
        const greeting = courseName 
          ? `Здравствуй! Я Юлия, твой учитель по курсу "${courseName}". Чем могу помочь?`
          : "Здравствуй! Я Юлия, твой ИИ-учитель. Чем могу помочь?";
        addToConversation('assistant', greeting);
        await speak(greeting);
      }, 1000);

      // Start Timer
      callTimerRef.current = window.setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error("Start call error:", err);
      setError(err.message || "Не удалось начать урок");
      cleanupRecognition();
    } finally {
      setIsInitializingCall(false);
    }
  };

  const endCall = async () => {
    stopTTS();
    cleanupRecognition();

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }

    addDebugLog('[UI] Call ended - setting isCallActive to false');
    setIsCallActive(false);
    setCallDuration(0);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTTS();
      cleanupRecognition();
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, []);

  // Orb state
  const orbState = useMemo(() => {
    if (isTTSPlaying || isTTSSynthesizing) return 'speaking';
    if (isAIProcessing) return 'processing';
    if (isCallActive && !isMuted) return 'listening';
    return 'idle';
  }, [isTTSPlaying, isTTSSynthesizing, isAIProcessing, isCallActive, isMuted]);

  // Status text
  const statusText = useMemo(() => {
    if (isTTSPlaying || isTTSSynthesizing) return 'Говорю...';
    if (isAIProcessing) return 'Думаю...';
    if (isCallActive && !isMuted) return 'Слушаю...';
    if (isCallActive && isMuted) return 'Микрофон выключен';
    return 'Нажмите, чтобы начать урок';
  }, [isTTSPlaying, isTTSSynthesizing, isAIProcessing, isCallActive, isMuted]);

  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());

  return (
    <div className="relative w-full h-screen bg-background overflow-hidden flex flex-col font-sans">
      <Navigation />

      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-4 pt-16 pb-32 md:pb-24">
        
        {/* Assistant Orb */}
        <div className="relative flex items-center justify-center mb-8 md:mb-12 scale-90 md:scale-100 transition-transform duration-500">
          <AssistantOrb state={orbState} />
        </div>

        {/* Status */}
        <div className="flex flex-col items-center space-y-4 text-center max-w-2xl px-4">
          <div className="text-foreground/80 text-xl md:text-2xl font-light tracking-widest uppercase animate-pulse transition-colors duration-300">
            {statusText}
          </div>
          
          {isCallActive && (
            <div className="text-lg font-medium text-primary">
              {formatDuration(callDuration)}
            </div>
          )}

          {transcriptionStatus && (
            <p className="text-sm text-primary/80 animate-pulse">{transcriptionStatus}</p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Mobile info */}
          {!isCallActive && isMobile && (
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">📱 Мобильное устройство обнаружено</p>
              {isIOS && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Оптимизировано для iOS</p>}
            </div>
          )}

          {/* Microphone problems */}
          {isCallActive && !microphoneAccessGranted && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
              <h3 className="text-sm font-medium mb-2 text-red-800 dark:text-red-200">
                🚫 Проблема с микрофоном
              </h3>
              <p className="text-sm text-red-600 dark:text-red-400 mb-2">
                {forceOpenAI ? "Используется текстовый режим (OpenAI)" : "Микрофон недоступен. Проверьте разрешения."}
              </p>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <div>📱 iOS: {isIOS ? 'Да' : 'Нет'} | Мобильный: {isMobile ? 'Да' : 'Нет'}</div>
                <div>🔐 Разрешения: {microphonePermissionStatus}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 z-50 flex items-center justify-center space-x-6 md:space-x-12 px-4 pb-safe">
        
        {!isCallActive ? (
          // Start Call Button
        <Button
            onClick={startCall}
            disabled={isInitializingCall}
            size="lg"
            className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-green-500 hover:bg-green-600 shadow-lg transition-all duration-500 transform hover:scale-105"
          >
            {isInitializingCall ? (
              <Loader2 className="w-8 h-8 md:w-10 md:h-10 animate-spin" />
            ) : (
              <Phone className="w-8 h-8 md:w-10 md:h-10" />
            )}
          </Button>
        ) : (
          // Active Call Controls
          <>
            {/* Mute Toggle */}
            <Button
              onClick={toggleMute}
              size="lg"
              variant={isMuted ? "destructive" : "outline"}
              className="w-14 h-14 md:w-16 md:h-16 rounded-full p-0"
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </Button>

            {/* Stop TTS Button (when speaking) */}
            {(isTTSPlaying || isTTSSynthesizing) && (
        <Button
                onClick={stopTTS}
                size="lg"
                variant="destructive"
                className="w-14 h-14 md:w-16 md:h-16 rounded-full p-0 animate-pulse"
                title="Прервать"
              >
                <Square className="w-6 h-6" />
              </Button>
            )}

            {/* End Call */}
            <Button
              onClick={endCall}
              size="lg"
              variant="destructive"
              className="w-14 h-14 md:w-16 md:h-16 rounded-full p-0 shadow-lg"
            >
              <PhoneOff className="w-6 h-6" />
        </Button>
          </>
        )}
      </div>

      {/* Debug Toggle Button */}
      {isCallActive && (
        <div className="absolute bottom-28 left-0 right-0 flex justify-center z-40">
        <Button
            onClick={toggleDebugLogs}
            size="sm"
            variant="outline"
            className="flex items-center gap-2 text-xs bg-black/80 border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white shadow-lg backdrop-blur-sm"
          >
            <Bug className="w-3 h-3" />
            {showDebugLogs ? 'Скрыть логи' : 'Показать логи'}
        </Button>
      </div>
      )}

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

export default VoiceChat;
