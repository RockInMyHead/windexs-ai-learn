/**
 * Hook для записи аудио после прерывания
 */

import { useCallback, useRef } from 'react';
import { INTERRUPTION_RECORDING_TIMEOUT, SILENCE_THRESHOLD, SILENCE_DURATION } from '../config';
import { getOptimalMimeType, createAudioContext } from '../utils';

interface UseAudioRecordingOptions {
  onRecordingComplete: (audioBlob: Blob) => Promise<void>;
  onError?: (error: Error) => void;
}

interface UseAudioRecordingReturn {
  startInterruptionRecording: () => Promise<void>;
  stopRecording: () => void;
}

export const useAudioRecording = ({
  onRecordingComplete,
  onError
}: UseAudioRecordingOptions): UseAudioRecordingReturn => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Остановка записи
   */
  const stopRecording = useCallback(() => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('⚠️ Ошибка остановки MediaRecorder:', e);
      }
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  /**
   * Запуск записи после прерывания
   */
  const startInterruptionRecording = useCallback(async (): Promise<void> => {
    try {
      console.log('🎤 Запуск автоматической записи после прерывания...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('❌ MediaDevices API недоступен');
        return;
      }

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      // Choose optimal audio format
      const mimeType = getOptimalMimeType();
      console.log('🎵 Используемый MIME тип:', mimeType);

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      // Handle data collection
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log('📦 Записан аудио чанк, размер:', event.data.size);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = async () => {
        console.log('🛑 Автоматическая запись остановлена, чанков:', audioChunksRef.current.length);

        // Stop all tracks
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }

        // Process the recording
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          audioChunksRef.current = [];

          console.log('📦 Создан audio blob для транскрибации:', {
            size: audioBlob.size,
            type: audioBlob.type
          });

          try {
            await onRecordingComplete(audioBlob);
          } catch (error) {
            console.error('❌ Ошибка обработки записи:', error);
            onError?.(error as Error);
          }
        }
      };

      // Start recording
      mediaRecorder.start(100);
      console.log('✅ Автоматическая запись начата');

      // Set timeout for automatic stop
      recordingTimeoutRef.current = setTimeout(() => {
        console.log('⏰ Таймер истек - останавливаем автоматическую запись');
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, INTERRUPTION_RECORDING_TIMEOUT);

      // Set up silence detection
      let silenceStartTime = Date.now();

      const audioContext = createAudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      analyser.fftSize = 256;
      microphone.connect(analyser);

      const checkSilence = () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
          audioContext.close();
          return;
        }

        analyser.getByteFrequencyData(dataArray);

        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length / 255;

        if (average < SILENCE_THRESHOLD) {
          // Silence detected
          if (Date.now() - silenceStartTime > SILENCE_DURATION) {
            console.log('🔇 Обнаружена тишина - останавливаем запись');
            if (mediaRecorderRef.current) {
              mediaRecorderRef.current.stop();
            }
            audioContext.close();
            return;
          }
        } else {
          // Sound detected, reset silence timer
          silenceStartTime = Date.now();
        }

        // Continue checking
        requestAnimationFrame(checkSilence);
      };

      // Start silence detection
      requestAnimationFrame(checkSilence);

    } catch (error) {
      console.error('❌ Ошибка запуска автоматической записи после прерывания:', error);
      onError?.(error as Error);
    }
  }, [onRecordingComplete, onError]);

  return {
    startInterruptionRecording,
    stopRecording
  };
};

