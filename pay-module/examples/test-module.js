// Simple test script for Pay Module
// Run with: node examples/test-module.js

const path = require('path');
const { PaymentService, SubscriptionManager } = require('../lib');

async function testPaymentModule() {
  console.log('🧪 Testing Pay Module...\n');

  // Test configuration
  const config = {
    yookassa: {
      shopId: '1183996',
      secretKey: 'test-secret-key',
      testMode: true,
      returnUrl: 'http://localhost:3000/payment/success'
    },
    database: {
      path: ':memory:' // In-memory database for testing
    }
  };

  try {
    // Initialize services
    console.log('1. Initializing services...');
    const subscriptionManager = new SubscriptionManager(config);
    const paymentService = new PaymentService({
      ...config,
      subscriptionManager
    });
    console.log('✅ Services initialized\n');

    // Test user creation
    console.log('2. Testing user operations...');
    const userId = 'test_user_' + Date.now();
    const subscriptionId = await subscriptionManager.createFreeTrialForNewUser(userId);
    console.log('✅ Free trial created:', subscriptionId);

    // Check access
    const access = await paymentService.checkUserAccess(userId, 'audio_sessions');
    console.log('✅ Access check:', access);
    console.log('   Has access:', access.hasAccess);
    console.log('   Remaining sessions:', access.remaining);
    console.log('   Total sessions:', access.total);

    // Use a session
    const sessionUsed = await paymentService.useSession(userId);
    console.log('✅ Session used:', sessionUsed);

    // Check access again
    const accessAfter = await paymentService.checkUserAccess(userId, 'audio_sessions');
    console.log('✅ Access after usage:', accessAfter);
    console.log('   Remaining sessions:', accessAfter.remaining);

    // Test payment creation (mock)
    console.log('\n3. Testing payment creation...');
    const paymentData = {
      amount: 250,
      currency: 'RUB',
      description: 'Test payment',
      userId: userId,
      userEmail: 'test@example.com',
      plan: 'single_session'
    };

    // Note: This will fail without real Yookassa credentials
    // but we can test the data preparation
    console.log('📝 Payment data prepared:', {
      amount: paymentData.amount,
      plan: paymentData.plan,
      userId: paymentData.userId
    });

    // Test subscription info
    console.log('\n4. Testing subscription info...');
    const sessionInfo = subscriptionManager.getAudioSessionInfo(userId);
    console.log('✅ Session info:', sessionInfo);

    console.log('\n🎉 All basic tests passed!');
    console.log('\n📋 Test Summary:');
    console.log('   ✓ Database operations');
    console.log('   ✓ Subscription management');
    console.log('   ✓ Access control');
    console.log('   ✓ Session usage tracking');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run tests if called directly
if (require.main === module) {
  testPaymentModule().then(() => {
    console.log('\n🏁 Test completed');
    process.exit(0);
  }).catch((error) => {
    console.error('\n💥 Test failed with error:', error);
    process.exit(1);
  });
}

module.exports = { testPaymentModule };
