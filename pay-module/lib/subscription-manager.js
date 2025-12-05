const Database = require('better-sqlite3');

/**
 * Subscription Manager
 * Handles subscription creation, access control, and usage tracking
 */
class SubscriptionManager {
  constructor(config) {
    this.config = config;
    this.db = new Database(config.database?.path || './payments.db');
    this.initializeDatabase();
  }

  /**
   * Initialize database tables
   */
  initializeDatabase() {
    // Create subscriptions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        plan TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        yookassa_payment_id TEXT,
        started_at INTEGER NOT NULL,
        expires_at INTEGER,
        auto_renew INTEGER NOT NULL DEFAULT 1,
        audio_sessions_limit INTEGER,
        audio_sessions_used INTEGER DEFAULT 0,
        meditation_access INTEGER DEFAULT 0,
        free_sessions_remaining INTEGER DEFAULT 0,
        last_audio_reset_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);
    `);

    // Create payments log table (optional)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        yookassa_id TEXT,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'RUB',
        status TEXT NOT NULL,
        plan TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    console.log('[SubscriptionManager] Database initialized');
  }

  /**
   * Generate unique subscription ID
   */
  generateId() {
    return `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Get plan configuration
   */
  getPlanConfig(plan) {
    const plans = {
      free_trial: {
        sessions: 3,
        type: 'free_trial',
        meditation_access: false
      },
      single_session: {
        sessions: 1,
        type: 'paid',
        meditation_access: false
      },
      four_sessions: {
        sessions: 4,
        type: 'paid',
        meditation_access: false
      },
      meditation_monthly: {
        sessions: null, // unlimited for meditations
        type: 'paid',
        meditation_access: true,
        monthly: true
      }
    };

    return plans[plan] || null;
  }

