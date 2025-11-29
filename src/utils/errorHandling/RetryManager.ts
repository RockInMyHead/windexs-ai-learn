/**
 * Retry Manager with Exponential Backoff
 * Handles transient failures with intelligent retry logic
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  jitter: boolean;
  retryCondition?: (error: Error) => boolean;
}

export interface RetryAttempt {
  attempt: number;
  delay: number;
  timestamp: number;
  error?: Error;
}

export class RetryManager {
  private config: Required<RetryConfig>;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      jitter: true,
      retryCondition: this.defaultRetryCondition,
      ...config
    };
  }

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.config, ...customConfig };
    const attempts: RetryAttempt[] = [];
    let lastError: Error;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await operation();
        console.log(`✅ Operation succeeded on attempt ${attempt + 1}`);
        return result;
      } catch (error) {
        lastError = error as Error;

        const attemptInfo: RetryAttempt = {
          attempt: attempt + 1,
          delay: 0,
          timestamp: Date.now(),
          error: lastError
        };

        attempts.push(attemptInfo);

        // Check if we should retry
        if (attempt === config.maxRetries || !config.retryCondition(lastError)) {
          console.error(`❌ Operation failed after ${attempt + 1} attempts:`, lastError.message);
          break;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt, config);

        console.warn(`⚠️ Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message);

        await this.delay(delay);
      }
    }

    // All attempts failed
    const error = new Error(
      `Operation failed after ${config.maxRetries + 1} attempts. Last error: ${lastError.message}`
    );
    (error as any).attempts = attempts;
    throw error;
  }

  /**
   * Execute operation with circuit breaker and retry
   */
  async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    circuitBreaker: any, // CircuitBreaker instance
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    return circuitBreaker.execute(() =>
      this.executeWithRetry(operation, customConfig)
    );
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  private calculateDelay(attempt: number, config: Required<RetryConfig>): number {
    let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt);
    delay = Math.min(delay, config.maxDelay);

    if (config.jitter) {
      // Add random jitter to prevent thundering herd
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * Default retry condition - retry on network and server errors
   */
  private defaultRetryCondition(error: Error): boolean {
    // Retry on network errors
    if (error.message.includes('fetch') ||
        error.message.includes('network') ||
        error.message.includes('timeout')) {
      return true;
    }

    // Retry on 5xx server errors
    if (error.message.includes('500') ||
        error.message.includes('502') ||
        error.message.includes('503') ||
        error.message.includes('504')) {
      return true;
    }

    // Retry on rate limiting (429)
    if (error.message.includes('429') ||
        error.message.includes('rate limit')) {
      return true;
    }

    // Don't retry on client errors (4xx except 429)
    if (error.message.includes('4') && !error.message.includes('429')) {
      return false;
    }

    // Retry on other transient errors
    return true;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create retry manager for specific use cases
   */
  static forAPI(config?: Partial<RetryConfig>): RetryManager {
    return new RetryManager({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      ...config
    });
  }

  static forWebRTC(config?: Partial<RetryConfig>): RetryManager {
    return new RetryManager({
      maxRetries: 5,
      baseDelay: 500,
      maxDelay: 5000,
      ...config
    });
  }

  static forMedia(config?: Partial<RetryConfig>): RetryManager {
    return new RetryManager({
      maxRetries: 2,
      baseDelay: 2000,
      maxDelay: 10000,
      ...config
    });
  }
}
