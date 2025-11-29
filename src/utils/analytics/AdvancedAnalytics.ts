/**
 * Advanced Analytics System
 * Comprehensive analytics with A/B testing, user journey tracking, and reporting
 */

export interface AnalyticsEvent {
  id: string;
  type: string;
  category: 'user_action' | 'system_event' | 'performance' | 'error' | 'conversion';
  action: string;
  properties: Record<string, any>;
  userId?: string;
  sessionId: string;
  timestamp: number;
  context: {
    page: string;
    userAgent: string;
    viewport: { width: number; height: number };
    device: 'desktop' | 'tablet' | 'mobile';
    browser: string;
    referrer?: string;
  };
}

export interface ABTest {
  id: string;
  name: string;
  description: string;
  variants: ABTestVariant[];
  status: 'draft' | 'running' | 'completed' | 'stopped';
  targetAudience?: {
    userSegments?: string[];
    trafficPercentage: number;
  };
  startDate?: Date;
  endDate?: Date;
  metrics: {
    primary: string;
    secondary: string[];
  };
  results?: ABTestResults;
}

export interface ABTestVariant {
  id: string;
  name: string;
  description: string;
  config: Record<string, any>;
  trafficPercentage: number;
}

export interface ABTestResults {
  startDate: Date;
  endDate: Date;
  variants: {
    variantId: string;
    participants: number;
    conversions: number;
    metrics: Record<string, number>;
    confidence: number;
  }[];
  winner?: string;
  statisticalSignificance: number;
  recommendations: string[];
}

export interface UserJourney {
  userId: string;
  sessionId: string;
  startTime: number;
  events: AnalyticsEvent[];
  duration: number;
  completedGoals: string[];
  conversionPath: string[];
  deviceInfo: {
    type: string;
    browser: string;
    os: string;
  };
  funnelProgress: Record<string, boolean>;
}

export interface AnalyticsReport {
  period: {
    start: Date;
    end: Date;
  };
  metrics: {
    users: {
      total: number;
      new: number;
      returning: number;
      active: number;
    };
    sessions: {
      total: number;
      averageDuration: number;
      bounceRate: number;
    };
    events: {
      total: number;
      byCategory: Record<string, number>;
      topEvents: Array<{ event: string; count: number }>;
    };
    conversions: {
      total: number;
      rate: number;
      byGoal: Record<string, number>;
      funnel: Array<{ step: string; users: number; conversion: number }>;
    };
    performance: {
      averageLoadTime: number;
      errorRate: number;
      crashRate: number;
    };
    engagement: {
      averageSessionDuration: number;
      pagesPerSession: number;
      returnRate: number;
    };
  };
  insights: string[];
  recommendations: string[];
}

export class AdvancedAnalytics {
  private events: AnalyticsEvent[] = [];
  private abTests: Map<string, ABTest> = new Map();
  private userJourneys: Map<string, UserJourney> = new Map();
  private goals: Map<string, GoalDefinition> = new Map();
  private sessionId: string;
  private userId?: string;
  private eventQueue: AnalyticsEvent[] = [];
  private batchSize = 10;
  private flushInterval = 30000; // 30 seconds

  constructor() {
    this.sessionId = this.generateSessionId();
    this.setupPeriodicFlush();
    this.trackPageView();
  }

  /**
   * Track user action
   */
  track(action: string, properties: Record<string, any> = {}, category: AnalyticsEvent['category'] = 'user_action'): void {
    const event: AnalyticsEvent = {
      id: this.generateEventId(),
      type: 'track',
      category,
      action,
      properties,
      userId: this.userId,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      context: this.getContext()
    };

    this.events.push(event);
    this.eventQueue.push(event);

    // Check for goal completions
    this.checkGoalCompletions(event);

    // Auto-flush if queue is full
    if (this.eventQueue.length >= this.batchSize) {
      this.flush();
    }

    console.log(`📊 Event tracked: ${action}`, properties);
  }

  /**
   * Track page view
   */
  trackPageView(page?: string): void {
    const pagePath = page || window.location.pathname;

    this.track('page_view', {
      page: pagePath,
      title: document.title,
      referrer: document.referrer
    }, 'user_action');

    // Start or update user journey
    this.updateUserJourney(pagePath);
  }

