// Example frontend integration with Pay Module
// This example shows how to integrate payments in a React/Vue/Angular app

// 1. Initialize Payment Service (usually in a service/store)
class PaymentClient {
  constructor(apiBaseUrl = '/api') {
    this.apiBaseUrl = apiBaseUrl;
  }

  // Create payment and redirect to Yookassa
  async createPayment(paymentData) {
    const response = await fetch(`${this.apiBaseUrl}/payments/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Payment creation failed');
    }

    const result = await response.json();

    if (result.success) {
      // Redirect user to Yookassa payment page
      window.location.href = result.payment.confirmationUrl;
    } else {
      throw new Error('Payment creation failed');
    }
  }

  // Check payment status (for success page)
  async verifyPayment(paymentId) {
    const response = await fetch(`${this.apiBaseUrl}/payments/verify/${paymentId}`);

    if (!response.ok) {
      throw new Error('Payment verification failed');
    }

    const result = await response.json();
    return result.success;
  }

  // Get user subscription
  async getUserSubscription(userId) {
    const response = await fetch(`${this.apiBaseUrl}/users/${userId}/subscription`);

    if (!response.ok) {
      throw new Error('Failed to get subscription');
    }

    const result = await response.json();
    return result.success ? result.subscription : null;
  }

  // Check user access to features
  async checkUserAccess(userId, feature) {
    const response = await fetch(`${this.apiBaseUrl}/users/${userId}/access/${feature}`);

    if (!response.ok) {
      throw new Error('Failed to check access');
    }

    const result = await response.json();
    return result.success ? result.access : { hasAccess: false };
  }

  // Use a session/feature
  async useSession(userId) {
    const response = await fetch(`${this.apiBaseUrl}/users/${userId}/use-session`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error('Failed to use session');
    }

    const result = await response.json();
    return result.success;
  }

  // Get session info
  async getSessionInfo(userId) {
    const response = await fetch(`${this.apiBaseUrl}/users/${userId}/session-info`);

    if (!response.ok) {
      throw new Error('Failed to get session info');
    }

    const result = await response.json();
    return result.success ? result.sessionInfo : { remaining: 0, limit: 0 };
  }

  // Create free trial
  async createFreeTrial(userId) {
    const response = await fetch(`${this.apiBaseUrl}/users/${userId}/create-trial`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error('Failed to create trial');
    }

    const result = await response.json();
    return result.success ? result.subscriptionId : null;
  }

  // Test payment (development only)
  async testPayment(action, userId, plan) {
    const response = await fetch(`${this.apiBaseUrl}/test-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, userId, plan })
    });

    if (!response.ok) {
      throw new Error('Test payment failed');
    }

    const result = await response.json();
    return result.result;
  }
}

// 2. React Component Example
const SubscriptionPlans = ({ user, onPaymentSuccess }) => {
  const paymentClient = new PaymentClient();

  const handlePayment = async (plan) => {
    try {
      const planConfigs = {
        single_session: { price: 250, description: 'Одна аудио сессия' },
        four_sessions: { price: 900, description: 'Четыре аудио сессии' },
        meditation_monthly: { price: 100, description: 'Медитации на месяц' }
      };

      const config = planConfigs[plan];
      if (!config) {
        alert('Неизвестный план подписки');
        return;
      }

      await paymentClient.createPayment({
        amount: config.price,
        currency: 'RUB',
        description: config.description,
        userId: user.id,
        userEmail: user.email,
        plan: plan
      });

      // User will be redirected to Yookassa

    } catch (error) {
      console.error('Payment error:', error);
      alert('Ошибка при создании платежа: ' + error.message);
    }
  };

  return (
    <div className="subscription-plans">
      <h2>Выберите план подписки</h2>

      <div className="plans-grid">
        <div className="plan-card">
          <h3>1 сессия</h3>
          <p className="price">250 ₽</p>
          <p className="description">Одна аудио сессия с психологом</p>
          <button onClick={() => handlePayment('single_session')}>
            Купить
          </button>
        </div>

        <div className="plan-card popular">
          <div className="badge">Популярный</div>
          <h3>4 сессии</h3>
          <p className="price">900 ₽</p>
          <p className="description">Четыре аудио сессии с психологом</p>
          <button onClick={() => handlePayment('four_sessions')}>
            Купить
          </button>
        </div>

        <div className="plan-card">
          <h3>Медитации</h3>
          <p className="price">100 ₽/месяц</p>
          <p className="description">Полный доступ к медитациям</p>
          <button onClick={() => handlePayment('meditation_monthly')}>
            Подписаться
          </button>
        </div>
      </div>
    </div>
  );
};

