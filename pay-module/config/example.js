// Example configuration for Pay Module
// Copy this file and customize for your application

module.exports = {
  // Yookassa payment gateway settings
  yookassa: {
    // Get these from your Yookassa merchant account
    shopId: process.env.YOOKASSA_SHOP_ID || '1183996',
    secretKey: process.env.YOOKASSA_SECRET_KEY || 'live_OTmJmdMHX6ysyUcUpBz5kt-dmSq1pT-Y5gLgmpT1jXg',

    // Set to true for testing, false for production
    testMode: process.env.NODE_ENV !== 'production',

    // URL where users will be redirected after payment
    returnUrl: process.env.APP_URL
      ? `${process.env.APP_URL}/payment/success`
      : 'https://your-domain.com/payment/success'
  },

  // Database configuration
  database: {
    // SQLite database path
    path: process.env.DATABASE_PATH || './payments.db',

    // For other databases (PostgreSQL, MySQL):
    // host: process.env.DB_HOST || 'localhost',
    // port: process.env.DB_PORT || 5432,
    // database: process.env.DB_NAME || 'payments',
    // username: process.env.DB_USER || 'user',
    // password: process.env.DB_PASSWORD || 'password',
    // dialect: 'postgres' // or 'mysql'
  },

  // Pricing plans configuration
  plans: {
    // Single audio session
    single_session: {
      price: 250,        // Price in RUB
      sessions: 1,       // Number of audio sessions
      type: 'one_time',  // One-time payment
      description: 'Одна аудио сессия с психологом'
    },

    // Four audio sessions (package)
    four_sessions: {
      price: 900,        // Price in RUB (225 per session)
      sessions: 4,       // Number of audio sessions
      type: 'one_time',  // One-time payment
      description: 'Четыре аудио сессии с психологом'
    },

    // Monthly meditation access
    meditation_monthly: {
      price: 100,        // Price in RUB per month
      sessions: null,    // Unlimited access
      type: 'monthly',   // Monthly subscription
      feature: 'meditations', // Grants meditation access
      description: 'Месячная подписка на медитации'
    },

    // Free trial for new users
    free_trial: {
      price: 0,          // Free
      sessions: 3,       // 3 free sessions
      type: 'free_trial', // Special free plan
      description: 'Бесплатный пробный период'
    }
  },

  // Webhook configuration
  webhooks: {
    // URL for Yookassa webhooks (must be HTTPS in production)
    url: process.env.WEBHOOK_URL || 'https://your-domain.com/api/payments/webhook',

    // Secret for webhook signature verification (optional)
    secret: process.env.WEBHOOK_SECRET || null
  },

  // Email notifications (optional)
  email: {
    enabled: false,
    provider: 'smtp', // or 'sendgrid', 'mailgun', etc.
    from: 'noreply@your-domain.com',
    templates: {
      payment_success: 'Платеж успешно обработан',
      subscription_activated: 'Подписка активирована',
      trial_started: 'Пробный период начат'
    }
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info', // 'debug', 'info', 'warn', 'error'
    file: process.env.LOG_FILE || './logs/payments.log',
    maxSize: '10m',     // Max log file size
    maxFiles: 5         // Number of log files to keep
  },

  // Feature flags
  features: {
    freeTrialEnabled: true,     // Allow free trials for new users
    autoRenewal: true,         // Auto-renew monthly subscriptions
    webhooksEnabled: true,     // Process webhook notifications
    refundEnabled: false,      // Allow refunds (requires additional setup)
    analyticsEnabled: false    // Enable payment analytics
  },

  // Limits and restrictions
  limits: {
    maxSessionsPerDay: 10,     // Max sessions user can use per day
    trialPeriodDays: 30,       // Trial period length
    subscriptionGracePeriod: 3 // Days before subscription expires to show warning
  }
};