  /**
   * Create subscription for user
   */
  async createSubscription(userId, plan, paymentId = null) {
    try {
      console.log('[SubscriptionManager] Creating subscription:', { userId, plan, paymentId });

      const planConfig = this.getPlanConfig(plan);
      if (!planConfig) {
        throw new Error(`Unknown plan: ${plan}`);
      }

      // Check if user already has active subscription of same type
      const existingSubscription = this.getActiveSubscription(userId, plan);
      if (existingSubscription && plan !== 'free_trial') {
        console.log('[SubscriptionManager] User already has active subscription, extending...');

        // Extend existing subscription instead of creating new one
        return await this.extendSubscription(existingSubscription.id, planConfig);
      }

      const subscriptionId = this.generateId();
      const now = Date.now();

      // Calculate expiration for monthly subscriptions
      let expiresAt = null;
      if (planConfig.monthly) {
        expiresAt = now + (30 * 24 * 60 * 60 * 1000); // 30 days
      }

      const subscription = {
        id: subscriptionId,
        user_id: userId,
        plan: plan,
        status: 'active',
        yookassa_payment_id: paymentId,
        started_at: now,
        expires_at: expiresAt,
        auto_renew: planConfig.monthly ? 1 : 0,
        audio_sessions_limit: planConfig.sessions,
        audio_sessions_used: 0,
        meditation_access: planConfig.meditation_access ? 1 : 0,
        free_sessions_remaining: plan === 'free_trial' ? planConfig.sessions : 0,
        created_at: now,
        updated_at: now
      };

      const stmt = this.db.prepare(`
        INSERT INTO subscriptions (
          id, user_id, plan, status, yookassa_payment_id, started_at, expires_at,
          auto_renew, audio_sessions_limit, audio_sessions_used, meditation_access,
          free_sessions_remaining, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        subscription.id,
        subscription.user_id,
        subscription.plan,
        subscription.status,
        subscription.yookassa_payment_id,
        subscription.started_at,
        subscription.expires_at,
        subscription.auto_renew,
        subscription.audio_sessions_limit,
        subscription.audio_sessions_used,
        subscription.meditation_access,
        subscription.free_sessions_remaining,
        subscription.created_at,
        subscription.updated_at
      );

      console.log('[SubscriptionManager] Subscription created:', subscriptionId);
      return subscriptionId;

    } catch (error) {
      console.error('[SubscriptionManager] Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Create free trial for new user
   */
  async createFreeTrialForNewUser(userId) {
    try {
      // Check if user already has any subscription
      const existing = this.getUserSubscription(userId);
      if (existing) {
        console.log('[SubscriptionManager] User already has subscription:', existing.plan);
        return null;
      }

      console.log('[SubscriptionManager] Creating free trial for new user:', userId);
      return await this.createSubscription(userId, 'free_trial');

    } catch (error) {
      console.error('[SubscriptionManager] Error creating free trial:', error);
      return null;
    }
  }

  /**
   * Extend existing subscription
   */
  async extendSubscription(subscriptionId, planConfig) {
    try {
      const now = Date.now();

      const stmt = this.db.prepare(`
        UPDATE subscriptions
        SET audio_sessions_limit = audio_sessions_limit + ?,
            meditation_access = ?,
            expires_at = ?,
            updated_at = ?
        WHERE id = ?
      `);

      let expiresAt = null;
      if (planConfig.monthly) {
        // Extend by 30 days from current expiration or now
        const current = this.db.prepare('SELECT expires_at FROM subscriptions WHERE id = ?').get(subscriptionId);
        expiresAt = Math.max(current?.expires_at || now, now) + (30 * 24 * 60 * 60 * 1000);
      }

      stmt.run(
        planConfig.sessions || 0,
        planConfig.meditation_access ? 1 : 0,
        expiresAt,
        now,
        subscriptionId
      );

      console.log('[SubscriptionManager] Subscription extended:', subscriptionId);
      return subscriptionId;

    } catch (error) {
      console.error('[SubscriptionManager] Error extending subscription:', error);
      throw error;
    }
  }

  /**
   * Get active subscription for user
   */
  getActiveSubscription(userId, plan = null) {
    try {
      let query = `
        SELECT * FROM subscriptions
        WHERE user_id = ? AND status = 'active'
      `;
      let params = [userId];

      if (plan) {
        query += ' AND plan = ?';
        params.push(plan);
      }

      query += ' ORDER BY created_at DESC LIMIT 1';

      return this.db.prepare(query).get(...params) || null;

    } catch (error) {
      console.error('[SubscriptionManager] Error getting active subscription:', error);
      return null;
    }
  }

  /**
   * Get user subscription (active or most recent)
   */
  getUserSubscription(userId) {
    try {
      const subscription = this.db.prepare(`
        SELECT * FROM subscriptions
        WHERE user_id = ? AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
      `).get(userId);

      return subscription || null;

    } catch (error) {
      console.error('[SubscriptionManager] Error getting user subscription:', error);
      return null;
    }
  }

  /**
   * Check user access to features
   */
  async checkUserAccess(userId, feature) {
    try {
      const subscription = this.getUserSubscription(userId);

      if (!subscription) {
        return {
          hasAccess: false,
          reason: 'no_subscription'
        };
      }

      switch (feature) {
        case 'audio_sessions':
          return this.checkAudioAccess(subscription);

        case 'meditations':
          return this.checkMeditationAccess(subscription);

        default:
          return {
            hasAccess: false,
            reason: 'unknown_feature'
          };
      }

    } catch (error) {
      console.error('[SubscriptionManager] Error checking access:', error);
      return {
        hasAccess: false,
        reason: 'error',
        error: error.message
      };
    }
  }

  /**
   * Check audio sessions access
   */
  checkAudioAccess(subscription) {
    const isFreeTrial = subscription.plan === 'free_trial';
    const hasPaidSessions = subscription.audio_sessions_limit && subscription.audio_sessions_limit > 0;

    if (isFreeTrial) {
      const remaining = subscription.free_sessions_remaining || 0;
      return {
        hasAccess: remaining > 0,
        type: 'free_trial',
        remaining: remaining,
        total: 3
      };
    }

    if (hasPaidSessions) {
      const used = subscription.audio_sessions_used || 0;
      const remaining = Math.max(0, subscription.audio_sessions_limit - used);

      return {
        hasAccess: remaining > 0,
        type: 'paid',
        remaining: remaining,
        total: subscription.audio_sessions_limit,
        used: used
      };
    }

    return {
      hasAccess: false,
      reason: 'no_sessions_left'
    };
  }

  /**
   * Check meditation access
   */
  checkMeditationAccess(subscription) {
    const hasAccess = subscription.meditation_access === 1 ||
                     subscription.plan === 'meditation_monthly';

    if (hasAccess) {
      // Check if monthly subscription is expired
      if (subscription.expires_at && Date.now() > subscription.expires_at) {
        return {
          hasAccess: false,
          reason: 'subscription_expired'
        };
      }

      return {
        hasAccess: true,
        type: subscription.plan === 'meditation_monthly' ? 'paid' : 'included'
      };
    }

    return {
      hasAccess: false,
      reason: 'no_meditation_access'
    };
  }

  /**
   * Use audio session
   */
  async useSession(userId) {
    try {
      const subscription = this.getUserSubscription(userId);
      if (!subscription) {
        return false;
      }

      const access = this.checkAudioAccess(subscription);
      if (!access.hasAccess) {
        return false;
      }

      // Update usage counter
      if (subscription.plan === 'free_trial') {
        const stmt = this.db.prepare(`
          UPDATE subscriptions
          SET free_sessions_remaining = free_sessions_remaining - 1,
              updated_at = ?
          WHERE id = ?
        `);
        stmt.run(Date.now(), subscription.id);
      } else {
        const stmt = this.db.prepare(`
          UPDATE subscriptions
          SET audio_sessions_used = audio_sessions_used + 1,
              updated_at = ?
          WHERE id = ?
        `);
        stmt.run(Date.now(), subscription.id);
      }

      console.log('[SubscriptionManager] Session used by user:', userId);
      return true;

    } catch (error) {
      console.error('[SubscriptionManager] Error using session:', error);
      return false;
    }
  }

  /**
   * Get audio session info for user
   */
  getAudioSessionInfo(userId) {
    try {
      const subscription = this.getUserSubscription(userId);

      if (!subscription) {
        return {
          plan: 'free',
          remaining: 0,
          limit: 0
        };
      }

      const access = this.checkAudioAccess(subscription);

      return {
        plan: subscription.plan,
        remaining: access.remaining || 0,
        limit: access.total || 0
      };

    } catch (error) {
      console.error('[SubscriptionManager] Error getting session info:', error);
      return {
        plan: 'free',
        remaining: 0,
        limit: 0
      };
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = SubscriptionManager;
