# 🛠️ Технический План Модернизации

## 📋 Детальные Технические Задачи

### **Фаза 1: Критические Исправления**

#### **1.1 WebRTC Реализация**

##### **Архитектура**
```
WebRTC Module Structure:
├── webrtc/
│   ├── core/
│   │   ├── RTCPeerConnection.ts      # Основной класс соединения
│   │   ├── SignalingService.ts       # WebSocket сигнализация
│   │   └── MediaHandler.ts           # Камера/микрофон
│   ├── components/
│   │   ├── VideoCall.tsx             # UI компонент звонка
│   │   ├── CallControls.tsx          # Кнопки управления
│   │   └── ParticipantList.tsx       # Список участников
│   ├── hooks/
│   │   ├── useWebRTC.ts              # Основной hook
│   │   └── useMediaDevices.ts        # Управление устройствами
│   └── types/
│       └── webrtc.types.ts           # TypeScript типы
```

##### **Ключевые Компоненты**

**RTCPeerConnection Manager:**
```typescript
class WebRTCManager {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private signalingService: SignalingService;

  async createPeerConnection(peerId: string): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Event handlers
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingService.send({
          type: 'ice-candidate',
          candidate: event.candidate,
          target: peerId
        });
      }
    };

    pc.ontrack = (event) => {
      // Handle remote stream
      this.handleRemoteStream(peerId, event.streams[0]);
    };

    this.peerConnections.set(peerId, pc);
    return pc;
  }

  async startCall(peerId: string): Promise<void> {
    const pc = await this.createPeerConnection(peerId);

    // Get local media
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });

    // Add tracks to peer connection
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Send offer via signaling
    this.signalingService.send({
      type: 'offer',
      offer,
      target: peerId
    });
  }
}
```

**Signaling Service:**
```typescript
class SignalingService {
  private ws: WebSocket;
  private messageHandlers: Map<string, Function> = new Map();

  constructor(serverUrl: string) {
    this.ws = new WebSocket(serverUrl);

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        handler(message);
      }
    };
  }

  on(type: string, handler: Function): void {
    this.messageHandlers.set(type, handler);
  }

  send(message: any): void {
    this.ws.send(JSON.stringify(message));
  }
}
```

##### **Интеграция с Существующим Кодом**
```typescript
// src/pages/VoiceChat.tsx - добавить импорт
import { WebRTCManager } from '@/webrtc/core/WebRTCManager';
import VideoCall from '@/webrtc/components/VideoCall';

// Добавить state
const [isInCall, setIsInCall] = useState(false);
const [callParticipants, setCallParticipants] = useState<string[]>([]);
const webRTCRef = useRef<WebRTCManager | null>(null);

// Инициализация
useEffect(() => {
  webRTCRef.current = new WebRTCManager();
  webRTCRef.current.init();
}, []);

// Функция начала звонка
const startCall = async (targetUserId: string) => {
  try {
    await webRTCRef.current?.startCall(targetUserId);
    setIsInCall(true);
    setCallParticipants([targetUserId]);
  } catch (error) {
    toast.error('Не удалось начать звонок: ' + error.message);
  }
};
```

#### **1.2 State Management Refactor**

##### **Текущие Проблемы**
- 1218 строк в VoiceChat.tsx
- Сложная логика состояний
- Гонка состояний
- Утечки памяти

##### **Решение: State Machine**

