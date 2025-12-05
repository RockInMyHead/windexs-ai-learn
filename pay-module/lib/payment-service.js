const fetch = require('node-fetch');
const crypto = require('crypto');

/**
 * Payment Service with Yookassa integration
 * Handles payments, subscriptions, and access control
 */
class PaymentService {
  constructor(config) {
    this.config = {
      yookassa: {
        shopId: config.yookassa.shopId,
        secretKey: config.yookassa.secretKey,
        testMode: config.yookassa.testMode || false,
        returnUrl: config.yookassa.returnUrl || 'https://your-domain.com/payment/success'
      },
      database: config.database || {},
      plans: config.plans || this.getDefaultPlans(),
      ...config
    };

    this.subscriptionManager = config.subscriptionManager;
  }

  /**
   * Default pricing plans
   */
  getDefaultPlans() {
    return {
      single_session: { price: 250, sessions: 1, type: 'one_time' },
      four_sessions: { price: 900, sessions: 4, type: 'one_time' },
      meditation_monthly: { price: 100, sessions: null, type: 'monthly', feature: 'meditations' }
    };
  }

  /**
   * Create payment in Yookassa
   */
  async createPayment(paymentData) {
    const plan = this.config.plans[paymentData.plan];
    if (!plan) {
      throw new Error(`Unknown plan: ${paymentData.plan}`);
    }

    const amount = plan.price;
    const currency = paymentData.currency || 'RUB';

    // Yookassa payment payload
    const yookassaPayload = {
      amount: {
        value: amount.toFixed(2),
        currency: currency,
      },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: this.config.yookassa.returnUrl,
      },
      description: paymentData.description,
      metadata: {
        userId: paymentData.userId,
        plan: paymentData.plan,
      },
      receipt: {
        customer: {
          email: paymentData.userEmail,
        },
        items: [
          {
            description: paymentData.description,
            quantity: 1,
            amount: {
              value: amount.toFixed(2),
              currency: currency,
            },
            vat_code: 1, // НДС 20%
            payment_subject: 'service',
            payment_mode: 'full_payment',
          },
        ],
      },
    };

    try {
      console.log('[PaymentService] Creating payment:', { amount, plan: paymentData.plan, userId: paymentData.userId });

      // Make request to Yookassa API
      const auth = Buffer.from(`${this.config.yookassa.shopId}:${this.config.yookassa.secretKey}`).toString('base64');

      const response = await fetch('https://api.yookassa.ru/v3/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
          'Idempotence-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(yookassaPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PaymentService] Yookassa error:', response.status, errorText);
        throw new Error(`Payment creation failed: ${response.status}`);
      }

      const paymentResult = await response.json();
      console.log('[PaymentService] Payment created:', paymentResult.id);

      return {
        id: paymentResult.id,
        status: paymentResult.status,
        confirmation: paymentResult.confirmation,
        amount: paymentResult.amount,
        metadata: paymentResult.metadata,
      };

    } catch (error) {
      console.error('[PaymentService] Payment creation error:', error);
      throw new Error(`Failed to create payment: ${error.message}`);
    }
  }

  /**
   * Verify payment status with Yookassa
   */
  async verifyPayment(paymentId) {
    try {
      console.log('[PaymentService] Verifying payment:', paymentId);

      const auth = Buffer.from(`${this.config.yookassa.shopId}:${this.config.yookassa.secretKey}`).toString('base64');

      const response = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      });

      if (!response.ok) {
        console.error('[PaymentService] Verification failed:', response.status);
        return false;
      }

      const paymentData = await response.json();

      if (paymentData.status === 'succeeded') {
        console.log('[PaymentService] Payment verified successfully');

        // Create subscription if payment metadata contains user info
        if (paymentData.metadata?.userId && paymentData.metadata?.plan) {
          await this.subscriptionManager.createSubscription(
            paymentData.metadata.userId,
            paymentData.metadata.plan,
            paymentId
          );
        }

        return true;
      }

      console.log('[PaymentService] Payment not succeeded:', paymentData.status);
      return false;

    } catch (error) {
      console.error('[PaymentService] Verification error:', error);
      return false;
    }
  }

  /**
   * Handle Yookassa webhook
   */
  async handleWebhook(notification) {
    try {
      console.log('[PaymentService] Received webhook:', notification.event);

      if (notification.event === 'payment.succeeded') {
        const payment = notification.object;

        if (payment.metadata?.userId && payment.metadata?.plan) {
          console.log('[PaymentService] Creating subscription for user:', payment.metadata.userId);

          await this.subscriptionManager.createSubscription(
            payment.metadata.userId,
            payment.metadata.plan,
            payment.id
          );

          console.log('[PaymentService] Subscription created successfully');
        }
      }

      return { status: 'ok' };

    } catch (error) {
      console.error('[PaymentService] Webhook processing error:', error);
      throw error;
    }
  }

  /**
   * Check user access to features
   */
  async checkUserAccess(userId, feature) {
    return await this.subscriptionManager.checkUserAccess(userId, feature);
  }

  /**
   * Use a session/feature
   */
  async useSession(userId) {
    return await this.subscriptionManager.useSession(userId);
  }

  /**
   * Get user subscription info
   */
  async getUserSubscription(userId) {
    return await this.subscriptionManager.getUserSubscription(userId);
  }

  /**
   * Get pricing plans
   */
  getPlans() {
    return this.config.plans;
  }

  /**
   * Test payment methods (for development)
   */
  getTestPaymentMethods() {
    return [
      {
        name: 'Тестовая карта',
        description: 'Номер: 5555 5555 5555 4444, CVC: 123, Срок: 12/30',
        action: 'test_card',
      },
      {
        name: 'Мгновенная оплата',
        description: 'Симуляция успешного платежа',
        action: 'instant_success',
      },
      {
        name: 'Тест отмены',
        description: 'Симуляция отмены платежа',
        action: 'test_cancel',
      },
    ];
  }

  /**
   * Simulate payment (for testing)
   */
  async simulatePayment(action, userId, plan) {
    const paymentId = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    switch (action) {
      case 'instant_success':
        console.log('[PaymentService] Simulating instant payment success');
        // Create subscription immediately
        await this.subscriptionManager.createSubscription(userId, plan, paymentId);
        return { success: true, paymentId };

      case 'test_cancel':
        console.log('[PaymentService] Simulating payment cancellation');
        return { success: false };

      case 'test_card':
      default:
        console.log('[PaymentService] Simulating bank card payment');
        // Create subscription after short delay (simulating bank processing)
        setTimeout(async () => {
          await this.subscriptionManager.createSubscription(userId, plan, paymentId);
        }, 2000);
        return { success: true, paymentId };
    }
  }
}

module.exports = PaymentService;