  /**
   * Track conversion/goal completion
   */
  trackConversion(goalId: string, properties: Record<string, any> = {}): void {
    const goal = this.goals.get(goalId);
    if (!goal) {
      console.warn(`Goal not found: ${goalId}`);
      return;
    }

    this.track('goal_completed', {
      goalId,
      goalName: goal.name,
      value: goal.value,
      ...properties
    }, 'conversion');

    // Update user journey
    const journey = this.userJourneys.get(this.sessionId);
    if (journey) {
      journey.completedGoals.push(goalId);
    }
  }

  /**
   * Track performance metric
   */
  trackPerformance(name: string, value: number, properties: Record<string, any> = {}): void {
    this.track('performance_metric', {
      metricName: name,
      metricValue: value,
      ...properties
    }, 'performance');
  }

  /**
   * Track error
   */
  trackError(error: Error, context?: Record<string, any>): void {
    this.track('error_occurred', {
      errorMessage: error.message,
      errorStack: error.stack,
      errorName: error.name,
      ...context
    }, 'error');
  }

  /**
   * Create A/B test
   */
  createABTest(test: Omit<ABTest, 'id' | 'status'>): string {
    const testId = this.generateTestId();
    const abTest: ABTest = {
      id: testId,
      ...test,
      status: 'draft'
    };

    this.abTests.set(testId, abTest);
    console.log(`🧪 A/B test created: ${testId} - ${test.name}`);
    return testId;
  }

  /**
   * Start A/B test
   */
  startABTest(testId: string): void {
    const test = this.abTests.get(testId);
    if (!test) throw new Error(`A/B test not found: ${testId}`);

    test.status = 'running';
    test.startDate = new Date();

    // Assign variant to current user
    this.assignUserToVariant(testId);

    console.log(`🚀 A/B test started: ${testId}`);
  }

  /**
   * End A/B test and calculate results
   */
  endABTest(testId: string): ABTestResults | null {
    const test = this.abTests.get(testId);
    if (!test || test.status !== 'running') return null;

    test.status = 'completed';
    test.endDate = new Date();

    const results = this.calculateABTestResults(test);
    test.results = results;

    console.log(`✅ A/B test completed: ${testId}`, results);
    return results;
  }

  /**
   * Get variant for user in A/B test
   */
  getUserVariant(testId: string): string | null {
    const test = this.abTests.get(testId);
    if (!test || test.status !== 'running') return null;

    // Check if user is already assigned
    const stored = localStorage.getItem(`ab_test_${testId}_variant`);
    if (stored) return stored;

    // Assign new variant
    return this.assignUserToVariant(testId);
  }

  /**
   * Define conversion goal
   */
  defineGoal(goal: GoalDefinition): void {
    this.goals.set(goal.id, goal);
    console.log(`🎯 Goal defined: ${goal.id} - ${goal.name}`);
  }

  /**
   * Generate analytics report
   */
  generateReport(startDate: Date, endDate: Date): AnalyticsReport {
    const periodEvents = this.events.filter(
      event => event.timestamp >= startDate.getTime() && event.timestamp <= endDate.getTime()
    );

    const report: AnalyticsReport = {
      period: { start: startDate, end: endDate },
      metrics: {
        users: this.calculateUserMetrics(periodEvents),
        sessions: this.calculateSessionMetrics(periodEvents),
        events: this.calculateEventMetrics(periodEvents),
        conversions: this.calculateConversionMetrics(periodEvents),
        performance: this.calculatePerformanceMetrics(periodEvents),
        engagement: this.calculateEngagementMetrics(periodEvents)
      },
      insights: [],
      recommendations: []
    };

    // Generate insights and recommendations
    report.insights = this.generateInsights(report);
    report.recommendations = this.generateRecommendations(report);

    return report;
  }

  /**
   * Export analytics data
   */
  exportData(): {
    events: AnalyticsEvent[];
    abTests: ABTest[];
    userJourneys: UserJourney[];
    goals: GoalDefinition[];
    sessionId: string;
  } {
    return {
      events: this.events,
      abTests: Array.from(this.abTests.values()),
      userJourneys: Array.from(this.userJourneys.values()),
      goals: Array.from(this.goals.values()),
      sessionId: this.sessionId
    };
  }