**VoiceChatStateMachine.ts:**
```typescript
type VoiceChatState =
  | 'idle'
  | 'initializing'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error'
  | 'call_active';

interface VoiceChatContext {
  isRecording: boolean;
  isTranscribing: boolean;
  isGeneratingResponse: boolean;
  isSpeaking: boolean;
  transcript: string;
  error?: string;
  callParticipants?: string[];
}

class VoiceChatStateMachine {
  private state: VoiceChatState = 'idle';
  private context: VoiceChatContext = {
    isRecording: false,
    isTranscribing: false,
    isGeneratingResponse: false,
    isSpeaking: false,
    transcript: ''
  };

  private listeners: Set<(state: VoiceChatState, context: VoiceChatContext) => void> = new Set();

  transition(newState: VoiceChatState, updates: Partial<VoiceChatContext> = {}): void {
    // Validate transition
    if (!this.isValidTransition(this.state, newState)) {
      console.warn(`Invalid transition: ${this.state} -> ${newState}`);
      return;
    }

    // Update context
    this.context = { ...this.context, ...updates };
    this.state = newState;

    // Cleanup based on state
    this.performCleanup();

    // Notify listeners
    this.listeners.forEach(listener => listener(this.state, this.context));
  }

  private isValidTransition(from: VoiceChatState, to: VoiceChatState): boolean {
    const validTransitions: Record<VoiceChatState, VoiceChatState[]> = {
      idle: ['initializing', 'call_active'],
      initializing: ['listening', 'error'],
      listening: ['processing', 'idle', 'error'],
      processing: ['speaking', 'idle', 'error'],
      speaking: ['listening', 'idle', 'error'],
      error: ['idle'],
      call_active: ['idle', 'error']
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  private performCleanup(): void {
    switch (this.state) {
      case 'idle':
        // Stop all activities
        this.context.isRecording = false;
        this.context.isTranscribing = false;
        this.context.isGeneratingResponse = false;
        this.context.isSpeaking = false;
        break;
      case 'error':
        // Stop everything on error
        this.context.isRecording = false;
        this.context.isTranscribing = false;
        this.context.isGeneratingResponse = false;
        this.context.isSpeaking = false;
        break;
    }
  }

  onStateChange(listener: (state: VoiceChatState, context: VoiceChatContext) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): VoiceChatState {
    return this.state;
  }

  getContext(): VoiceChatContext {
    return { ...this.context };
  }
}
```

##### **Интеграция в VoiceChat.tsx**
```typescript
// Заменить множественные useState на state machine
const stateMachineRef = useRef(new VoiceChatStateMachine());
const [currentState, setCurrentState] = useState<VoiceChatState>('idle');
const [context, setContext] = useState<VoiceChatContext>(stateMachineRef.current.getContext());

// Подписка на изменения состояния
useEffect(() => {
  const unsubscribe = stateMachineRef.current.onStateChange((state, newContext) => {
    setCurrentState(state);
    setContext(newContext);
  });

  return unsubscribe;
}, []);

// Упрощенные функции управления
const startListening = () => {
  stateMachineRef.current.transition('listening', { isRecording: true });
};

const stopListening = () => {
  stateMachineRef.current.transition('idle');
};

const handleError = (error: string) => {
  stateMachineRef.current.transition('error', { error });
};
```

#### **1.3 Error Handling & Resilience**

##### **Circuit Breaker Pattern**
```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  private readonly failureThreshold = 5;
  private readonly recoveryTimeout = 60000; // 1 minute

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): string {
    return this.state;
  }
}
```

##### **Retry Logic с Exponential Backoff**
```typescript
class RetryManager {
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}
```

##### **Graceful Degradation**
```typescript
class FeatureManager {
  private features = new Map<string, boolean>();

  constructor() {
    this.detectFeatures();
  }

  private detectFeatures(): void {
    // WebRTC support
    this.features.set('webrtc', !!(window.RTCPeerConnection || window.webkitRTCPeerConnection));

    // Speech Recognition
    this.features.set('speechRecognition', !!(
      window.SpeechRecognition ||
      window.webkitSpeechRecognition ||
      window.mozSpeechRecognition
    ));

    // Web Audio
    this.features.set('webAudio', !!(window.AudioContext || window.webkitAudioContext));

    // Hardware concurrency
    this.features.set('highPerformance', navigator.hardwareConcurrency >= 4);

    // Memory (rough estimate)
    this.features.set('sufficientMemory', navigator.deviceMemory >= 4);
  }

  isEnabled(feature: string): boolean {
    return this.features.get(feature) ?? false;
  }

  getDegradationLevel(): 'full' | 'basic' | 'minimal' {
    const features = Array.from(this.features.values());
    const enabledCount = features.filter(Boolean).length;

    if (enabledCount >= 4) return 'full';
    if (enabledCount >= 2) return 'basic';
    return 'minimal';
  }
}
```

