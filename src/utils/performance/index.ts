/**
 * Performance Module
 * Performance optimization and monitoring utilities
 */

// Performance Optimizer
export { PerformanceOptimizer, performanceOptimizer } from './PerformanceOptimizer';
export type { PerformanceMetrics, PerformanceConfig } from './PerformanceOptimizer';

// Lazy Loader
export { LazyLoader, lazyLoader } from './LazyLoader';
export {
  createComponentLoader,
  createResourceLoader,
  lazyLoadComponent,
  lazyLoadResource,
  lazyLoadOnVisible
} from './LazyLoader';
export type { LazyLoadConfig, LazyLoadable } from './LazyLoader';

// Performance monitoring utilities
export function createPerformanceMonitor(): PerformanceObserver | null {
  if (!('PerformanceObserver' in window)) {
    console.warn('PerformanceObserver not supported');
    return null;
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      console.log(`📊 Performance: ${entry.name} - ${entry.duration.toFixed(2)}ms`);
    }
  });

  // Observe various performance metrics
  observer.observe({ entryTypes: ['measure', 'navigation', 'resource'] });

  return observer;
}

export function measurePerformance(
  name: string,
  fn: () => void | Promise<void>
): Promise<{ duration: number; result?: any }> {
  return new Promise(async (resolve) => {
    const start = performance.now();

    try {
      const result = await fn();
      const duration = performance.now() - start;

      // Use Performance API if available
      if ('mark' in performance) {
        performance.mark(`${name}-end`);
        performance.measure(name, `${name}-start`, `${name}-end`);
      }

      resolve({ duration, result });
    } catch (error) {
      const duration = performance.now() - start;
      console.error(`Performance measurement failed for ${name}:`, error);
      resolve({ duration });
    }
  });
}

export function getMemoryUsage(): {
  used: number;
  total: number;
  limit: number;
  percentage: number;
} | null {
  if (!('memory' in performance)) {
    return null;
  }

  const mem = (performance as any).memory;
  return {
    used: mem.usedJSHeapSize,
    total: mem.totalJSHeapSize,
    limit: mem.jsHeapSizeLimit,
    percentage: (mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100
  };
}

export function createResourceHints(): void {
  const hints = [
    // DNS prefetch for external services
    { rel: 'dns-prefetch', href: '//fonts.googleapis.com' },
    { rel: 'dns-prefetch', href: '//fonts.gstatic.com' },

    // Preconnect to critical origins
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com' },

    // Preload critical resources
    { rel: 'preload', href: '/audio/notification.mp3', as: 'audio' },
    { rel: 'preload', href: '/video/avatar.webm', as: 'video' }
  ];

  hints.forEach(hint => {
    const link = document.createElement('link');
    Object.assign(link, hint);
    document.head.appendChild(link);
  });
}

export function optimizeForLowEndDevice(): void {
  const capabilities = navigator.hardwareConcurrency || 2;
  const memory = (navigator as any).deviceMemory || 2;

  if (capabilities < 4 || memory < 4) {
    console.log('📱 Optimizing for low-end device');

    // Reduce visual effects
    document.documentElement.style.setProperty('--animation-duration', '0.2s');
    document.documentElement.style.setProperty('--particle-count', '25');

    // Disable heavy features
    (window as any).LOW_END_DEVICE = true;

    // Reduce canvas quality
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        (ctx as any).imageSmoothingEnabled = false;
      }
    });
  }
}

export function setupPerformanceReporting(): void {
  // Report performance metrics to analytics
  const reportMetrics = () => {
    const memory = getMemoryUsage();
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

    const metrics = {
      memory,
      navigation: {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        totalTime: navigation.loadEventEnd - navigation.fetchStart
      },
      timestamp: Date.now()
    };

    // Send to analytics (placeholder)
    console.log('📊 Performance metrics:', metrics);

    // In production, send to your analytics service
    // analytics.track('performance_metrics', metrics);
  };

  // Report after page load
  if (document.readyState === 'complete') {
    setTimeout(reportMetrics, 1000);
  } else {
    window.addEventListener('load', () => {
      setTimeout(reportMetrics, 1000);
    });
  }

  // Periodic reporting
  setInterval(reportMetrics, 30000); // Every 30 seconds
}
