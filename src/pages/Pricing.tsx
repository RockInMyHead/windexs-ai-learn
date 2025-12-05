import Navigation from "@/components/Navigation";
import { Check, Sparkles, Zap, Crown, Star, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || 'https://teacher.windexs.ru/api';

interface Plan {
  id: string;
  name: string;
  price: number;
  lessons: number | null;
  voiceSessions: number | null;
  type: string;
  description: string;
}

interface Subscription {
  hasSubscription: boolean;
  plan: string | null;
  planName: string | null;
  lessonsRemaining: number;
  voiceSessionsRemaining: number;
  isUnlimited: boolean;
  expiresAt: number | null;
}

const Pricing = () => {
  const { toast } = useToast();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
    if (token) {
      fetchSubscription();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchPlans = async () => {
    try {
      const response = await fetch(`${API_URL}/payments/plans`);
      const data = await response.json();
      // Filter out free_trial from purchasable plans
      setPlans(data.plans.filter((p: Plan) => p.id !== 'free_trial'));
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    }
  };

  const fetchSubscription = async () => {
    try {
      const response = await fetch(`${API_URL}/payments/subscription`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setSubscription(data);
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (planId: string) => {
    if (!user) {
      toast({
        title: "Необходима авторизация",
        description: "Войдите в аккаунт для оформления подписки",
      });
      navigate('/login');
      return;
    }

    setProcessingPlan(planId);

    try {
      const response = await fetch(`${API_URL}/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plan: planId })
      });

      const data = await response.json();

      if (data.success && data.confirmationUrl) {
        // Для СБП сразу открываем страницу ЮKassa/ЮMoney с QR
        window.location.href = data.confirmationUrl;
      } else {
        throw new Error(data.error || 'Ошибка создания платежа');
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось создать платеж",
        variant: "destructive",
      });
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleTestPurchase = async (planId: string) => {
    if (!user) {
      toast({
        title: "Необходима авторизация",
        description: "Войдите в аккаунт для тестирования",
      });
      navigate('/login');
      return;
    }

    setProcessingPlan(planId);

    try {
      const response = await fetch(`${API_URL}/payments/test-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plan: planId })
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Успешно!",
          description: data.message,
        });
        fetchSubscription();
      } else {
        throw new Error(data.error || 'Ошибка тестового платежа');
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось активировать тестовую подписку",
        variant: "destructive",
      });
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleCreateTrial = async () => {
    if (!user) {
      toast({
        title: "Необходима авторизация",
        description: "Войдите в аккаунт для получения пробного периода",
      });
      navigate('/login');
      return;
    }

    setProcessingPlan('free_trial');

    try {
      const response = await fetch(`${API_URL}/payments/create-trial`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Пробный период активирован! 🎉",
          description: `Вам доступно ${data.voiceSessionsRemaining ?? 1} бесплатный голосовой урок`,
        });
        fetchSubscription();
      } else if (data.alreadyHasSubscription) {
        toast({
          title: "У вас уже есть подписка",
          description: "Пробный период доступен только для новых пользователей",
        });
      } else {
        throw new Error(data.error || 'Ошибка');
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось активировать пробный период",
        variant: "destructive",
      });
    } finally {
      setProcessingPlan(null);
    }
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'basic': return <Zap className="w-8 h-8" />;
      case 'standard': return <Star className="w-8 h-8" />;
      case 'premium': return <Crown className="w-8 h-8" />;
      case 'unlimited_monthly': return <Sparkles className="w-8 h-8" />;
      default: return <Zap className="w-8 h-8" />;
    }
  };

  const getPlanColor = (planId: string) => {
    switch (planId) {
      case 'basic': return 'from-blue-500 to-cyan-500';
      case 'standard': return 'from-purple-500 to-pink-500';
      case 'premium': return 'from-amber-500 to-orange-500';
      case 'unlimited_monthly': return 'from-emerald-500 to-teal-500';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  const isPopular = (planId: string) => planId === 'standard';
  const isBestValue = (planId: string) => planId === 'premium';

  const getPlanFeatures = (plan: Plan) => {
    const features: string[] = [];

    // Уроки показываем только если есть (>0) или безлимит
    if (plan.lessons === null) {
      features.push('Безлимитные уроки');
    } else if (plan.lessons > 0) {
      features.push(`${plan.lessons} уроков`);
    }

    // Голосовые сессии
    if (plan.voiceSessions === null) {
      features.push('Безлимитные голосовые сессии');
    } else if (plan.voiceSessions > 0) {
      features.push(`${plan.voiceSessions} голосовых сессий`);
    } else {
      features.push('Без голосовых сессий');
    }

    // Базовая функция
    features.push('AI-преподаватель 24/7');

    // Премиум функции
    if (plan.id === 'premium') {
      features.push('Озвучка сообщений учителя');
      features.push('Улучшенные ответы в чате');
      features.push('Приоритетная поддержка');
    }

    return features;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12 animate-fade-in">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-6">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">Выберите свой план обучения</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Тарифные планы
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Персональный AI-преподаватель всегда рядом. Выберите план, который подходит именно вам.
            </p>
          </div>

          {/* Current Subscription Info */}
          {subscription?.hasSubscription && (
            <div className="mb-10 p-6 rounded-2xl bg-gradient-to-r from-primary/10 via-purple-500/10 to-pink-500/10 border border-primary/20">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-500" />
                    Ваша текущая подписка: {subscription.planName}
                  </h3>
                  <p className="text-muted-foreground mt-1">
                    {subscription.isUnlimited ? (
                      'Безлимитный доступ'
                    ) : (
                      <>
                        {subscription.lessonsRemaining > 0 && (
                          <>Осталось уроков: <span className="font-bold text-primary">{subscription.lessonsRemaining}</span></>
                        )}
                        {(subscription.lessonsRemaining > 0 && subscription.voiceSessionsRemaining > 0) && ' • '}
                        {subscription.voiceSessionsRemaining > 0 && (
                          <>Голосовых сессий: <span className="font-bold text-primary">{subscription.voiceSessionsRemaining}</span></>
                        )}
                        {subscription.lessonsRemaining <= 0 && subscription.voiceSessionsRemaining <= 0 && (
                          <>Нет доступных уроков/сессий</>
                        )}
                      </>
                    )}
                  </p>
                  {subscription.expiresAt && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Действует до: {new Date(subscription.expiresAt).toLocaleDateString('ru-RU')}
                    </p>
                  )}
                </div>
                <Button variant="outline" onClick={() => navigate('/library')}>
                  Перейти к обучению
                </Button>
              </div>
            </div>
          )}

          {/* Free Trial Banner */}
          {!subscription?.hasSubscription && user && (
            <div className="mb-10 p-6 rounded-2xl bg-gradient-to-r from-green-500/10 via-emerald-500/10 to-teal-500/10 border border-green-500/20">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-green-500/20">
                    <Gift className="w-8 h-8 text-green-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Начните бесплатно!</h3>
                    <p className="text-muted-foreground">
                      Попробуйте 1 бесплатный голосовой урок и 1 урок в чате с AI-преподавателем
                    </p>
                  </div>
                </div>
                <Button 
                  className="bg-green-500 hover:bg-green-600"
                  onClick={handleCreateTrial}
                  disabled={processingPlan === 'free_trial'}
                >
                  {processingPlan === 'free_trial' ? 'Активация...' : 'Получить бесплатно'}
                </Button>
              </div>
            </div>
          )}

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan, index) => (
              <Card 
                key={plan.id}
                className={`relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl animate-fade-in ${
                  isPopular(plan.id) ? 'border-purple-500 shadow-lg shadow-purple-500/20' : ''
                } ${isBestValue(plan.id) ? 'border-amber-500 shadow-lg shadow-amber-500/20' : ''}`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {isPopular(plan.id) && (
                  <div className="absolute top-0 right-0 bg-purple-500 text-white text-xs px-3 py-1 rounded-bl-lg font-medium">
                    Популярный
                  </div>
                )}
                {isBestValue(plan.id) && (
                  <div className="absolute top-0 right-0 bg-amber-500 text-white text-xs px-3 py-1 rounded-bl-lg font-medium">
                    Лучшая цена
                  </div>
                )}

                <CardHeader className="text-center pb-2">
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${getPlanColor(plan.id)} flex items-center justify-center text-white`}>
                    {getPlanIcon(plan.id)}
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription className="min-h-[48px]">{plan.description}</CardDescription>
                </CardHeader>

                <CardContent className="text-center">
                  <div className="mb-6">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">₽</span>
                    {plan.type === 'monthly' && (
                      <span className="text-muted-foreground text-sm">/мес</span>
                    )}
                  </div>

                  <ul className="space-y-3 text-sm">
                    {getPlanFeatures(plan).map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="flex flex-col gap-2">
                  <Button 
                    className={`w-full ${isPopular(plan.id) || isBestValue(plan.id) ? 'bg-gradient-to-r ' + getPlanColor(plan.id) : ''}`}
                    variant={isPopular(plan.id) || isBestValue(plan.id) ? 'default' : 'outline'}
                    onClick={() => handlePurchase(plan.id)}
                    disabled={processingPlan === plan.id}
                  >
                    {processingPlan === plan.id ? 'Обработка...' : 'Выбрать план'}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          {/* FAQ Section */}
          <div className="mt-16 text-center">
            <h2 className="text-2xl font-bold mb-4">Часто задаваемые вопросы</h2>
            <div className="grid md:grid-cols-2 gap-6 text-left max-w-4xl mx-auto">
              <div className="p-6 rounded-xl bg-card border">
                <h3 className="font-semibold mb-2">Как работает оплата?</h3>
                <p className="text-sm text-muted-foreground">
                  Мы используем безопасную платежную систему ЮKassa. После оплаты подписка активируется мгновенно.
                </p>
              </div>
              <div className="p-6 rounded-xl bg-card border">
                <h3 className="font-semibold mb-2">Можно ли отменить подписку?</h3>
                <p className="text-sm text-muted-foreground">
                  Да, вы можете отменить автопродление в любой момент. Текущий период останется активным до конца.
                </p>
              </div>
              <div className="p-6 rounded-xl bg-card border">
                <h3 className="font-semibold mb-2">Что такое голосовые сессии?</h3>
                <p className="text-sm text-muted-foreground">
                  Голосовые сессии позволяют общаться с AI-преподавателем голосом, как по телефону.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Pricing;

