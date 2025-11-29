/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by temporarily stopping operations
 */

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  name: string;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private nextAttemptTime = 0;

  constructor(private config: CircuitBreakerConfig) {
    this.config = {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      monitoringPeriod: 10000, // 10 seconds
      name: 'default',
      ...config
    };
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker ${this.config.name} is OPEN`);
      }
      this.state = 'half-open';
      console.log(`🔄 Circuit breaker ${this.config.name} entering HALF-OPEN state`);
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

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.failures = 0;
    this.successCount++;

    if (this.state === 'half-open') {
      this.state = 'closed';
      console.log(`✅ Circuit breaker ${this.config.name} recovered to CLOSED state`);
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
      console.warn(`🚨 Circuit breaker ${this.config.name} opened after ${this.failures} failures`);
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      state: this.state,
      failures: this.failures,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      timeToNextAttempt: Math.max(0, this.nextAttemptTime - Date.now())
    };
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    console.log(`🔄 Circuit breaker ${this.config.name} reset to CLOSED state`);
  }

  /**
   * Force open circuit breaker
   */
  forceOpen(): void {
    this.state = 'open';
    this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
    console.log(`🚫 Circuit breaker ${this.config.name} force opened`);
  }

  /**
   * Force close circuit breaker
   */
  forceClose(): void {
    this.state = 'closed';
    this.failures = 0;
    console.log(`✅ Circuit breaker ${this.config.name} force closed`);
  }
}
