/**
 * Security Manager
 * Comprehensive security management for production deployment
 */

export interface SecurityConfig {
  csrf: {
    enabled: boolean;
    tokenExpiry: number; // minutes
    headerName: string;
  };
  rateLimit: {
    enabled: boolean;
    maxRequests: number;
    windowMs: number; // milliseconds
    blockDuration: number; // milliseconds
  };
  headers: {
    enabled: boolean;
    hsts: boolean;
    noSniff: boolean;
    frameOptions: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
    csp: boolean;
  };
  encryption: {
    enabled: boolean;
    algorithm: string;
  };
  audit: {
    enabled: boolean;
    logSensitive: boolean;
  };
}

export interface SecurityEvent {
  id: string;
  type: 'csrf_attempt' | 'rate_limit' | 'suspicious_activity' | 'auth_failure' | 'data_breach_attempt';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  ip: string;
  userAgent: string;
  details: Record<string, any>;
  mitigated: boolean;
}

export interface RateLimitEntry {
  ip: string;
  requests: number;
  windowStart: number;
  blocked: boolean;
  blockExpiry?: number;
}

export class SecurityManager {
  private config: Required<SecurityConfig>;
  private csrfTokens: Map<string, { token: string; expiry: number }> = new Map();
  private rateLimitStore: Map<string, RateLimitEntry> = new Map();
  private securityEvents: SecurityEvent[] = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = {
      csrf: {
        enabled: true,
        tokenExpiry: 60, // 1 hour
        headerName: 'X-CSRF-Token',
        ...config.csrf
      },
      rateLimit: {
        enabled: true,
        maxRequests: 100,
        windowMs: 15 * 60 * 1000, // 15 minutes
        blockDuration: 60 * 60 * 1000, // 1 hour
        ...config.rateLimit
      },
      headers: {
        enabled: true,
        hsts: true,
        noSniff: true,
        frameOptions: 'SAMEORIGIN',
        csp: true,
        ...config.headers
      },
      encryption: {
        enabled: true,
        algorithm: 'AES-GCM',
        ...config.encryption
      },
      audit: {
        enabled: true,
        logSensitive: false,
        ...config.audit
      }
    };

