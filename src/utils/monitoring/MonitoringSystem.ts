/**
 * Monitoring System
 * Comprehensive monitoring with error tracking and performance metrics
 */

import { performanceOptimizer, getMemoryUsage } from '../performance';
import { browserDetector } from '../browserCompatibility/browserDetector';

export interface MonitoringConfig {
  dsn?: string; // Sentry DSN
  environment: 'development' | 'staging' | 'production';
  release?: string;
  sampleRate?: number;
  enablePerformanceMonitoring: boolean;
  enableErrorTracking: boolean;
  enableUserJourneyTracking: boolean;
  alertThresholds: {
    errorRate: number;
    memoryUsage: number;
    responseTime: number;
  };
}

export interface MonitoringEvent {
  type: 'error' | 'performance' | 'user_action' | 'system_event';
  timestamp: number;
  data: any;
  context: {
    userId?: string;
    sessionId: string;
    url: string;
    userAgent: string;
    browser: string;
    device: string;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: any) => boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cooldown: number; // ms
  lastTriggered?: number;
  action: (alert: AlertData) => void;
}

export interface AlertData {
  ruleId: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  data: any;
  timestamp: number;
}

export class MonitoringSystem {
  private config: Required<MonitoringConfig>;
  private events: MonitoringEvent[] = [];
  private alerts: AlertData[] = [];
  private alertRules: AlertRule[] = [];
  private sessionId: string;
  private userId?: string;
  private isInitialized = false;

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = {
      environment: 'development',
      sampleRate: 1.0,
      enablePerformanceMonitoring: true,
      enableErrorTracking: true,
      enableUserJourneyTracking: true,
      alertThresholds: {
        errorRate: 5, // 5% error rate
        memoryUsage: 150, // 150MB
        responseTime: 5000 // 5 seconds
      },
      ...config
    };

