/**
 * Hook для Voice Activity Detection (VAD)
 * Автоматическое определение начала и конца речи
 * С поддержкой мобильного таймера и проверки громкости
 */

import { useRef, useCallback } from 'react';
import { VADState } from '../types';
import { 
  VAD_SILENCE_DURATION, 
  VAD_MIN_SPEECH_DURATION, 
  VAD_ENERGY_THRESHOLD, 
  VAD_ANALYSIS_INTERVAL,
  RECORDING_CHUNK_SIZE,
  MOBILE_TRANSCRIPTION_INTERVAL,
  MOBILE_MIN_AUDIO_SIZE,
  MOBILE_MIN_VOLUME
} from '../config';
import { createAudioContext, resumeAudioContext, getOptimalMimeType, isMobileDevice, isIOSDevice, isAndroidDevice } from '../utils';

interface UseVADOptions {
  onSpeechEnd: (audioBlob: Blob, duration: number) => Promise<void>;
  onError?: (error: Error) => void;
  isTTSActiveRef?: React.MutableRefObject<boolean>; // Для проверки активности TTS
}

interface UseVADReturn {
  startVAD: (stream: MediaStream) => Promise<boolean>;
  stopVAD: () => void;
  setBlockedByTTS: (blocked: boolean) => void;
  isActive: () => boolean;
  clearBuffer: () => void;
}