    this.startCleanupTask();
  }

  /**
   * Generate CSRF token
   */
  generateCSRFToken(sessionId: string): string {
    if (!this.config.csrf.enabled) return '';

    const token = this.generateSecureToken();
    const expiry = Date.now() + (this.config.csrf.tokenExpiry * 60 * 1000);

    this.csrfTokens.set(sessionId, { token, expiry });
    return token;
  }

  /**
   * Validate CSRF token
   */
  validateCSRFToken(sessionId: string, token: string): boolean {
    if (!this.config.csrf.enabled) return true;

    const stored = this.csrfTokens.get(sessionId);
    if (!stored) return false;

    // Check expiry
    if (Date.now() > stored.expiry) {
      this.csrfTokens.delete(sessionId);
      return false;
    }

    // Use constant-time comparison to prevent timing attacks
    return this.constantTimeEquals(token, stored.token);
  }

  /**
   * Check rate limit for IP
   */
  checkRateLimit(ip: string, userAgent?: string): { allowed: boolean; remaining: number; resetTime: number } {
    if (!this.config.rateLimit.enabled) {
      return { allowed: true, remaining: Infinity, resetTime: 0 };
    }

    const now = Date.now();
    let entry = this.rateLimitStore.get(ip);

    if (!entry) {
      entry = {
        ip,
        requests: 0,
        windowStart: now,
        blocked: false
      };
      this.rateLimitStore.set(ip, entry);
    }

    // Check if still blocked
    if (entry.blocked && entry.blockExpiry && now < entry.blockExpiry) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.blockExpiry
      };
    }

    // Reset window if expired
    if (now - entry.windowStart >= this.config.rateLimit.windowMs) {
      entry.requests = 0;
      entry.windowStart = now;
      entry.blocked = false;
      entry.blockExpiry = undefined;
    }

    entry.requests++;

    // Check if limit exceeded
    if (entry.requests > this.config.rateLimit.maxRequests) {
      entry.blocked = true;
      entry.blockExpiry = now + this.config.rateLimit.blockDuration;

      // Log security event
      this.logSecurityEvent({
        type: 'rate_limit',
        severity: 'medium',
        ip,
        userAgent: userAgent || '',
        details: {
          requests: entry.requests,
          windowMs: this.config.rateLimit.windowMs,
          blockDuration: this.config.rateLimit.blockDuration
        },
        mitigated: true
      });

      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.blockExpiry
      };
    }

    const remaining = Math.max(0, this.config.rateLimit.maxRequests - entry.requests);
    const resetTime = entry.windowStart + this.config.rateLimit.windowMs;

    return { allowed: true, remaining, resetTime };
  }

  /**
   * Apply security headers to response
   */
  applySecurityHeaders(headers: Record<string, string>): Record<string, string> {
    if (!this.config.headers.enabled) return headers;

    const secureHeaders: Record<string, string> = { ...headers };

    if (this.config.headers.hsts) {
      secureHeaders['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
    }

    if (this.config.headers.noSniff) {
      secureHeaders['X-Content-Type-Options'] = 'nosniff';
    }

    if (this.config.headers.frameOptions) {
      secureHeaders['X-Frame-Options'] = this.config.headers.frameOptions;
    }

    if (this.config.headers.csp) {
      secureHeaders['Content-Security-Policy'] =
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com https://fonts.gstatic.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: https:; " +
        "media-src 'self' blob: https:; " +
        "connect-src 'self' https://teacher.windexs.ru wss://teacher.windexs.ru; " +
        "frame-ancestors 'none';";
    }

    secureHeaders['X-XSS-Protection'] = '1; mode=block';
    secureHeaders['Referrer-Policy'] = 'strict-origin-when-cross-origin';

    return secureHeaders;
  }

  /**
   * Encrypt sensitive data
   */
  async encryptData(data: string, key?: string): Promise<string> {
    if (!this.config.encryption.enabled) return data;

    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);

      const cryptoKey = await this.getEncryptionKey(key);
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        dataBuffer
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   */
  async decryptData(encryptedData: string, key?: string): Promise<string> {
    if (!this.config.encryption.enabled) return encryptedData;

    try {
      const combined = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      const cryptoKey = await this.getEncryptionKey(key);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        encrypted
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Validate input data
   */
  validateInput(input: any, schema: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic validation (extend with proper schema validation library in production)
    if (schema.required) {
      for (const field of schema.required) {
        if (!input[field]) {
          errors.push(`Field '${field}' is required`);
        }
      }
    }

    if (schema.stringFields) {
      for (const field of schema.stringFields) {
        if (input[field] && typeof input[field] !== 'string') {
          errors.push(`Field '${field}' must be a string`);
        }
      }
    }

    if (schema.maxLength) {
      for (const [field, maxLen] of Object.entries(schema.maxLength)) {
        if (input[field] && input[field].length > maxLen) {
          errors.push(`Field '${field}' exceeds maximum length of ${maxLen}`);
        }
      }
    }

    // Check for suspicious patterns
    if (typeof input === 'string') {
      if (this.containsSuspiciousPatterns(input)) {
        this.logSecurityEvent({
          type: 'suspicious_activity',
          severity: 'high',
          ip: 'unknown',
          userAgent: navigator.userAgent,
          details: { input: input.substring(0, 100) },
          mitigated: false
        });
        errors.push('Input contains suspicious patterns');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Log security event
   */
  logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): void {
    if (!this.config.audit.enabled) return;

    const securityEvent: SecurityEvent = {
      id: this.generateSecureToken(),
      timestamp: Date.now(),
      ...event
    };

    this.securityEvents.set(securityEvent.id, securityEvent);

    // In production, send to security monitoring service
    console.warn('🔒 Security Event:', securityEvent);

    // Keep only last 1000 events
    if (this.securityEvents.size > 1000) {
      const entries = Array.from(this.securityEvents.entries());
      entries.sort(([,a], [,b]) => a.timestamp - b.timestamp);
      this.securityEvents = new Map(entries.slice(-500));
    }
  }

  /**
   * Get security report
   */
  getSecurityReport(): {
    events: SecurityEvent[];
    rateLimitStats: { total: number; blocked: number };
    csrfTokens: number;
    config: SecurityConfig;
  } {
    const rateLimitStats = {
      total: this.rateLimitStore.size,
      blocked: Array.from(this.rateLimitStore.values()).filter(entry => entry.blocked).length
    };

    return {
      events: Array.from(this.securityEvents.values()).slice(-50), // Last 50 events
      rateLimitStats,
      csrfTokens: this.csrfTokens.size,
      config: this.config
    };
  }

  /**
   * Emergency lockdown
   */
  emergencyLockdown(reason: string): void {
    console.error('🚨 EMERGENCY LOCKDOWN:', reason);

    // Block all new requests
    this.config.rateLimit.maxRequests = 0;

    // Log critical security event
    this.logSecurityEvent({
      type: 'suspicious_activity',
      severity: 'critical',
      ip: 'system',
      userAgent: 'system',
      details: { reason, action: 'emergency_lockdown' },
      mitigated: true
    });

    // In production, notify security team immediately
    alert('Система безопасности активировала экстренную блокировку. Обратитесь к администратору.');
  }

  // Private methods

  private generateSecureToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false;

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(b.charCodeAt(i));
    }

    return result === 0;
  }

  private async getEncryptionKey(key?: string): Promise<CryptoKey> {
    const keyMaterial = key || 'default-encryption-key-change-in-production';
    const encoder = new TextEncoder();
    const keyData = encoder.encode(keyMaterial);

    const hash = await crypto.subtle.digest('SHA-256', keyData);
    return crypto.subtle.importKey(
      'raw',
      hash,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private containsSuspiciousPatterns(input: string): boolean {
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /union\s+select/i,
      /\bdrop\s+table/i,
      /\bselect\s+.*\bfrom\b/i,
      /eval\s*\(/i,
      /base64_/i,
      /data:text/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(input));
  }

  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 30 * 60 * 1000); // Every 30 minutes
  }

  private cleanup(): void {
    const now = Date.now();

    // Clean expired CSRF tokens
    for (const [sessionId, data] of this.csrfTokens) {
      if (now > data.expiry) {
        this.csrfTokens.delete(sessionId);
      }
    }

    // Clean expired rate limit blocks
    for (const [ip, entry] of this.rateLimitStore) {
      if (entry.blockExpiry && now > entry.blockExpiry) {
        entry.blocked = false;
        entry.blockExpiry = undefined;
      }
    }

    // Clean old security events (keep last 24 hours)
    const cutoffTime = now - (24 * 60 * 60 * 1000);
    for (const [id, event] of this.securityEvents) {
      if (event.timestamp < cutoffTime) {
        this.securityEvents.delete(id);
      }
    }

    console.log('🧹 Security cleanup completed');
  }

  /**
   * Destroy security manager
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.csrfTokens.clear();
    this.rateLimitStore.clear();
    this.securityEvents.clear();

    console.log('🧹 Security manager destroyed');
  }
}

// Singleton instance
export const securityManager = new SecurityManager();
