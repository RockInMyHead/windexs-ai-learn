/**
 * Performance Optimizer
 * Comprehensive performance optimization system
 */

import { browserDetector } from '../browserCompatibility/browserDetector';

export interface PerformanceMetrics {
  timestamp: number;
  memoryUsage: number;
  cpuUsage: number;
  fps: number;
  networkLatency: number;
  audioLatency: number;
  renderTime: number;
}

export interface PerformanceConfig {
  targetFPS: number;
  maxMemoryUsage: number; // MB
  maxAudioLatency: number; // ms
  enableWorkerOffloading: boolean;
  enableMemoryOptimization: boolean;
  enableAdaptiveQuality: boolean;
}

export class PerformanceOptimizer {
  private config: PerformanceConfig;
  private metrics: PerformanceMetrics[] = [];
  private observers: PerformanceObserver[] = [];
  private workers: Map<string, Worker> = new Map();
  private memoryCleanupTasks: (() => void)[] = [];
  private animationFrame: number | null = null;
  private lastFrameTime = 0;
  private frameCount = 0;

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      targetFPS: 60,
      maxMemoryUsage: 150, // MB
      maxAudioLatency: 100, // ms
      enableWorkerOffloading: browserDetector.getCapabilities().webWorkers,
      enableMemoryOptimization: true,
      enableAdaptiveQuality: true,
      ...config
    };

    this.initializePerformanceMonitoring();
  }

  /**
   * Initialize performance monitoring
   */
  private initializePerformanceMonitoring(): void {
    if ('PerformanceObserver' in window) {
      // Monitor long tasks
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) { // Tasks longer than 50ms
            console.warn(`🚨 Long task detected: ${entry.duration.toFixed(2)}ms`);
            this.optimizeForLongTask();
          }
        }
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
      this.observers.push(longTaskObserver);

      // Monitor layout shifts
      const layoutShiftObserver = new PerformanceObserver((list) => {
        let totalShift = 0;
        for (const entry of list.getEntries()) {
          totalShift += (entry as any).value;
        }
        if (totalShift > 0.1) {
          console.warn(`🎭 Layout shift detected: ${(totalShift * 100).toFixed(2)}%`);
        }
      });
      layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(layoutShiftObserver);
    }

    // Start FPS monitoring
    this.startFPSMonitoring();

    // Memory monitoring
    this.startMemoryMonitoring();
  }

  /**
   * Monitor FPS
   */
  private startFPSMonitoring(): void {
    const updateFPS = (currentTime: number) => {
      this.frameCount++;

      if (currentTime - this.lastFrameTime >= 1000) {
        const fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFrameTime));

        if (fps < this.config.targetFPS - 10) {
          console.warn(`🐌 Low FPS detected: ${fps}`);
          this.optimizeForLowFPS();
        }

        this.frameCount = 0;
        this.lastFrameTime = currentTime;
      }

      this.animationFrame = requestAnimationFrame(updateFPS);
    };

    this.animationFrame = requestAnimationFrame(updateFPS);
  }

  /**
   * Monitor memory usage
   */
  private startMemoryMonitoring(): void {
    const checkMemory = () => {
      if ('memory' in performance) {
        const memInfo = (performance as any).memory;
        const memoryUsageMB = memInfo.usedJSHeapSize / (1024 * 1024);

        if (memoryUsageMB > this.config.maxMemoryUsage) {
          console.warn(`💾 High memory usage: ${memoryUsageMB.toFixed(1)}MB`);
          this.performMemoryCleanup();
        }

        // Store metrics
        this.recordMetrics({
          timestamp: Date.now(),
          memoryUsage: memoryUsageMB,
          cpuUsage: 0, // Would need additional monitoring
          fps: 0,
          networkLatency: 0,
          audioLatency: 0,
          renderTime: 0
        });
      }
    };

    // Check memory every 30 seconds
    setInterval(checkMemory, 30000);
  }

  /**
   * Optimize for low FPS
   */
  private optimizeForLowFPS(): void {
    if (!this.config.enableAdaptiveQuality) return;

    console.log('🎯 Optimizing for low FPS...');

    // Reduce canvas quality
    this.optimizeCanvasRendering();

    // Throttle animations
    this.throttleAnimations();

    // Reduce particle effects
    this.reduceVisualEffects();
  }

  /**
   * Optimize for long tasks
   */
  private optimizeForLongTask(): void {
    console.log('🎯 Optimizing for long tasks...');

    // Move heavy computations to Web Workers
    this.offloadHeavyComputations();

    // Debounce user interactions
    this.debounceUserInteractions();

    // Preload critical resources
    this.preloadCriticalResources();
  }

  /**
   * Perform memory cleanup
   */
  private performMemoryCleanup(): void {
    if (!this.config.enableMemoryOptimization) return;

    console.log('🧹 Performing memory cleanup...');

    // Execute cleanup tasks
    this.memoryCleanupTasks.forEach(task => {
      try {
        task();
      } catch (error) {
        console.warn('Memory cleanup task failed:', error);
      }
    });

    this.memoryCleanupTasks = [];

    // Force garbage collection if available
    if ('gc' in window) {
      (window as any).gc();
    }

    // Clear unused caches
    this.clearUnusedCaches();
  }

  /**
   * Offload heavy computations to Web Workers
   */
  private offloadHeavyComputations(): void {
    if (!this.config.enableWorkerOffloading) return;

    // Example: Move audio processing to worker
    this.createWorker('audio-processor', `
      self.onmessage = function(e) {
        const { type, data } = e.data;

        if (type === 'process-audio') {
          // Heavy audio processing
          const result = performHeavyAudioProcessing(data);
          self.postMessage({ type: 'processed', result });
        }
      };

      function performHeavyAudioProcessing(data) {
        // Simulate heavy processing
        let result = 0;
        for (let i = 0; i < data.length; i++) {
          result += Math.sin(data[i]) * Math.cos(data[i]);
        }
        return result;
      }
    `);
  }

  /**
   * Optimize canvas rendering
   */
  private optimizeCanvasRendering(): void {
    // Find all canvases and optimize
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Disable image smoothing for better performance
        (ctx as any).imageSmoothingEnabled = false;

        // Use lower quality for faster rendering
        ctx.globalCompositeOperation = 'source-over';
      }
    });
  }

  /**
   * Throttle animations
   */
  private throttleAnimations(): void {
    // Reduce animation frame rate
    const throttledRequestAnimationFrame = (callback: FrameRequestCallback) => {
      let lastCall = 0;
      return () => {
        const now = Date.now();
        if (now - lastCall >= 32) { // ~30 FPS instead of 60
          lastCall = now;
          callback(now);
        }
      };
    };

    // Override global rAF (careful!)
    (window as any).originalRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = throttledRequestAnimationFrame(() => {});
  }

  /**
   * Reduce visual effects
   */
  private reduceVisualEffects(): void {
    // Disable heavy CSS animations
    document.documentElement.style.setProperty('--animation-duration', '0.3s');

    // Reduce particle count in visual effects
    const visualElements = document.querySelectorAll('[data-visual-effect]');
    visualElements.forEach(el => {
      el.setAttribute('data-reduced-quality', 'true');
    });
  }

  /**
   * Create Web Worker
   */
  createWorker(name: string, code: string): Worker {
    if (!this.config.enableWorkerOffloading) {
      throw new Error('Web Workers are disabled');
    }

    const blob = new Blob([code], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    this.workers.set(name, worker);

    // Handle worker messages
    worker.onmessage = (e) => {
      console.log(`📨 Worker ${name} message:`, e.data);
    };

    worker.onerror = (error) => {
      console.error(`❌ Worker ${name} error:`, error);
    };

    return worker;
  }

  /**
   * Register memory cleanup task
   */
  registerMemoryCleanup(task: () => void): () => void {
    this.memoryCleanupTasks.push(task);

    // Return unsubscribe function
    return () => {
      const index = this.memoryCleanupTasks.indexOf(task);
      if (index > -1) {
        this.memoryCleanupTasks.splice(index, 1);
      }
    };
  }

  /**
   * Record performance metrics
   */
  recordMetrics(metrics: Partial<PerformanceMetrics>): void {
    const fullMetrics: PerformanceMetrics = {
      timestamp: Date.now(),
      memoryUsage: 0,
      cpuUsage: 0,
      fps: 0,
      networkLatency: 0,
      audioLatency: 0,
      renderTime: 0,
      ...metrics
    };

    this.metrics.push(fullMetrics);

    // Keep only last 100 measurements
    if (this.metrics.length > 100) {
      this.metrics.shift();
    }
  }

  /**
   * Get performance report
   */
  getPerformanceReport(): {
    current: PerformanceMetrics | null;
    average: Partial<PerformanceMetrics>;
    issues: string[];
  } {
    const current = this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;

    const average = this.metrics.length > 0 ? {
      memoryUsage: this.metrics.reduce((sum, m) => sum + m.memoryUsage, 0) / this.metrics.length,
      cpuUsage: this.metrics.reduce((sum, m) => sum + m.cpuUsage, 0) / this.metrics.length,
      fps: this.metrics.reduce((sum, m) => sum + m.fps, 0) / this.metrics.length,
      networkLatency: this.metrics.reduce((sum, m) => sum + m.networkLatency, 0) / this.metrics.length,
      audioLatency: this.metrics.reduce((sum, m) => sum + m.audioLatency, 0) / this.metrics.length,
      renderTime: this.metrics.reduce((sum, m) => sum + m.renderTime, 0) / this.metrics.length
    } : {};

    const issues: string[] = [];

    if (current) {
      if (current.memoryUsage > this.config.maxMemoryUsage) {
        issues.push(`High memory usage: ${current.memoryUsage.toFixed(1)}MB`);
      }
      if (current.fps < this.config.targetFPS - 10) {
        issues.push(`Low FPS: ${current.fps}`);
      }
      if (current.audioLatency > this.config.maxAudioLatency) {
        issues.push(`High audio latency: ${current.audioLatency}ms`);
      }
    }

    return { current, average, issues };
  }

  /**
   * Clear unused caches
   */
  private clearUnusedCaches(): void {
    // Clear blob URLs
    // Note: This is a simplified example
    if ('URL' in window && 'revokeObjectURL' in window.URL) {
      // In a real implementation, you'd track created blob URLs
    }
  }

  /**
   * Debounce user interactions
   */
  private debounceUserInteractions(): void {
    // Implement debouncing for frequent events
    const originalAddEventListener = EventTarget.prototype.addEventListener;

    EventTarget.prototype.addEventListener = function(
      type: string,
      listener: EventListener,
      options?: boolean | AddEventListenerOptions
    ) {
      if (['click', 'input', 'scroll'].includes(type)) {
        // Wrap listener with debouncing
        const debouncedListener = debounce(listener as EventListener, 16); // ~60fps
        return originalAddEventListener.call(this, type, debouncedListener, options);
      }

      return originalAddEventListener.call(this, type, listener, options);
    };
  }

  /**
   * Preload critical resources
   */
  private preloadCriticalResources(): void {
    // Preload critical audio/video resources
    const criticalResources = [
      '/audio/notification.mp3',
      '/video/avatar.webm'
    ];

    criticalResources.forEach(url => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = url;
      link.as = url.endsWith('.mp3') ? 'audio' : 'video';
      document.head.appendChild(link);
    });
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    // Stop monitoring
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    // Close observers
    this.observers.forEach(observer => observer.disconnect());

    // Terminate workers
    this.workers.forEach(worker => worker.terminate());

    // Clear cleanup tasks
    this.memoryCleanupTasks = [];

    console.log('🧹 Performance optimizer destroyed');
  }
}

// Utility functions
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Singleton instance
export const performanceOptimizer = new PerformanceOptimizer();
