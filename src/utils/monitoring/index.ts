/**
 * Monitoring Module
 * Error tracking, performance monitoring, and alerting
 */

// Monitoring System
export { MonitoringSystem, monitoringSystem } from './MonitoringSystem';
export type {
  MonitoringConfig,
  MonitoringEvent,
  AlertRule,
  AlertData
} from './MonitoringSystem';

// Utility functions
export {
  captureError,
  capturePerformanceMetric,
  captureUserAction,
  captureSystemEvent
} from './MonitoringSystem';

// Monitoring Dashboard Component
export { default as MonitoringDashboard } from '../../components/MonitoringDashboard';

// Setup functions
export function initializeMonitoring(config?: Partial<import('./MonitoringSystem').MonitoringConfig>) {
  const monitoring = new MonitoringSystem(config);
  return monitoring.initialize();
}

export function setupGlobalMonitoring() {
  // Initialize monitoring with default config
  monitoringSystem.initialize().catch(error => {
    console.error('Failed to initialize monitoring:', error);
  });

  // Setup global error handlers
  window.addEventListener('error', (event) => {
    monitoringSystem.captureError(new Error(event.message), {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    monitoringSystem.captureError(new Error('Unhandled promise rejection'), {
      reason: event.reason
    });
  });

  // Performance monitoring
  if ('PerformanceObserver' in window) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 100) { // Long tasks > 100ms
          monitoringSystem.capturePerformanceMetric('long_task', entry.duration, {
            name: entry.name,
            startTime: entry.startTime
          });
        }
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  }

  console.log('📊 Global monitoring setup complete');
}

// Alert presets
export const createAlertPresets = () => {
  return {
    highMemoryUsage: {
      id: 'high_memory_usage',
      name: 'High Memory Usage',
      condition: (metrics: any) => metrics.memoryUsage > 150,
      severity: 'high' as const,
      cooldown: 300000, // 5 minutes
      action: (alert: any) => {
        console.warn('🚨 HIGH MEMORY ALERT:', alert);
        // Force garbage collection if available
        if ('gc' in window) {
          (window as any).gc();
        }
      }
    },

    highErrorRate: {
      id: 'high_error_rate',
      name: 'High Error Rate',
      condition: (metrics: any) => metrics.errorRate > 5,
      severity: 'critical' as const,
      cooldown: 600000, // 10 minutes
      action: (alert: any) => {
        console.error('🚨 CRITICAL ERROR RATE ALERT:', alert);
        // Could send notification to dev team
      }
    },

    slowResponseTime: {
      id: 'slow_response_time',
      name: 'Slow Response Time',
      condition: (metrics: any) => metrics.responseTime > 3000,
      severity: 'medium' as const,
      cooldown: 120000, // 2 minutes
      action: (alert: any) => {
        console.warn('⚠️ SLOW RESPONSE ALERT:', alert);
      }
    },

    lowFPS: {
      id: 'low_fps',
      name: 'Low FPS',
      condition: (metrics: any) => metrics.fps < 30,
      severity: 'medium' as const,
      cooldown: 60000, // 1 minute
      action: (alert: any) => {
        console.warn('🐌 LOW FPS ALERT:', alert);
      }
    }
  };
};

// Quick setup for development
export function setupDevelopmentMonitoring() {
  const alertPresets = createAlertPresets();

  // Add alert rules
  Object.values(alertPresets).forEach(preset => {
    monitoringSystem.addAlertRule(preset);
  });

  // Setup global monitoring
  setupGlobalMonitoring();

  console.log('🛠️ Development monitoring setup complete');
}