### **Фаза 2: Браузерная Совместимость**

#### **2.1 Universal Speech Recognition Polyfill**
```typescript
class UniversalSpeechRecognition {
  private recognition: SpeechRecognition | null = null;
  private isWebkit = false;
  private isMozilla = false;

  constructor() {
    this.detectBrowser();
    this.initialize();
  }

  private detectBrowser(): void {
    const ua = navigator.userAgent.toLowerCase();
    this.isWebkit = ua.includes('webkit') && !ua.includes('edge');
    this.isMozilla = ua.includes('firefox');
  }

  private initialize(): void {
    const SpeechRecognitionClass =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition ||
      window.mozSpeechRecognition;

    if (!SpeechRecognitionClass) {
      throw new Error('Speech Recognition not supported');
    }

    this.recognition = new SpeechRecognitionClass();

    // Browser-specific optimizations
    if (this.isWebkit) {
      // Safari/WebKit specific settings
      this.recognition.continuous = false; // Safari has issues with continuous
      this.recognition.interimResults = false;
    } else if (this.isMozilla) {
      // Firefox specific settings
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
    } else {
      // Chrome/Edge
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
    }

    this.recognition.lang = 'ru-RU';
    this.recognition.maxAlternatives = 1;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        reject(new Error('Speech Recognition not initialized'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Speech Recognition timeout'));
      }, 10000);

      this.recognition.onstart = () => {
        clearTimeout(timeout);
        resolve();
      };

      this.recognition.onerror = (event) => {
        clearTimeout(timeout);
        reject(new Error(`Speech Recognition error: ${event.error}`));
      };

      this.recognition.start();
    });
  }

  stop(): void {
    this.recognition?.stop();
  }

  abort(): void {
    this.recognition?.abort();
  }

  onResult(handler: (event: SpeechRecognitionEvent) => void): void {
    if (this.recognition) {
      this.recognition.onresult = handler;
    }
  }

  onError(handler: (event: SpeechRecognitionErrorEvent) => void): void {
    if (this.recognition) {
      this.recognition.onerror = handler;
    }
  }

  onEnd(handler: () => void): void {
    if (this.recognition) {
      this.recognition.onend = handler;
    }
  }
}
```

