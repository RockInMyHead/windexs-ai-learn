const fetch = require('node-fetch');
const crypto = require('crypto');

/**
 * Yookassa API Client
 * Handles communication with Yookassa payment gateway
 */
class YookassaClient {
  constructor(config) {
    this.config = {
      shopId: config.shopId,
      secretKey: config.secretKey,
      testMode: config.testMode || false,
      baseUrl: config.testMode
        ? 'https://api.yookassa.ru/v3'
        : 'https://api.yookassa.ru/v3',
      ...config
    };

    // Create basic auth header
    this.authHeader = `Basic ${Buffer.from(`${this.config.shopId}:${this.config.secretKey}`).toString('base64')}`;
  }

  /**
   * Make authenticated request to Yookassa API
   */
  async request(endpoint, method = 'GET', data = null) {
    const url = `${this.config.baseUrl}${endpoint}`;
    const idempotenceKey = crypto.randomUUID();

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.authHeader,
        'Idempotence-Key': idempotenceKey,
      },
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    try {
      console.log(`[YookassaClient] ${method} ${endpoint}`);

      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[YookassaClient] Error ${response.status}:`, errorText);
        throw new Error(`Yookassa API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`[YookassaClient] Success: ${endpoint}`);
      return result;

    } catch (error) {
      console.error(`[YookassaClient] Request failed:`, error);
      throw error;
    }
  }

  /**
   * Create payment
   */
  async createPayment(paymentData) {
    return await this.request('/payments', 'POST', paymentData);
  }

  /**
   * Get payment by ID
   */
  async getPayment(paymentId) {
    return await this.request(`/payments/${paymentId}`, 'GET');
  }

  /**
   * Capture payment (for two-stage payments)
   */
  async capturePayment(paymentId, amount) {
    return await this.request(`/payments/${paymentId}/capture`, 'POST', { amount });
  }

  /**
   * Cancel payment
   */
  async cancelPayment(paymentId) {
    return await this.request(`/payments/${paymentId}/cancel`, 'POST');
  }

  /**
   * Create refund
   */
  async createRefund(paymentId, refundData) {
    return await this.request(`/refunds`, 'POST', {
      payment_id: paymentId,
      ...refundData
    });
  }

  /**
   * Get refund by ID
   */
  async getRefund(refundId) {
    return await this.request(`/refunds/${refundId}`, 'GET');
  }

  /**
   * Validate webhook signature (for webhook verification)
   */
  validateWebhookSignature(body, signature, secret) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(body, Object.keys(body).sort()))
        .digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      console.error('[YookassaClient] Signature validation error:', error);
      return false;
    }
  }

  /**
   * Get shop info
   */
  async getShopInfo() {
    return await this.request('/me', 'GET');
  }

  /**
   * Test connection to Yookassa
   */
  async testConnection() {
    try {
      const shopInfo = await this.getShopInfo();
      console.log('[YookassaClient] Connection test successful:', {
        shopId: shopInfo.id,
        status: shopInfo.status,
        test: shopInfo.test || false
      });
      return true;
    } catch (error) {
      console.error('[YookassaClient] Connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = YookassaClient;
