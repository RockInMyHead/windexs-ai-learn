// Example Express.js server with Pay Module integration
const express = require('express');
const cors = require('cors');
const { PaymentService, SubscriptionManager } = require('../lib');

const app = express();
const PORT = process.env.PORT || 3000;

// Load configuration
const config = require('../config/example');

// Initialize services
const subscriptionManager = new SubscriptionManager(config);
const paymentService = new PaymentService({
  ...config,
  subscriptionManager
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes

// Create payment
app.post('/api/payments/create', async (req, res) => {
  try {
    const { amount, currency, description, userId, userEmail, plan } = req.body;

    const payment = await paymentService.createPayment({
      amount: parseFloat(amount),
      currency: currency || 'RUB',
      description,
      userId,
      userEmail,
      plan
    });

    res.json({
      success: true,
      payment: {
        id: payment.id,
        confirmationUrl: payment.confirmation.confirmation_url,
        status: payment.status
      }
    });

  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Verify payment
app.get('/api/payments/verify/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const success = await paymentService.verifyPayment(paymentId);

    res.json({
      success,
      paymentId
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Webhook handler
app.post('/api/payments/webhook', async (req, res) => {
  try {
    console.log('Received webhook:', req.body.event);

    await paymentService.handleWebhook(req.body);

    // Always return 200 to acknowledge receipt
    res.json({ status: 'ok' });

  } catch (error) {
    console.error('Webhook processing error:', error);
    // Still return 200 to prevent retries
    res.status(200).json({ status: 'error', message: error.message });
  }
});

// User subscription
app.get('/api/users/:userId/subscription', async (req, res) => {
  try {
    const { userId } = req.params;
    const subscription = await paymentService.getUserSubscription(userId);

    if (subscription) {
      res.json({
        success: true,
        subscription: {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          startedAt: subscription.started_at,
          expiresAt: subscription.expires_at,
          sessionsLimit: subscription.audio_sessions_limit,
          sessionsUsed: subscription.audio_sessions_used,
          meditationAccess: subscription.meditation_access === 1
        }
      });
    } else {
      res.json({
        success: true,
        subscription: null
      });
    }

  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check user access
app.get('/api/users/:userId/access/:feature', async (req, res) => {
  try {
    const { userId, feature } = req.params;
    const access = await paymentService.checkUserAccess(userId, feature);

    res.json({
      success: true,
      access
    });

  } catch (error) {
    console.error('Check access error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Use session
app.post('/api/users/:userId/use-session', async (req, res) => {
  try {
    const { userId } = req.params;
    const success = await paymentService.useSession(userId);

    res.json({
      success,
      userId
    });

  } catch (error) {
    console.error('Use session error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get session info
app.get('/api/users/:userId/session-info', async (req, res) => {
  try {
    const { userId } = req.params;
    const info = subscriptionManager.getAudioSessionInfo(userId);

    res.json({
      success: true,
      sessionInfo: info
    });

  } catch (error) {
    console.error('Get session info error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create free trial
app.post('/api/users/:userId/create-trial', async (req, res) => {
  try {
    const { userId } = req.params;
    const subscriptionId = await subscriptionManager.createFreeTrialForNewUser(userId);

    res.json({
      success: !!subscriptionId,
      subscriptionId
    });

  } catch (error) {
    console.error('Create trial error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test payment (for development)
app.post('/api/test-payment', async (req, res) => {
  try {
    const { action, userId, plan } = req.body;
    const result = await paymentService.simulatePayment(action, userId, plan || 'single_session');

    res.json({
      success: true,
      result
    });

  } catch (error) {
    console.error('Test payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Pay Module server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down Pay Module server...');
  subscriptionManager.close();
  process.exit(0);
});

module.exports = app;