// 3. Payment Success Page Component
const PaymentSuccess = ({ userId, paymentId }) => {
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const paymentClient = new PaymentClient();

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        if (paymentId) {
          const success = await paymentClient.verifyPayment(paymentId);
          setVerified(success);
        } else {
          // Check from localStorage or URL params
          const storedPaymentId = localStorage.getItem('pending_payment_id');
          if (storedPaymentId) {
            const success = await paymentClient.verifyPayment(storedPaymentId);
            setVerified(success);
          }
        }
      } catch (error) {
        console.error('Verification error:', error);
      } finally {
        setVerifying(false);
      }
    };

    verifyPayment();
  }, [paymentId]);

  if (verifying) {
    return <div>Проверяем платеж...</div>;
  }

  return (
    <div className="payment-success">
      {verified ? (
        <div>
          <h2>✅ Платеж успешно обработан!</h2>
          <p>Ваша подписка активирована.</p>
          <button onClick={() => window.location.href = '/chat'}>
            Перейти к чату
          </button>
        </div>
      ) : (
        <div>
          <h2>⚠️ Платеж не найден</h2>
          <p>Если вы оплатили, но статус не обновился, обратитесь в поддержку.</p>
        </div>
      )}
    </div>
  );
};

// 4. Access Control Hook
const usePayAccess = (userId) => {
  const [access, setAccess] = useState({});
  const [loading, setLoading] = useState(true);
  const paymentClient = new PaymentClient();

  useEffect(() => {
    const checkAccess = async () => {
      if (!userId) return;

      try {
        const [audioAccess, meditationAccess, sessionInfo] = await Promise.all([
          paymentClient.checkUserAccess(userId, 'audio_sessions'),
          paymentClient.checkUserAccess(userId, 'meditations'),
          paymentClient.getSessionInfo(userId)
        ]);

        setAccess({
          audio: audioAccess,
          meditation: meditationAccess,
          sessions: sessionInfo
        });
      } catch (error) {
        console.error('Access check error:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [userId]);

  const useAudioSession = async () => {
    if (!access.audio?.hasAccess) return false;

    try {
      const success = await paymentClient.useSession(userId);
      if (success) {
        // Update local state
        setAccess(prev => ({
          ...prev,
          sessions: {
            ...prev.sessions,
            remaining: prev.sessions.remaining - 1
          }
        }));
      }
      return success;
    } catch (error) {
      console.error('Use session error:', error);
      return false;
    }
  };

  return {
    access,
    loading,
    useAudioSession
  };
};

// 5. Usage Example
const ChatComponent = ({ user }) => {
  const { access, loading, useAudioSession } = usePayAccess(user.id);

  const handleStartAudioCall = async () => {
    if (!access.audio?.hasAccess) {
      alert('У вас нет доступа к аудио сессиям. Купите подписку.');
      return;
    }

    const success = await useAudioSession();
    if (success) {
      // Start audio call
      startAudioCall();
    } else {
      alert('Не удалось использовать сессию');
    }
  };

  if (loading) return <div>Проверяем доступ...</div>;

  return (
    <div>
      <div className="access-info">
        <p>Аудио сессий: {access.sessions?.remaining || 0} из {access.sessions?.limit || 0}</p>
        <p>Медитации: {access.meditation?.hasAccess ? 'Доступны' : 'Недоступны'}</p>
      </div>

      <button
        onClick={handleStartAudioCall}
        disabled={!access.audio?.hasAccess}
      >
        Начать аудио звонок
      </button>
    </div>
  );
};

module.exports = {
  PaymentClient,
  SubscriptionPlans,
  PaymentSuccess,
  usePayAccess,
  ChatComponent
};
