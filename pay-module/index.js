// Pay Module - Payment Integration Module
// Main entry point for easy importing

const PaymentService = require('./lib/payment-service');
const SubscriptionManager = require('./lib/subscription-manager');
const YookassaClient = require('./lib/yookassa-client');

// Default export - main PaymentService
module.exports = PaymentService;

// Named exports
module.exports.PaymentService = PaymentService;
module.exports.SubscriptionManager = SubscriptionManager;
module.exports.YookassaClient = YookassaClient;

// Version info
module.exports.version = require('./package.json').version;

// Utility functions
module.exports.createPaymentService = (config) => {
  const subscriptionManager = new SubscriptionManager(config);
  return new PaymentService({
    ...config,
    subscriptionManager
  });
};

module.exports.createSubscriptionManager = (config) => {
  return new SubscriptionManager(config);
};

module.exports.createYookassaClient = (config) => {
  return new YookassaClient(config);
};

// Constants
module.exports.PLANS = {
  FREE_TRIAL: 'free_trial',
  SINGLE_SESSION: 'single_session',
  FOUR_SESSIONS: 'four_sessions',
  MEDITATION_MONTHLY: 'meditation_monthly'
};

module.exports.FEATURES = {
  AUDIO_SESSIONS: 'audio_sessions',
  MEDITATIONS: 'meditations'
};

module.exports.CURRENCIES = {
  RUB: 'RUB',
  USD: 'USD',
  EUR: 'EUR'
};
