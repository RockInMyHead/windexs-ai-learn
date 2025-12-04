import { useState, useRef, useEffect, useCallback } from 'react';
import { psychologistAI } from '@/services/openai';
import { convertTextForTTS } from '@/utils/textToSpeechConverter';

interface UseTTSProps {
  onPlaybackStatusChange?: (isPlaying: boolean) => void;
}

export const useTTS = ({ onPlaybackStatusChange }: UseTTSProps = {}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  // Refs to maintain state without re-renders
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakerGainRef = useRef<GainNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingAudioRef = useRef(false);
  const isSynthesizingRef = useRef(false);
  const currentSpeechSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const generationIdRef = useRef(0);
  const lastProcessedTextRef = useRef<string>('');

  // Synchronize ref state with React state for UI consumers
  const updatePlayingState = (playing: boolean) => {
    isPlayingAudioRef.current = playing;
    setIsPlaying(playing);
    onPlaybackStatusChange?.(playing || isSynthesizingRef.current);
  };

  const updateSynthesizingState = (synthesizing: boolean) => {
    isSynthesizingRef.current = synthesizing;
    setIsSynthesizing(synthesizing);
    onPlaybackStatusChange?.(isPlayingAudioRef.current || synthesizing);
  };

  const createAudioContext = () => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
    return audioContextRef.current;
  };

  const initializeAudioContext = async () => {
    const audioContext = createAudioContext();

    if (!speakerGainRef.current && audioContext) {
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1;
      gainNode.connect(audioContext.destination);
      speakerGainRef.current = gainNode;
    }

    if (audioContext && audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (error) {
        console.warn("[TTS] Failed to resume AudioContext:", error);
      }
    }
    return audioContext;
  };

  const stop = useCallback(() => {
    const newGenerationId = generationIdRef.current + 1;
    generationIdRef.current = newGenerationId;

    audioQueueRef.current = [];

    if (currentSpeechSourceRef.current) {
      try {
        currentSpeechSourceRef.current.stop();
        currentSpeechSourceRef.current.disconnect();
      } catch (error) {
        console.warn("[TTS] Error stopping speech source:", error);
      }
      currentSpeechSourceRef.current = null;
    }

    updatePlayingState(false);
    updateSynthesizingState(false);

    console.log(`[TTS] Speech stopped (gen: ${newGenerationId})`);
  }, []);

  useEffect(() => {
    if (!isPlaying && !isSynthesizing) {
      lastProcessedTextRef.current = '';
    }
  }, [isPlaying, isSynthesizing]);

  const resetDeduplication = useCallback(() => {
    const resetId = Date.now();
    const previousText = lastProcessedTextRef.current;
    console.log(`[TTS] 🔄 Resetting deduplication (ResetID: ${resetId})`);
    console.log(`[TTS]   Previous lastProcessed: "${previousText?.substring(0, 50) || 'none'}..." (${previousText?.length || 0} chars)`);
    lastProcessedTextRef.current = '';
    console.log(`[TTS] ✅ Deduplication reset complete (ResetID: ${resetId})`);
  }, []);

  const playQueuedAudio = async () => {
    if (isPlayingAudioRef.current || audioQueueRef.current.length === 0) return;

    const startGenId = generationIdRef.current;
    const audioContext = await initializeAudioContext();

    if (!audioContext) {
      audioQueueRef.current = [];
      return;
    }

    updatePlayingState(true);

    try {
      while (audioQueueRef.current.length > 0) {
        if (generationIdRef.current !== startGenId) break;

        const buffer = audioQueueRef.current.shift();
        if (!buffer || buffer.byteLength === 0) continue;

        let decoded: AudioBuffer;
        try {
          decoded = await audioContext.decodeAudioData(buffer.slice(0));
        } catch (error) {
          console.error("[TTS] Decode error:", error);
          continue;
        }

        await new Promise<void>((resolve) => {
          if (generationIdRef.current !== startGenId) {
            resolve();
            return;
          }

          const source = audioContext.createBufferSource();
          source.buffer = decoded;
          source.connect(speakerGainRef.current ?? audioContext.destination);
          currentSpeechSourceRef.current = source;

          source.onended = () => {
            currentSpeechSourceRef.current = null;
            resolve();
          };

          source.start(0);
        });
      }
    } catch (error) {
      console.error("[TTS] Playback error:", error);
    } finally {
      updatePlayingState(false);
      
      if (audioQueueRef.current.length > 0 && generationIdRef.current === startGenId) {
        void playQueuedAudio();
      }
    }
  };

  const speak = useCallback(async (text: string) => {
    const callId = Date.now();
    const stackTrace = new Error().stack?.split('\n').slice(2, 5).join(' -> ') || 'unknown';
    console.log(`[TTS] 🔊 speak called (ID: ${callId})`);
    console.log(`[TTS] 📝 Text length: ${text?.length || 0}, preview: "${text?.substring(0, 50)}..."`);
    console.log(`[TTS] 📍 Call stack: ${stackTrace}`);

    const trimmedText = text?.trim() || '';
    if (!trimmedText) {
      console.log(`[TTS] ⚠️ Empty text after trim, skipping (ID: ${callId})`);
      return;
    }

    const lastProcessed = lastProcessedTextRef.current;
    console.log(`[TTS] 🔍 Deduplication check (ID: ${callId}):`);
    console.log(`[TTS]   - Current text: "${trimmedText.substring(0, 80)}..." (${trimmedText.length} chars)`);
    console.log(`[TTS]   - Last processed: "${lastProcessed?.substring(0, 80) || 'none'}..." (${lastProcessed?.length || 0} chars)`);

    const isExtension = lastProcessed &&
                       trimmedText.startsWith(lastProcessed) &&
                       trimmedText.length > lastProcessed.length &&
                       (trimmedText.length - lastProcessed.length) > 10;

    if (isExtension) {
      console.log(`[TTS] 🚫 Text is extension of previous (${lastProcessed.length} -> ${trimmedText.length} chars, +${trimmedText.length - lastProcessed.length}), skipping (ID: ${callId})`);
      lastProcessedTextRef.current = trimmedText;
      return;
    }

    if (lastProcessed === trimmedText) {
      console.log(`[TTS] 🚫 Skipping exact duplicate text (ID: ${callId})`);
      return;
    }

    const lengthDiff = Math.abs(trimmedText.length - lastProcessed.length);
    const maxLength = Math.max(trimmedText.length, lastProcessed.length);
    if (lastProcessed && (lengthDiff / maxLength) < 0.2 && lengthDiff < 100) {
      console.log(`[TTS] 🚫 Text is minor variation (diff: ${lengthDiff} chars, ${((lengthDiff / maxLength) * 100).toFixed(1)}%), skipping (ID: ${callId})`);
      lastProcessedTextRef.current = trimmedText;
      return;
    }

    console.log(`[TTS] ✅ Processing new text (ID: ${callId})`);
    lastProcessedTextRef.current = trimmedText;

    // Разбиваем на предложения
    const sentences = trimmedText.split(/(?<=[.!?])\s+/u).map(s => s.trim()).filter(s => s.length > 0);
    console.log(`[TTS] 📊 Split into ${sentences.length} sentences (ID: ${callId})`);
    sentences.forEach((s, i) => {
      console.log(`[TTS]   Sentence ${i + 1}: "${s.substring(0, 50)}..." (${s.length} chars)`);
    });
    
    if (sentences.length === 0) {
      console.log(`[TTS] ⚠️ No sentences found, skipping (ID: ${callId})`);
      return;
    }

    const myGenId = generationIdRef.current;
    console.log(`[TTS] 🎬 Starting synthesis (ID: ${callId}, genId: ${myGenId})`);
    updateSynthesizingState(true);

    try {
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        if (generationIdRef.current !== myGenId) {
          console.log(`[TTS] ⏹️ Generation cancelled (ID: ${callId}, sentence ${i + 1}/${sentences.length})`);
          break;
        }

        try {
          // Конвертируем математику и цифры в текст для озвучки
          const ttsReadyText = convertTextForTTS(sentence);
          console.log(`[TTS] 🎤 Synthesizing sentence ${i + 1}/${sentences.length} (ID: ${callId})`);
          console.log(`[TTS]   Original: "${sentence.substring(0, 60)}..."`);
          console.log(`[TTS]   TTS-ready: "${ttsReadyText.substring(0, 60)}..."`);
          
          const sentenceStartTime = Date.now();
          const audioBuffer = await psychologistAI.synthesizeSpeech(ttsReadyText);
          const sentenceDuration = Date.now() - sentenceStartTime;

          if (generationIdRef.current !== myGenId) {
            console.log(`[TTS] ⏹️ Generation cancelled after synthesis (ID: ${callId}, sentence ${i + 1})`);
            break;
          }

          if (audioBuffer && audioBuffer.byteLength > 0) {
            console.log(`[TTS] ✅ Sentence ${i + 1} synthesized (ID: ${callId}): ${audioBuffer.byteLength} bytes, took ${sentenceDuration}ms`);
            audioQueueRef.current.push(audioBuffer);
            if (!isPlayingAudioRef.current) {
              void playQueuedAudio();
            }
          } else {
            console.warn(`[TTS] ⚠️ Empty audio buffer for sentence ${i + 1} (ID: ${callId})`);
          }
        } catch (error) {
          console.error(`[TTS] ❌ Synthesis failed for sentence ${i + 1}/${sentences.length} (ID: ${callId}):`, sentence, error);
        }
      }
      console.log(`[TTS] ✅ All sentences processed (ID: ${callId})`);
    } finally {
      updateSynthesizingState(false);
      console.log(`[TTS] 🏁 Synthesis complete (ID: ${callId})`);
    }
  }, []);

  const setSpeakerVolume = (on: boolean) => {
    if (speakerGainRef.current && audioContextRef.current) {
      speakerGainRef.current.gain.setValueAtTime(on ? 1 : 0, audioContextRef.current.currentTime);
    }
  };

  useEffect(() => {
    return () => {
      stop();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    speak,
    stop,
    setSpeakerVolume,
    resetDeduplication,
    isPlaying,
    isSynthesizing,
    isPlayingRef: isPlayingAudioRef,
    isSynthesizingRef: isSynthesizingRef,
    audioContextRef
  };
};