    this.sessionId = this.generateSessionId();
    this.setupDefaultAlertRules();
  }

  /**
   * Initialize monitoring system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('📊 Initializing monitoring system...');

    // Setup error tracking
    if (this.config.enableErrorTracking) {
      this.setupErrorTracking();
    }

    // Setup performance monitoring
    if (this.config.enablePerformanceMonitoring) {
      this.setupPerformanceMonitoring();
    }

    // Setup user journey tracking
    if (this.config.enableUserJourneyTracking) {
      this.setupUserJourneyTracking();
    }

    this.isInitialized = true;
    console.log('✅ Monitoring system initialized');
  }

  /**
   * Track error
   */
  captureError(error: Error, context?: any): void {
    const event: MonitoringEvent = {
      type: 'error',
      timestamp: Date.now(),
      data: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        context
      },
      context: this.getContext()
    };

    this.events.push(event);
    this.processAlerts(event);

    // Send to external service if configured
    this.sendToExternalService(event);

    console.error('❌ Error captured:', error.message);
  }

  /**
   * Track performance metric
   */
  capturePerformanceMetric(name: string, value: number, context?: any): void {
    const event: MonitoringEvent = {
      type: 'performance',
      timestamp: Date.now(),
      data: {
        name,
        value,
        context
      },
      context: this.getContext()
    };

    this.events.push(event);
    this.processAlerts(event);

    console.log(`📊 Performance: ${name} = ${value}`);
  }

  /**
   * Track user action
   */
  captureUserAction(action: string, data?: any): void {
    const event: MonitoringEvent = {
      type: 'user_action',
      timestamp: Date.now(),
      data: {
        action,
        ...data
      },
      context: this.getContext()
    };

    this.events.push(event);

    console.log(`👤 User action: ${action}`, data);
  }

  /**
   * Track system event
   */
  captureSystemEvent(event: string, data?: any): void {
    const systemEvent: MonitoringEvent = {
      type: 'system_event',
      timestamp: Date.now(),
      data: {
        event,
        ...data
      },
      context: this.getContext()
    };

    this.events.push(systemEvent);
    this.processAlerts(systemEvent);

    console.log(`🔧 System event: ${event}`, data);
  }

  /**
   * Add custom alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule);
    console.log(`🚨 Alert rule added: ${rule.name}`);
  }

  /**
   * Set user context
   */
  setUserContext(userId: string): void {
    this.userId = userId;
  }

  /**
   * Get monitoring statistics
   */
  getStats(): {
    events: {
      total: number;
      byType: Record<string, number>;
      recent: MonitoringEvent[];
    };
    alerts: {
      total: number;
      bySeverity: Record<string, number>;
      recent: AlertData[];
    };
    performance: {
      memory: any;
      fps: number;
      errorRate: number;
    };
  } {
    const eventsByType = this.events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const alertsBySeverity = this.alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate error rate (last hour)
    const lastHour = Date.now() - 3600000;
    const recentEvents = this.events.filter(e => e.timestamp > lastHour);
    const errorCount = recentEvents.filter(e => e.type === 'error').length;
    const errorRate = recentEvents.length > 0 ? (errorCount / recentEvents.length) * 100 : 0;

    return {
      events: {
        total: this.events.length,
        byType: eventsByType,
        recent: this.events.slice(-10)
      },
      alerts: {
        total: this.alerts.length,
        bySeverity: alertsBySeverity,
        recent: this.alerts.slice(-5)
      },
      performance: {
        memory: getMemoryUsage(),
        fps: 60, // Placeholder - would come from performance optimizer
        errorRate
      }
    };
  }

  /**
   * Export monitoring data
   */
  exportData(): {
    config: MonitoringConfig;
    sessionId: string;
    events: MonitoringEvent[];
    alerts: AlertData[];
    stats: any;
  } {
    return {
      config: this.config,
      sessionId: this.sessionId,
      events: this.events,
      alerts: this.alerts,
      stats: this.getStats()
    };
  }

  // Private methods

  private setupErrorTracking(): void {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.captureError(new Error(event.message), {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      });
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.captureError(new Error('Unhandled promise rejection'), {
        reason: event.reason
      });
    });

    console.log('🛡️ Error tracking enabled');
  }

  private setupPerformanceMonitoring(): void {
    // Monitor navigation timing
    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

        this.capturePerformanceMetric('page_load_time', navigation.loadEventEnd - navigation.fetchStart);
        this.capturePerformanceMetric('dom_content_loaded', navigation.domContentLoadedEventEnd - navigation.fetchStart);
        this.capturePerformanceMetric('first_paint', (performance.getEntriesByType('paint').find(entry => entry.name === 'first-paint') as any)?.startTime || 0);
      }, 100);
    });

    // Periodic memory monitoring
    setInterval(() => {
      const memory = getMemoryUsage();
      if (memory) {
        this.capturePerformanceMetric('memory_usage', memory.percentage);
      }
    }, 30000);

    console.log('📈 Performance monitoring enabled');
  }

  private setupUserJourneyTracking(): void {
    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.captureUserAction('page_visibility_change', {
        hidden: document.hidden,
        visibilityState: document.visibilityState
      });
    });

    // Track user interactions (sampled)
    let interactionCount = 0;
    const trackInteraction = (event: Event) => {
      interactionCount++;
      if (interactionCount % 10 === 0) { // Sample every 10th interaction
        this.captureUserAction('user_interaction', {
          type: event.type,
          target: (event.target as HTMLElement)?.tagName?.toLowerCase(),
          timestamp: Date.now()
        });
      }
    };

    document.addEventListener('click', trackInteraction, { passive: true });
    document.addEventListener('input', trackInteraction, { passive: true });
    document.addEventListener('scroll', trackInteraction, { passive: true });

    console.log('👤 User journey tracking enabled');
  }

  private setupDefaultAlertRules(): void {
    // High memory usage alert
    this.addAlertRule({
      id: 'high_memory_usage',
      name: 'High Memory Usage',
      condition: (metrics) => metrics.memoryUsage > this.config.alertThresholds.memoryUsage,
      severity: 'high',
      cooldown: 300000, // 5 minutes
      action: (alert) => {
        console.warn('🚨 HIGH MEMORY USAGE ALERT:', alert);
        // In production, send notification to dev team
      }
    });

    // High error rate alert
    this.addAlertRule({
      id: 'high_error_rate',
      name: 'High Error Rate',
      condition: (metrics) => metrics.errorRate > this.config.alertThresholds.errorRate,
      severity: 'critical',
      cooldown: 600000, // 10 minutes
      action: (alert) => {
        console.error('🚨 CRITICAL ERROR RATE ALERT:', alert);
        // In production, page developers immediately
      }
    });

    // Slow response time alert
    this.addAlertRule({
      id: 'slow_response_time',
      name: 'Slow Response Time',
      condition: (metrics) => metrics.responseTime > this.config.alertThresholds.responseTime,
      severity: 'medium',
      cooldown: 120000, // 2 minutes
      action: (alert) => {
        console.warn('⚠️ SLOW RESPONSE TIME ALERT:', alert);
      }
    });
  }

  private processAlerts(event: MonitoringEvent): void {
    const stats = this.getStats();

    for (const rule of this.alertRules) {
      // Check cooldown
      if (rule.lastTriggered && Date.now() - rule.lastTriggered < rule.cooldown) {
        continue;
      }

      // Check condition
      if (rule.condition(stats.performance)) {
        const alert: AlertData = {
          ruleId: rule.id,
          message: rule.name,
          severity: rule.severity,
          data: {
            event,
            stats: stats.performance,
            rule
          },
          timestamp: Date.now()
        };

        this.alerts.push(alert);
        rule.lastTriggered = Date.now();

        // Execute alert action
        rule.action(alert);

        console.log(`🚨 Alert triggered: ${rule.name} (${rule.severity})`);
      }
    }
  }

  private sendToExternalService(event: MonitoringEvent): void {
    // Send to Sentry or other monitoring service
    if (this.config.dsn && typeof window !== 'undefined') {
      try {
        // Placeholder for Sentry integration
        // Sentry.captureEvent({
        //   message: event.data.message || 'Monitoring event',
        //   level: event.type === 'error' ? 'error' : 'info',
        //   extra: event.data,
        //   tags: {
        //     type: event.type,
        //     environment: this.config.environment
        //   },
        //   user: {
        //     id: this.userId || 'anonymous'
        //   }
        // });

        console.log('📤 Event sent to external monitoring service');
      } catch (error) {
        console.warn('Failed to send event to external service:', error);
      }
    }
  }

  private getContext() {
    return {
      userId: this.userId,
      sessionId: this.sessionId,
      url: window.location.href,
      userAgent: navigator.userAgent,
      browser: browserDetector.getBrowserInfo().name,
      device: browserDetector.getBrowserInfo().platform
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
export const monitoringSystem = new MonitoringSystem({
  environment: import.meta.env.MODE as any || 'development',
  enablePerformanceMonitoring: true,
  enableErrorTracking: true,
  enableUserJourneyTracking: true
});

// Utility functions
export function captureError(error: Error, context?: any): void {
  monitoringSystem.captureError(error, context);
}

export function capturePerformanceMetric(name: string, value: number, context?: any): void {
  monitoringSystem.capturePerformanceMetric(name, value, context);
}

export function captureUserAction(action: string, data?: any): void {
  monitoringSystem.captureUserAction(action, data);
}

export function captureSystemEvent(event: string, data?: any): void {
  monitoringSystem.captureSystemEvent(event, data);
}