#### **2.2 Enhanced Echo Detection System**
```typescript
class EnhancedEchoDetector {
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private frequencyData: Uint8Array;
  private timeData: Uint8Array;
  private ttsProfile: TTSProfile | null = null;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    const bufferLength = this.analyser.frequencyBinCount;
    this.frequencyData = new Uint8Array(bufferLength);
    this.timeData = new Uint8Array(bufferLength);
  }

  analyzeAudio(): AudioFeatures {
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.timeData);

    return {
      rms: this.calculateRMS(),
      spectralCentroid: this.calculateSpectralCentroid(),
      dominantFrequencies: this.findDominantFrequencies(),
      zeroCrossings: this.calculateZeroCrossings()
    };
  }

  detectEcho(ttsText: string, userInput: string, audioFeatures: AudioFeatures): EchoResult {
    const textSimilarity = this.calculateTextSimilarity(ttsText, userInput);
    const frequencySimilarity = this.ttsProfile ?
      this.calculateFrequencySimilarity(audioFeatures, this.ttsProfile) : 0;

    const combinedScore = (
      textSimilarity * 0.6 +
      frequencySimilarity * 0.4
    );

    return {
      isEcho: combinedScore > 0.7,
      confidence: combinedScore,
      methods: {
        text: textSimilarity > 0.6,
        frequency: frequencySimilarity > 0.8
      }
    };
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Levenshtein distance based similarity
    const distance = this.levenshteinDistance(text1.toLowerCase(), text2.toLowerCase());
    const maxLength = Math.max(text1.length, text2.length);
    return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
  }

  private calculateFrequencySimilarity(features: AudioFeatures, profile: TTSProfile): number {
    // Compare dominant frequencies
    let similarity = 0;
    const profileFreqs = profile.dominantFrequencies;

    features.dominantFrequencies.forEach(featureFreq => {
      const closest = profileFreqs.reduce((prev, curr) =>
        Math.abs(curr.frequency - featureFreq.frequency) < Math.abs(prev.frequency - featureFreq.frequency)
          ? curr : prev
      );

      const freqDiff = Math.abs(closest.frequency - featureFreq.frequency);
      const ampDiff = Math.abs(closest.amplitude - featureFreq.amplitude);

      if (freqDiff < 300) { // 300Hz tolerance
        similarity += (1 - freqDiff / 300) * (1 - Math.min(ampDiff, 1));
      }
    });

    return similarity / features.dominantFrequencies.length;
  }

  private calculateRMS(): number {
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const sample = (this.timeData[i] - 128) / 128; // Convert to -1 to 1
      sum += sample * sample;
    }
    return Math.sqrt(sum / this.timeData.length);
  }

  private calculateSpectralCentroid(): number {
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < this.frequencyData.length; i++) {
      const magnitude = this.frequencyData[i];
      const frequency = (i * this.audioContext.sampleRate) / (2 * this.frequencyData.length);

      numerator += frequency * magnitude;
      denominator += magnitude;
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private findDominantFrequencies(): Array<{frequency: number, amplitude: number}> {
    const peaks: Array<{frequency: number, amplitude: number}> = [];
    const minAmplitude = 180; // Threshold

    for (let i = 1; i < this.frequencyData.length - 1; i++) {
      const amplitude = this.frequencyData[i];
      const prevAmplitude = this.frequencyData[i - 1];
      const nextAmplitude = this.frequencyData[i + 1];

      if (amplitude > minAmplitude && amplitude > prevAmplitude && amplitude > nextAmplitude) {
        const frequency = (i * this.audioContext.sampleRate) / (2 * this.frequencyData.length);
        peaks.push({ frequency, amplitude });
      }
    }

    return peaks.slice(0, 5); // Top 5 peaks
  }

  private calculateZeroCrossings(): number {
    let crossings = 0;
    for (let i = 1; i < this.timeData.length; i++) {
      const current = this.timeData[i] - 128;
      const previous = this.timeData[i - 1] - 128;

      if ((current > 0 && previous <= 0) || (current < 0 && previous >= 0)) {
        crossings++;
      }
    }
    return crossings;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }
}
```

### **Фаза 3: Производительность и Мониторинг**