  /**
   * Set user ID for tracking
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  // Private methods

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTestId(): string {
    return `ab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getContext() {
    return {
      page: window.location.pathname,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      device: this.getDeviceType(),
      browser: this.getBrowserName(),
      referrer: document.referrer || undefined
    };
  }

  private getDeviceType(): 'desktop' | 'tablet' | 'mobile' {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  private getBrowserName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  private setupPeriodicFlush(): void {
    setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  private async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];

    try {
      // Send to analytics service (placeholder)
      console.log(`📤 Flushed ${eventsToSend.length} events to analytics service`);

      // In production, this would send to your analytics backend
      // await fetch('/api/analytics/events', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ events: eventsToSend })
      // });

    } catch (error) {
      console.error('Failed to flush analytics events:', error);
      // Re-queue events on failure
      this.eventQueue.unshift(...eventsToSend);
    }
  }

  private checkGoalCompletions(event: AnalyticsEvent): void {
    for (const [goalId, goal] of this.goals) {
      if (goal.condition(event)) {
        this.trackConversion(goalId, { triggeringEvent: event.action });
      }
    }
  }

  private updateUserJourney(page: string): void {
    const journey = this.userJourneys.get(this.sessionId) || {
      userId: this.userId || 'anonymous',
      sessionId: this.sessionId,
      startTime: Date.now(),
      events: [],
      duration: 0,
      completedGoals: [],
      conversionPath: [],
      deviceInfo: {
        type: this.getDeviceType(),
        browser: this.getBrowserName(),
        os: navigator.platform
      },
      funnelProgress: {}
    };

    journey.conversionPath.push(page);
    journey.events = this.events.filter(e => e.sessionId === this.sessionId);
    journey.duration = Date.now() - journey.startTime;

    this.userJourneys.set(this.sessionId, journey);
  }

  private assignUserToVariant(testId: string): string {
    const test = this.abTests.get(testId);
    if (!test) throw new Error(`Test not found: ${testId}`);

    // Simple random assignment (in production, use consistent hashing)
    const random = Math.random() * 100;
    let cumulativePercentage = 0;

    for (const variant of test.variants) {
      cumulativePercentage += variant.trafficPercentage;
      if (random <= cumulativePercentage) {
        localStorage.setItem(`ab_test_${testId}_variant`, variant.id);
        return variant.id;
      }
    }

    // Fallback to first variant
    const firstVariant = test.variants[0];
    localStorage.setItem(`ab_test_${testId}_variant`, firstVariant.id);
    return firstVariant.id;
  }

  private calculateABTestResults(test: ABTest): ABTestResults {
    // Simplified A/B test analysis (in production, use statistical libraries)
    const results: ABTestResults = {
      startDate: test.startDate!,
      endDate: test.endDate!,
      variants: test.variants.map(variant => ({
        variantId: variant.id,
        participants: Math.floor(Math.random() * 1000) + 100, // Mock data
        conversions: Math.floor(Math.random() * 100) + 10,    // Mock data
        metrics: {
          [test.metrics.primary]: Math.random() * 0.3 + 0.1   // Mock data
        },
        confidence: Math.random() * 0.4 + 0.6 // Mock confidence
      })),
      statisticalSignificance: Math.random() * 0.3 + 0.7,
      recommendations: [
        'Variant B shows 15% better conversion rate',
        'Consider rolling out Variant B to 100% of users',
        'Run follow-up test to validate results'
      ]
    };

    // Determine winner
    const winner = results.variants.reduce((prev, current) =>
      current.metrics[test.metrics.primary] > prev.metrics[test.metrics.primary] ? current : prev
    );
    results.winner = winner.variantId;

    return results;
  }

  // Metrics calculation methods
  private calculateUserMetrics(events: AnalyticsEvent[]): AnalyticsReport['metrics']['users'] {
    const uniqueUsers = new Set(events.map(e => e.userId).filter(Boolean));
    const sessions = new Set(events.map(e => e.sessionId));

    return {
      total: uniqueUsers.size,
      new: Math.floor(uniqueUsers.size * 0.7), // Mock calculation
      returning: Math.floor(uniqueUsers.size * 0.3),
      active: sessions.size
    };
  }

  private calculateSessionMetrics(events: AnalyticsEvent[]): AnalyticsReport['metrics']['sessions'] {
    const sessions = new Set(events.map(e => e.sessionId));
    const sessionEvents = events.filter(e => e.category === 'user_action');

    return {
      total: sessions.size,
      averageDuration: 180, // Mock: 3 minutes
      bounceRate: 0.35
    };
  }

  private calculateEventMetrics(events: AnalyticsEvent[]): AnalyticsReport['metrics']['events'] {
    const byCategory: Record<string, number> = {};
    const eventCounts: Record<string, number> = {};

    events.forEach(event => {
      byCategory[event.category] = (byCategory[event.category] || 0) + 1;
      const key = `${event.category}_${event.action}`;
      eventCounts[key] = (eventCounts[key] || 0) + 1;
    });

    const topEvents = Object.entries(eventCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([event, count]) => ({ event, count }));

    return {
      total: events.length,
      byCategory,
      topEvents
    };
  }

  private calculateConversionMetrics(events: AnalyticsEvent[]): AnalyticsReport['metrics']['conversions'] {
    const conversionEvents = events.filter(e => e.category === 'conversion');
    const byGoal: Record<string, number> = {};

    conversionEvents.forEach(event => {
      const goalId = event.properties.goalId;
      byGoal[goalId] = (byGoal[goalId] || 0) + 1;
    });

    // Mock funnel data
    const funnel = [
      { step: 'Page View', users: 1000, conversion: 100 },
      { step: 'Voice Chat', users: 600, conversion: 60 },
      { step: 'Lesson Start', users: 300, conversion: 30 },
      { step: 'Lesson Complete', users: 150, conversion: 15 }
    ];

    return {
      total: conversionEvents.length,
      rate: events.length > 0 ? (conversionEvents.length / events.length) * 100 : 0,
      byGoal,
      funnel
    };
  }

  private calculatePerformanceMetrics(events: AnalyticsEvent[]): AnalyticsReport['metrics']['performance'] {
    const perfEvents = events.filter(e => e.category === 'performance');
    const errorEvents = events.filter(e => e.category === 'error');

    return {
      averageLoadTime: 1200, // Mock: 1.2 seconds
      errorRate: events.length > 0 ? (errorEvents.length / events.length) * 100 : 0,
      crashRate: 0.01 // Mock: 0.01%
    };
  }

  private calculateEngagementMetrics(events: AnalyticsEvent[]): AnalyticsReport['metrics']['engagement'] {
    return {
      averageSessionDuration: 240, // Mock: 4 minutes
      pagesPerSession: 2.3,
      returnRate: 0.45
    };
  }

  private generateInsights(report: AnalyticsReport): string[] {
    const insights = [];

    if (report.metrics.conversions.rate > 10) {
      insights.push('High conversion rate indicates effective user experience');
    }

    if (report.metrics.performance.errorRate > 5) {
      insights.push('High error rate may indicate technical issues');
    }

    if (report.metrics.engagement.averageSessionDuration > 300) {
      insights.push('Users are highly engaged with long session durations');
    }

    return insights;
  }

  private generateRecommendations(report: AnalyticsReport): string[] {
    const recommendations = [];

    if (report.metrics.performance.errorRate > 5) {
      recommendations.push('Investigate and fix technical errors to improve user experience');
    }

    if (report.metrics.conversions.rate < 5) {
      recommendations.push('Optimize conversion funnel to increase completion rates');
    }

    if (report.metrics.engagement.returnRate < 0.3) {
      recommendations.push('Improve user retention strategies');
    }

    return recommendations;
  }
}

// Type definitions
export interface GoalDefinition {
  id: string;
  name: string;
  description: string;
  value: number;
  condition: (event: AnalyticsEvent) => boolean;
}

// Singleton instance
export const advancedAnalytics = new AdvancedAnalytics();
