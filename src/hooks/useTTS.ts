import { useState, useRef, useEffect, useCallback } from 'react';
import { psychologistAI } from '@/services/openai';

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
    console.log(`[TTS] Resetting deduplication for new user input`);
    lastProcessedTextRef.current = '';
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
    console.log(`[TTS] speak called (ID: ${callId}) with text: "${text?.substring(0, 50)}..."`);

    const trimmedText = text?.trim() || '';
    if (!trimmedText) return;

    const lastProcessed = lastProcessedTextRef.current;

    const isExtension = lastProcessed &&
                       trimmedText.startsWith(lastProcessed) &&
                       trimmedText.length > lastProcessed.length &&
                       (trimmedText.length - lastProcessed.length) > 10;

    if (isExtension) {
      console.log(`[TTS] Text is extension of previous, skipping (ID: ${callId})`);
      lastProcessedTextRef.current = trimmedText;
      return;
    }

    if (lastProcessed === trimmedText) {
      console.log(`[TTS] Skipping exact duplicate text (ID: ${callId})`);
      return;
    }

    const lengthDiff = Math.abs(trimmedText.length - lastProcessed.length);
    const maxLength = Math.max(trimmedText.length, lastProcessed.length);
    if (lastProcessed && (lengthDiff / maxLength) < 0.2 && lengthDiff < 100) {
      console.log(`[TTS] Text is minor variation, skipping (ID: ${callId})`);
      lastProcessedTextRef.current = trimmedText;
      return;
    }

    console.log(`[TTS] Processing new text (ID: ${callId})`);
    lastProcessedTextRef.current = trimmedText;

    const sentences = trimmedText.split(/(?<=[.!?])\s+/u).map(s => s.trim()).filter(s => s.length > 0);
    if (sentences.length === 0) return;

    const myGenId = generationIdRef.current;
    updateSynthesizingState(true);

    try {
      for (const sentence of sentences) {
        if (generationIdRef.current !== myGenId) break;

        try {
          const audioBuffer = await psychologistAI.synthesizeSpeech(sentence);

          if (generationIdRef.current !== myGenId) break;

          if (audioBuffer && audioBuffer.byteLength > 0) {
            audioQueueRef.current.push(audioBuffer);
            if (!isPlayingAudioRef.current) {
              void playQueuedAudio();
            }
          }
        } catch (error) {
          console.warn("[TTS] Synthesis failed for sentence:", sentence, error);
        }
      }
    } finally {
      updateSynthesizingState(false);
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

