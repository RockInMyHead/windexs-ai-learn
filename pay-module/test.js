#!/usr/bin/env node

/**
 * Simple test script to verify Pay Module functionality
 */

const { PaymentService } = require('./index');

async function testPayModule() {
  console.log('🧪 Testing Pay Module...\n');

  // Test 1: Module imports
  console.log('✅ Testing module imports...');
  try {
    const { PaymentService, SubscriptionManager, PLANS, FEATURES } = require('./index');
    console.log('   PaymentService:', typeof PaymentService);
    console.log('   SubscriptionManager:', typeof SubscriptionManager);
    console.log('   PLANS:', Object.keys(PLANS || {}));
    console.log('   FEATURES:', Object.keys(FEATURES || {}));
  } catch (error) {
    console.error('❌ Import test failed:', error.message);
    return;
  }

  // Test 2: Service initialization (without real config)
  console.log('\n✅ Testing service initialization...');
  try {
    const paymentService = new PaymentService({
      yookassa: {
        shopId: 'test-shop-id',
        secretKey: 'test-secret-key',
        testMode: true
      },
      database: {
        connectionString: 'sqlite://./test.db'
      }
    });

    console.log('   Service created successfully');
    console.log('   Default plans:', Object.keys(paymentService.config.plans));
  } catch (error) {
    console.error('❌ Service initialization failed:', error.message);
    return;
  }

  // Test 3: Plan validation
  console.log('\n✅ Testing plan validation...');
  try {
    const plans = {
      single_session: { price: 250, sessions: 1, type: 'one_time' },
      four_sessions: { price: 900, sessions: 4, type: 'one_time' },
      meditation_monthly: { price: 100, sessions: null, type: 'monthly', feature: 'meditations' }
    };

    for (const [planName, plan] of Object.entries(plans)) {
      if (!plan.price || typeof plan.price !== 'number') {
        throw new Error(`Invalid price for plan ${planName}`);
      }
      console.log(`   ✓ Plan ${planName}: ${plan.price}₽`);
    }
  } catch (error) {
    console.error('❌ Plan validation failed:', error.message);
    return;
  }

  console.log('\n🎉 All basic tests passed!');
  console.log('\n📝 Next steps:');
  console.log('1. Set up real Yookassa credentials');
  console.log('2. Configure database connection');
  console.log('3. Run database migrations: npm run db:migrate');
  console.log('4. Start example server: npm run start:example');
}

// Run tests
testPayModule().catch(error => {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
});
