import { useState, useRef, useEffect, useCallback } from 'react';
interface TTSService {
  synthesizeSpeech(text: string): Promise<ArrayBuffer>;
}

interface TTSService {
  synthesizeSpeech(text: string): Promise<ArrayBuffer>;
}

interface UseTTSProps {
  ttsService: TTSService;
  onPlaybackStatusChange?: (isPlaying: boolean) => void;
}

export const useTTS = ({ ttsService, onPlaybackStatusChange }: UseTTSProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  // Refs to maintain state without re-renders
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakerGainRef = useRef<GainNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingAudioRef = useRef(false);
  const isSynthesizingRef = useRef(false);
  const currentSpeechSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const generationIdRef = useRef(0); // To invalidate old playback sequences on interruption
  const lastProcessedTextRef = useRef<string>(''); // Prevent duplicate TTS processing

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

    // Clear queue
    audioQueueRef.current = [];

    // Stop current source
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

  // Reset processed text tracking when stopping
  useEffect(() => {
    if (!isPlaying && !isSynthesizing) {
      lastProcessedTextRef.current = '';
    }
  }, [isPlaying, isSynthesizing]);

  // Function to explicitly reset deduplication for new user input
  const resetDeduplication = useCallback(() => {
    const resetId = Date.now();
    console.log(`[TTS] Resetting deduplication for new user input (ResetID: ${resetId})`);
    console.log(`[TTS] Previous lastProcessed: "${lastProcessedTextRef.current?.substring(0, 30)}..."`);
    lastProcessedTextRef.current = '';
    console.log(`[TTS] Deduplication reset complete (ResetID: ${resetId})`);
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
      
      // If queue still has items (and wasn't interrupted), continue playing
      if (audioQueueRef.current.length > 0 && generationIdRef.current === startGenId) {
        void playQueuedAudio();
      }
    }
  };

  const speak = useCallback(async (text: string) => {
    const callId = Date.now(); // Unique ID for this speak call
    console.log(`[TTS] speak called (ID: ${callId}) with text: "${text?.substring(0, 50)}..."`);

    // Prevent duplicate TTS processing
    const trimmedText = text?.trim() || '';
    if (!trimmedText) return;

    // Check if this text is just an extension of previously processed text
    const lastProcessed = lastProcessedTextRef.current;
    console.log(`[TTS] Deduplication check (ID: ${callId}):`);
    console.log(`  - Current text: "${trimmedText.substring(0, 30)}..."`);
    console.log(`  - Last processed: "${lastProcessed?.substring(0, 30)}..."`);

    const isExtension = lastProcessed &&
                       trimmedText.startsWith(lastProcessed) &&
                       trimmedText.length > lastProcessed.length &&
                       (trimmedText.length - lastProcessed.length) > 10; // At least 10 chars added

    if (isExtension) {
      console.log(`[TTS] Text is extension of previous (${lastProcessed.length} -> ${trimmedText.length} chars, +${trimmedText.length - lastProcessed.length}), updating last processed but skipping TTS (ID: ${callId})`);
      lastProcessedTextRef.current = trimmedText;
      return;
    }

    // Check for exact duplicate
    if (lastProcessed === trimmedText) {
      console.log(`[TTS] Skipping exact duplicate text (ID: ${callId}): "${trimmedText.substring(0, 30)}..."`);
      return;
    }

    // Check if this is a minor variation (less than 20% difference)
    const lengthDiff = Math.abs(trimmedText.length - lastProcessed.length);
    const maxLength = Math.max(trimmedText.length, lastProcessed.length);
    if (lastProcessed && (lengthDiff / maxLength) < 0.2 && lengthDiff < 100) {
      console.log(`[TTS] Text is minor variation (${lengthDiff} chars diff, ${(lengthDiff / maxLength * 100).toFixed(1)}%), skipping (ID: ${callId}): "${trimmedText.substring(0, 30)}..."`);
      lastProcessedTextRef.current = trimmedText;
      return;
    }

    console.log(`[TTS] Processing new text (ID: ${callId})`);
    lastProcessedTextRef.current = trimmedText;

    // Split into sentences for streaming effect
    const sentences = trimmedText.split(/(?<=[.!?])\s+/u).map(s => s.trim()).filter(s => s.length > 0);
    console.log(`[TTS] Split into ${sentences.length} sentences (ID: ${callId}):`, sentences);
    if (sentences.length === 0) return;

    const myGenId = generationIdRef.current;
    console.log(`[TTS] Using generation ID: ${myGenId} (ID: ${callId})`);
    updateSynthesizingState(true);

    try {
      for (const sentence of sentences) {
        if (generationIdRef.current !== myGenId) {
          console.log(`[TTS] Generation interrupted, stopping (ID: ${callId})`);
          break;
        }

        console.log(`[TTS] Processing sentence (ID: ${callId}): "${sentence}"`);
        try {
          const audioBuffer = await ttsService.synthesizeSpeech(sentence);
          console.log(`[TTS] Synthesized sentence (ID: ${callId}): "${sentence}"`);

          if (generationIdRef.current !== myGenId) break;

          if (audioBuffer && audioBuffer.byteLength > 0) {
            audioQueueRef.current.push(audioBuffer);
            console.log(`[TTS] Added to queue (ID: ${callId}): ${audioBuffer.byteLength} bytes`);
            if (!isPlayingAudioRef.current) {
              console.log(`[TTS] Starting playback (ID: ${callId})`);
              void playQueuedAudio();
            }
          }
        } catch (error) {
          console.warn("[TTS] Synthesis failed for sentence:", sentence, error);
        }
      }
      console.log(`[TTS] Finished processing all sentences (ID: ${callId})`);
    } finally {
      updateSynthesizingState(false);
    }
  }, []);

  const setSpeakerVolume = (on: boolean) => {
    if (speakerGainRef.current && audioContextRef.current) {
      speakerGainRef.current.gain.setValueAtTime(on ? 1 : 0, audioContextRef.current.currentTime);
    }
  };

  // Cleanup on unmount
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
    isPlaying, // React state for UI
    isSynthesizing, // React state for UI
    isPlayingRef: isPlayingAudioRef, // Ref for logic
    isSynthesizingRef: isSynthesizingRef, // Ref for logic
    audioContextRef
  };
};