export const useVAD = ({ onSpeechEnd, onError, isTTSActiveRef }: UseVADOptions): UseVADReturn => {
  // Refs
  const vadStateRef = useRef<VADState>({
    isSpeaking: false,
    speechStartTime: 0,
    lastSoundTime: 0,
    silenceStartTime: 0,
    audioBuffer: [],
    isBlockedByTTS: false
  });

  // Отслеживание среднего уровня энергии для адаптивного порога
  const speechEnergyLevelsRef = useRef<number[]>([]);
  const averageSpeechEnergyRef = useRef<number>(0);
  const peakEnergyRef = useRef<number>(0); // Пиковый уровень энергии во время речи
  const lastLogTimeRef = useRef<number>(0);
  const lowEnergyCountRef = useRef<number>(0); // Счетчик низкой энергии для определения окончания

  const vadAudioContextRef = useRef<AudioContext | null>(null);
  const vadAnalyserRef = useRef<AnalyserNode | null>(null);
  const vadMicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vadAnalysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isContinuousRecordingRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  
  // Мобильный таймер
  const mobileTranscriptionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMobileRef = useRef<boolean>(false);

  /**
   * Проверка громкости аудио (для фильтрации тишины/шума)
   */
  const checkAudioVolume = useCallback(async (audioBlob: Blob): Promise<number> => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Вычисляем среднюю громкость по всем каналам
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
      const volumePercent = averageVolume * 100;
      
      audioContext.close();
      return volumePercent;
    } catch (error) {
      console.warn('⚠️ Ошибка проверки громкости:', error);
      return 0;
    }
  }, []);

  /**
   * Запуск мобильного таймера транскрибации
   */
  const startMobileTranscriptionTimer = useCallback(() => {
    if (mobileTranscriptionTimerRef.current) return;
    
    // Проверяем, активен ли TTS
    if (isTTSActiveRef?.current) {
      console.log('📱 [Mobile] TTS активен - не запускаем таймер');
      return;
    }

    console.log('📱 [Mobile] Запуск таймера транскрибации (интервал: 3 сек)');

    mobileTranscriptionTimerRef.current = setInterval(async () => {
      console.log('📱 [Timer] ⏰ Тик - проверяем условия...');

      // Пропускаем если TTS воспроизводится
      if (isTTSActiveRef?.current || vadStateRef.current.isBlockedByTTS) {
        console.log('📱 [Timer] ⏸️ TTS активен - пропускаем');
        return;
      }

      // Пропускаем если уже обрабатываем
      if (isProcessingRef.current) {
        console.log('📱 [Timer] ⏸️ Уже обрабатывается - пропускаем');
        return;
      }

      // Проверяем наличие данных в буфере
      const { audioBuffer } = vadStateRef.current;
      if (audioBuffer.length === 0) {
        console.log('📱 [Timer] ❌ Буфер пустой');
        return;
      }

      console.log('📱 [Timer] ✅ Условия выполнены, обрабатываем аудио...');

      try {
        // Создаем blob из буфера
        const audioBlob = new Blob(audioBuffer, { type: 'audio/webm' });
        
        // Проверяем минимальный размер
        if (audioBlob.size < MOBILE_MIN_AUDIO_SIZE) {
          console.log(`📱 [Timer] Аудио слишком маленькое: ${audioBlob.size} bytes (мин: ${MOBILE_MIN_AUDIO_SIZE})`);
          return;
        }

        // Проверяем громкость
        const volumeLevel = await checkAudioVolume(audioBlob);
        console.log(`📱 [Timer] Громкость аудио: ${volumeLevel.toFixed(2)}%`);

        if (volumeLevel < MOBILE_MIN_VOLUME) {
          console.log(`📱 [Timer] ⚠️ Слишком тихо (${volumeLevel.toFixed(2)}% < ${MOBILE_MIN_VOLUME}%), пропускаем`);
          // Очищаем буфер
          vadStateRef.current.audioBuffer = [];
          return;
        }

        console.log(`📱 [Timer] ✅ Отправляем ${audioBlob.size} bytes на транскрибацию...`);

        // Очищаем буфер перед отправкой
        vadStateRef.current.audioBuffer = [];

        // Устанавливаем флаг обработки
        isProcessingRef.current = true;

        try {
          await onSpeechEnd(audioBlob, 3000); // Примерная длительность 3 сек
        } finally {
          isProcessingRef.current = false;
        }

      } catch (error) {
        console.error('📱 [Timer] Ошибка:', error);
        isProcessingRef.current = false;
      }
    }, MOBILE_TRANSCRIPTION_INTERVAL);
  }, [onSpeechEnd, checkAudioVolume, isTTSActiveRef]);

  /**
   * Остановка мобильного таймера транскрибации
   */
  const stopMobileTranscriptionTimer = useCallback(() => {
    if (mobileTranscriptionTimerRef.current) {
      console.log('📱 [Mobile] Остановка таймера транскрибации');
      clearInterval(mobileTranscriptionTimerRef.current);
      mobileTranscriptionTimerRef.current = null;
    }
  }, []);

  /**
   * Инициализация AudioContext для VAD анализа
   */
  const initializeVADAudioContext = useCallback(async (stream: MediaStream): Promise<void> => {
    try {
      console.log('🎙️ Инициализация VAD AudioContext...');
      
      vadAudioContextRef.current = createAudioContext();
      await resumeAudioContext(vadAudioContextRef.current);
      
      // Создаем анализатор
      vadAnalyserRef.current = vadAudioContextRef.current.createAnalyser();
      vadAnalyserRef.current.fftSize = 2048;
      vadAnalyserRef.current.smoothingTimeConstant = 0.8;
      
      // Подключаем микрофон к анализатору
      vadMicSourceRef.current = vadAudioContextRef.current.createMediaStreamSource(stream);
      vadMicSourceRef.current.connect(vadAnalyserRef.current);
      
      console.log('✅ VAD AudioContext инициализирован');
    } catch (error) {
      console.error('❌ Ошибка инициализации VAD AudioContext:', error);
      throw error;
    }
  }, []);

  /**
   * Анализ аудио для определения речи
   */
  const analyzeAudioEnergy = useCallback((): number => {
    if (!vadAnalyserRef.current) {
      return 0;
    }

    const bufferLength = vadAnalyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    vadAnalyserRef.current.getByteFrequencyData(dataArray);

    // Вычисляем RMS (Root Mean Square) для определения громкости
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = dataArray[i] / 255.0;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / bufferLength);
    
    // Логируем только каждые 500мс для уменьшения спама
    const now = Date.now();
    if (!lastLogTimeRef.current || now - lastLogTimeRef.current > 500) {
      console.log('🎚️ Уровень громкости:', (rms * 100).toFixed(1) + '%', 'порог:', (VAD_ENERGY_THRESHOLD * 100).toFixed(1) + '%');
      lastLogTimeRef.current = now;
    }
    
    return rms;
  }, []);

  /**
   * Обработка аудио буфера
   */
  const processAudioBuffer = useCallback(async () => {
    const { audioBuffer, speechStartTime, isBlockedByTTS } = vadStateRef.current;

    // Проверяем, есть ли что обрабатывать
    if (audioBuffer.length === 0) {
      console.log('⚠️ Аудио буфер пустой, пропускаем обработку');
      return;
    }

    // Проверяем минимальную длительность речи
    const speechDuration = Date.now() - speechStartTime;

    console.log('🔍 Начинаем обработку аудио буфера...', {
      bufferLength: audioBuffer.length,
      speechDuration: speechDuration + 'ms',
      isBlockedByTTS,
      isProcessing: isProcessingRef.current
    });
    if (speechDuration < VAD_MIN_SPEECH_DURATION) {
      console.log(`⚠️ Речь слишком короткая (${speechDuration}ms < ${VAD_MIN_SPEECH_DURATION}ms), пропускаем`);
      vadStateRef.current.audioBuffer = [];
      return;
    }

    // Проверяем блокировку TTS
    if (isBlockedByTTS) {
      console.log('🔇 Отправка заблокирована - TTS воспроизводится, пропускаем');
      vadStateRef.current.audioBuffer = [];
      return;
    }

    // Проверяем, не обрабатывается ли уже запрос
    if (isProcessingRef.current) {
      console.log('⚠️ Запрос уже обрабатывается, пропускаем');
      vadStateRef.current.audioBuffer = [];
      return;
    }

    console.log(`🎯 Обработка аудио буфера (${audioBuffer.length} chunks, ${speechDuration}ms)`);

    // Создаем blob из буфера
    const audioBlob = new Blob(audioBuffer, { type: 'audio/webm' });
    vadStateRef.current.audioBuffer = [];

    // Устанавливаем флаг обработки
    isProcessingRef.current = true;

    try {
      await onSpeechEnd(audioBlob, speechDuration);
    } catch (error) {
      console.error('❌ Ошибка обработки аудио буфера:', error);
      onError?.(error as Error);
    } finally {
      isProcessingRef.current = false;
    }
  }, [onSpeechEnd, onError]);

  /**
   * VAD цикл - непрерывный анализ аудио
   */
  const vadAnalysisLoop = useCallback(() => {
    if (!isContinuousRecordingRef.current) {
      console.log('🔇 VAD анализ пропущен - запись остановлена');
      return;
    }

    if (vadStateRef.current.isBlockedByTTS) {
      console.log('🔇 VAD анализ пропущен - заблокирован TTS');
      return;
    }

    const energy = analyzeAudioEnergy();
    const now = Date.now();
    const { isSpeaking: wasSpeaking, silenceStartTime, speechStartTime } = vadStateRef.current;

    // Адаптивный порог: используем средний уровень речи или фиксированный порог
    const adaptiveThreshold = averageSpeechEnergyRef.current > 0
      ? averageSpeechEnergyRef.current * 0.3  // 30% от среднего уровня речи
      : VAD_ENERGY_THRESHOLD;

    // Определяем окончание речи по падению энергии относительно пика
    const speechDuration = wasSpeaking ? now - speechStartTime : 0;
    const isEnergyLow = peakEnergyRef.current > 0 && energy < peakEnergyRef.current * 0.4; // Энергия упала ниже 40% от пика
    const isFixedThresholdLow = energy < VAD_ENERGY_THRESHOLD; // Энергия ниже фиксированного порога

    // Определяем, идет ли речь сейчас
    const isSpeaking = energy > adaptiveThreshold && !isEnergyLow;

    // Дополнительное логирование для отладки
    if (isContinuousRecordingRef.current) {
      console.log(`🎚️ VAD: энергия=${(energy * 100).toFixed(2)}%, адаптивный_порог=${(adaptiveThreshold * 100).toFixed(2)}%, фиксированный_порог=${(VAD_ENERGY_THRESHOLD * 100).toFixed(2)}%, говорит=${isSpeaking}, был_говорящим=${wasSpeaking}, заблокирован_TTS=${vadStateRef.current.isBlockedByTTS}`);
    }

    if (isSpeaking) {
      // Обнаружена речь
      vadStateRef.current.lastSoundTime = now;
      lowEnergyCountRef.current = 0; // Сбрасываем счетчик низкой энергии

      // Обновляем пиковый уровень
      if (energy > peakEnergyRef.current) {
        peakEnergyRef.current = energy;
      }

      // Сохраняем уровни энергии для расчета среднего
      if (wasSpeaking) {
        speechEnergyLevelsRef.current.push(energy);
        // Храним только последние 20 измерений
        if (speechEnergyLevelsRef.current.length > 20) {
          speechEnergyLevelsRef.current.shift();
        }
        // Пересчитываем среднее
        const sum = speechEnergyLevelsRef.current.reduce((a, b) => a + b, 0);
        averageSpeechEnergyRef.current = sum / speechEnergyLevelsRef.current.length;
      }

      if (!wasSpeaking) {
        // Начало новой речи
        console.log('🎤 Обнаружено начало речи (энергия:', (energy * 100).toFixed(1) + '%, порог:', (adaptiveThreshold * 100).toFixed(1) + '%)');
        vadStateRef.current.isSpeaking = true;
        vadStateRef.current.speechStartTime = now;
        vadStateRef.current.silenceStartTime = 0;
        // Сбрасываем историю для новой фразы
        speechEnergyLevelsRef.current = [energy];
        averageSpeechEnergyRef.current = energy;
        peakEnergyRef.current = energy;
        lowEnergyCountRef.current = 0;
      }

      // Таймаут для длинной речи (5 секунд) - принудительная обработка
      if (speechDuration > 5000 && wasSpeaking) {
        console.log(`⏱️ Речь длится ${speechDuration}ms - принудительная обработка`);
        vadStateRef.current.isSpeaking = false;
        vadStateRef.current.silenceStartTime = now;
        processAudioBuffer().catch(error => {
          console.error('❌ Ошибка в processAudioBuffer:', error);
        });
      }
    } else {
      // Тишина или низкая энергия
      if (wasSpeaking) {
        // Проверяем, действительно ли речь закончилась
        if (isEnergyLow || isFixedThresholdLow) {
          lowEnergyCountRef.current++;
          
          // Если низкая энергия продолжается 3 цикла подряд (300ms) - речь закончилась
          if (lowEnergyCountRef.current >= 3) {
            vadStateRef.current.isSpeaking = false;
            vadStateRef.current.silenceStartTime = now;
            console.log('🔇 Обнаружено окончание речи (энергия:', (energy * 100).toFixed(1) + '%, пик был:', (peakEnergyRef.current * 100).toFixed(1) + '%, средний:', (averageSpeechEnergyRef.current * 100).toFixed(1) + '%), ожидаем паузу...');
            // Сбрасываем значения для следующей фразы
            averageSpeechEnergyRef.current = 0;
            speechEnergyLevelsRef.current = [];
            peakEnergyRef.current = 0;
            lowEnergyCountRef.current = 0;
          }
        } else {
          // Энергия снова поднялась - продолжаем речь
          lowEnergyCountRef.current = 0;
        }
      } else if (silenceStartTime > 0) {
        // Продолжается тишина после речи
        const silenceDuration = now - silenceStartTime;

        // Логируем каждые 200ms во время тишины для лучшего отслеживания
        if (silenceDuration % 200 < 50) {
          console.log(`🔇 Тишина продолжается ${silenceDuration}ms (нужно ${VAD_SILENCE_DURATION}ms, энергия: ${(energy * 100).toFixed(1)}%, порог: ${(adaptiveThreshold * 100).toFixed(1)}%)`);
        }

        // Если тишина достаточно длинная - обрабатываем буфер
        if (silenceDuration >= VAD_SILENCE_DURATION) {
          console.log(`✅ Пауза ${silenceDuration}ms достигнута - обрабатываем речь`);
          vadStateRef.current.silenceStartTime = 0;

          // Асинхронно обрабатываем буфер
          processAudioBuffer().catch(error => {
            console.error('❌ Ошибка в processAudioBuffer:', error);
          });
        }
      }
    }
  }, [analyzeAudioEnergy, processAudioBuffer]);

  /**
   * Запуск VAD
   */
  const startVAD = useCallback(async (stream: MediaStream): Promise<boolean> => {
    try {
      console.log('🎙️ Запуск continuous recording с автоматическим VAD...');

      mediaStreamRef.current = stream;

      // Определяем тип устройства
      const mobile = isMobileDevice();
      const ios = isIOSDevice();
      const android = isAndroidDevice();
      isMobileRef.current = mobile;

      console.log('📱 Тип устройства:', { mobile, ios, android });

      // Инициализируем VAD AudioContext
      await initializeVADAudioContext(stream);

      // Создаем MediaRecorder
      const mimeType = getOptimalMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      // Сбрасываем состояние VAD
      vadStateRef.current = {
        isSpeaking: false,
        speechStartTime: 0,
        lastSoundTime: 0,
        silenceStartTime: 0,
        audioBuffer: [],
        isBlockedByTTS: false
      };
      
      // Сбрасываем адаптивные значения
      speechEnergyLevelsRef.current = [];
      averageSpeechEnergyRef.current = 0;
      peakEnergyRef.current = 0;
      lowEnergyCountRef.current = 0;

      // Обработчик получения аудио данных
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && isContinuousRecordingRef.current) {
          vadStateRef.current.audioBuffer.push(event.data);

          // Ограничиваем размер буфера (защита от переполнения)
          if (vadStateRef.current.audioBuffer.length > 300) {
            console.log('⚠️ Буфер переполнен, очищаем старые chunks');
            vadStateRef.current.audioBuffer = vadStateRef.current.audioBuffer.slice(-200);
          }
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder ошибка:', event);
        onError?.(new Error('MediaRecorder error'));
      };

      // Запускаем запись
      mediaRecorder.start(RECORDING_CHUNK_SIZE);
      isContinuousRecordingRef.current = true;

      // Запускаем VAD анализ
      vadAnalysisIntervalRef.current = setInterval(vadAnalysisLoop, VAD_ANALYSIS_INTERVAL);

      // Для мобильных устройств запускаем дополнительный таймер
      if (ios || android) {
        console.log('📱 Запуск мобильного таймера транскрибации');
        startMobileTranscriptionTimer();
      }

      console.log('✅ Continuous recording запущен с VAD');
      return true;

    } catch (error) {
      console.error('❌ Ошибка запуска continuous recording:', error);
      onError?.(error as Error);
      return false;
    }
  }, [initializeVADAudioContext, vadAnalysisLoop, onError, startMobileTranscriptionTimer]);

  /**
   * Остановка VAD
   */
  const stopVAD = useCallback(() => {
    console.log('🛑 Остановка continuous recording...');

    // Останавливаем мобильный таймер
    stopMobileTranscriptionTimer();

    // Останавливаем VAD анализ
    if (vadAnalysisIntervalRef.current) {
      clearInterval(vadAnalysisIntervalRef.current);
      vadAnalysisIntervalRef.current = null;
    }

    // Останавливаем запись
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('⚠️ Ошибка остановки MediaRecorder:', e);
      }
    }

    // Останавливаем микрофон
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Очищаем VAD AudioContext
    if (vadMicSourceRef.current) {
      vadMicSourceRef.current.disconnect();
      vadMicSourceRef.current = null;
    }

    if (vadAudioContextRef.current) {
      vadAudioContextRef.current.close();
      vadAudioContextRef.current = null;
    }

    // Сбрасываем флаги
    isContinuousRecordingRef.current = false;
    vadStateRef.current.audioBuffer = [];
    
    // Сбрасываем адаптивные значения
    speechEnergyLevelsRef.current = [];
    averageSpeechEnergyRef.current = 0;
    peakEnergyRef.current = 0;
    lowEnergyCountRef.current = 0;

    console.log('✅ Continuous recording остановлен');
  }, [stopMobileTranscriptionTimer]);

  /**
   * Блокировка/разблокировка VAD во время TTS
   */
  const setBlockedByTTS = useCallback((blocked: boolean) => {
    console.log(blocked ? '🔇 VAD заблокирован - TTS воспроизводится' : '🔊 VAD разблокирован - TTS завершен');
    vadStateRef.current.isBlockedByTTS = blocked;

    // Очищаем буфер при блокировке (чтобы не отправить эхо)
    if (blocked) {
      vadStateRef.current.audioBuffer = [];
      vadStateRef.current.isSpeaking = false;
      vadStateRef.current.silenceStartTime = 0;
    }
  }, []);

  /**
   * Проверка активности VAD
   */
  const isActive = useCallback(() => {
    return isContinuousRecordingRef.current;
  }, []);

  /**
   * Очистка буфера
   */
  const clearBuffer = useCallback(() => {
    vadStateRef.current.audioBuffer = [];
  }, []);

  return {
    startVAD,
    stopVAD,
    setBlockedByTTS,
    isActive,
    clearBuffer
  };
};