#### **3.1 Performance Monitoring**
```typescript
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private alerts: Map<string, (value: number) => void> = new Map();

  measure<T>(name: string, operation: () => T): T {
    const start = performance.now();
    try {
      const result = operation();
      const duration = performance.now() - start;
      this.recordMetric(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${name}_error`, duration);
      throw error;
    }
  }

  async measureAsync<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await operation();
      const duration = performance.now() - start;
      this.recordMetric(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${name}_error`, duration);
      throw error;
    }
  }

  private recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const values = this.metrics.get(name)!;
    values.push(value);

    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift();
    }

    // Check alerts
    const alertFn = this.alerts.get(name);
    if (alertFn) {
      alertFn(value);
    }
  }

  getAverage(name: string): number {
    const values = this.metrics.get(name) || [];
    return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
  }

  getPercentile(name: string, percentile: number): number {
    const values = [...(this.metrics.get(name) || [])].sort((a, b) => a - b);
    if (values.length === 0) return 0;

    const index = Math.floor((percentile / 100) * values.length);
    return values[Math.min(index, values.length - 1)];
  }

  setAlert(name: string, threshold: number, callback: (value: number) => void): void {
    this.alerts.set(name, (value) => {
      if (value > threshold) {
        callback(value);
      }
    });
  }

  getReport(): Record<string, any> {
    const report: Record<string, any> = {};

    for (const [name, values] of this.metrics) {
      report[name] = {
        count: values.length,
        average: this.getAverage(name),
        p50: this.getPercentile(name, 50),
        p95: this.getPercentile(name, 95),
        p99: this.getPercentile(name, 99),
        min: Math.min(...values),
        max: Math.max(...values)
      };
    }

    return report;
  }
}
```

#### **3.2 Memory Management**
```typescript
class MemoryManager {
  private cleanupTasks: Set<() => void> = new Set();
  private audioContexts: Set<AudioContext> = new Set();
  private mediaStreams: Set<MediaStream> = new Set();

  registerAudioContext(context: AudioContext): () => void {
    this.audioContexts.add(context);

    const cleanup = () => {
      this.audioContexts.delete(context);
      if (context.state !== 'closed') {
        context.close().catch(console.warn);
      }
    };

    this.cleanupTasks.add(cleanup);
    return cleanup;
  }

  registerMediaStream(stream: MediaStream): () => void {
    this.mediaStreams.add(stream);

    const cleanup = () => {
      this.mediaStreams.delete(stream);
      stream.getTracks().forEach(track => {
        track.stop();
      });
    };

    this.cleanupTasks.add(cleanup);
    return cleanup;
  }

  cleanup(): void {
    for (const cleanup of this.cleanupTasks) {
      try {
        cleanup();
      } catch (error) {
        console.warn('Cleanup error:', error);
      }
    }
    this.cleanupTasks.clear();
  }

  getMemoryUsage(): MemoryInfo {
    if ('memory' in performance) {
      const mem = (performance as any).memory;
      return {
        used: mem.usedJSHeapSize,
        total: mem.totalJSHeapSize,
        limit: mem.jsHeapSizeLimit,
        usagePercent: (mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100
      };
    }

    // Fallback for browsers without memory API
    return {
      used: 0,
      total: 0,
      limit: 0,
      usagePercent: 0
    };
  }

  scheduleCleanup(interval: number = 30000): void {
    setInterval(() => {
      const memoryUsage = this.getMemoryUsage();

      // Force cleanup if memory usage is high
      if (memoryUsage.usagePercent > 80) {
        console.warn('High memory usage detected, performing cleanup');
        this.cleanup();
      }
    }, interval);
  }
}

interface MemoryInfo {
  used: number;
  total: number;
  limit: number;
  usagePercent: number;
}
```

## 📋 Реализация по Фазам

### **Фаза 1: Критические Исправления (1-2 недели)**
1. **День 1-3**: WebRTC базовая инфраструктура
2. **День 4-5**: State machine рефакторинг
3. **День 6-7**: Error handling и resilience
4. **День 8-10**: Тестирование и интеграция

### **Фаза 2: Стабилизация (2-4 недели)**
1. **Неделя 1**: Браузерная совместимость
2. **Неделя 2**: Echo detection v2.0
3. **Неделя 3**: Производительность и мониторинг
4. **Неделя 4**: Интеграционное тестирование

### **Фаза 3: Оптимизация UX (2-3 недели)**
1. **Неделя 1**: UX/UI улучшения
2. **Неделя 2**: Offline режим и адаптивность
3. **Неделя 3**: Новые функции и финализация

### **Фаза 4: Масштабирование (3-4 недели)**
1. **Неделя 1**: Архитектурные улучшения
2. **Неделя 2**: Расширенная аналитика
3. **Неделя 3**: Автоматизированное тестирование
4. **Неделя 4**: Production readiness

## 🎯 Ключевые Риски и Решения

### **Технические Риски**
- **WebRTC complexity**: Начать с простого P2P, затем масштабировать
- **State management**: Использовать proven паттерны (state machine)
- **Browser compatibility**: Progressive enhancement с fallbacks

### **Проектные Риски**
- **Scope creep**: Фиксированные milestones с acceptance criteria
- **Resource constraints**: Prioritization matrix
- **Timeline delays**: Agile с 2-week sprints

## 📊 Успех Метрики

### **Технические**
- **Stability**: 98% successful interactions
- **Performance**: <100ms latency, <100MB memory
- **Compatibility**: 95% browser/device coverage

### **Бизнес**
- **User Satisfaction**: NPS >70
- **Retention**: 60% monthly retention
- **Support Tickets**: <5% of users

### **Разработка**
- **Code Coverage**: 80% automated tests
- **Deployment Success**: 95% successful deployments
- **Technical Debt**: <10% ratio
