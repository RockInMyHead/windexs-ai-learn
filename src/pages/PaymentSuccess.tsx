import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { CheckCircle2, Loader2, XCircle, ArrowRight, BookOpen, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const API_URL = import.meta.env.VITE_API_URL || 'https://teacher.windexs.ru/api';

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const { toast } = useToast();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [subscription, setSubscription] = useState<{
    plan: string;
    planName: string;
    lessonsRemaining: number;
    voiceSessionsRemaining: number;
    isUnlimited: boolean;
  } | null>(null);

  useEffect(() => {
    const verifyPayment = async () => {
      // Get payment ID from URL if available (YooKassa sends it back)
      const paymentId = searchParams.get('payment_id') || searchParams.get('orderId');
      
      try {
        // If we have a payment ID, verify it
        if (paymentId) {
          const verifyResponse = await fetch(`${API_URL}/payments/verify/${paymentId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          const verifyData = await verifyResponse.json();
          
          if (!verifyData.success) {
            // Payment not yet successful, wait a bit and check subscription
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        // Check current subscription status
        const subResponse = await fetch(`${API_URL}/payments/subscription`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const subData = await subResponse.json();
        
        if (subData.hasSubscription) {
          setSubscription({
            plan: subData.plan,
            planName: subData.planName,
            lessonsRemaining: subData.lessonsRemaining,
            voiceSessionsRemaining: subData.voiceSessionsRemaining,
            isUnlimited: subData.isUnlimited
          });
          setStatus('success');
          
          toast({
            title: "Оплата прошла успешно! 🎉",
            description: `Подписка "${subData.planName}" активирована`,
          });
        } else {
          // No subscription found - maybe payment is still processing
          // Wait and try again
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          const retryResponse = await fetch(`${API_URL}/payments/subscription`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          const retryData = await retryResponse.json();
          
          if (retryData.hasSubscription) {
            setSubscription({
              plan: retryData.plan,
              planName: retryData.planName,
              lessonsRemaining: retryData.lessonsRemaining,
              voiceSessionsRemaining: retryData.voiceSessionsRemaining,
              isUnlimited: retryData.isUnlimited
            });
            setStatus('success');
          } else {
            setStatus('error');
          }
        }
      } catch (error) {
        console.error('Payment verification error:', error);
        setStatus('error');
      }
    };

    verifyPayment();
  }, [token, searchParams, toast]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-2xl mx-auto">
          <Card className="text-center">
            <CardHeader className="pb-4">
              {status === 'loading' && (
                <>
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  </div>
                  <CardTitle className="text-2xl">Проверяем оплату...</CardTitle>
                  <CardDescription>
                    Пожалуйста, подождите, мы активируем вашу подписку
                  </CardDescription>
                </>
              )}

              {status === 'success' && (
                <>
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center animate-fade-in">
                    <CheckCircle2 className="w-10 h-10 text-green-500" />
                  </div>
                  <CardTitle className="text-2xl text-green-600">Оплата успешна!</CardTitle>
                  <CardDescription>
                    Ваша подписка "{subscription?.planName}" активирована
                  </CardDescription>
                </>
              )}

              {status === 'error' && (
                <>
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                    <XCircle className="w-10 h-10 text-red-500" />
                  </div>
                  <CardTitle className="text-2xl text-red-600">Что-то пошло не так</CardTitle>
                  <CardDescription>
                    Не удалось подтвердить оплату. Если деньги списались, подписка активируется автоматически в течение нескольких минут.
                  </CardDescription>
                </>
              )}
            </CardHeader>

            <CardContent className="space-y-6">
              {status === 'success' && subscription && (
                <div className="p-6 rounded-xl bg-gradient-to-r from-primary/5 via-purple-500/5 to-pink-500/5 border">
                  <h3 className="font-semibold mb-4">Ваши возможности:</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-background">
                      <BookOpen className="w-5 h-5 text-primary" />
                      <div className="text-left">
                        <p className="text-sm text-muted-foreground">Уроки</p>
                        <p className="font-bold">
                          {subscription.isUnlimited ? '∞' : subscription.lessonsRemaining}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-background">
                      <Mic className="w-5 h-5 text-primary" />
                      <div className="text-left">
                        <p className="text-sm text-muted-foreground">Голосовые сессии</p>
                        <p className="font-bold">
                          {subscription.isUnlimited ? '∞' : subscription.voiceSessionsRemaining}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {status === 'success' && (
                  <>
                    <Button onClick={() => navigate('/courses')} className="gap-2">
                      Выбрать курс
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" onClick={() => navigate('/library')}>
                      Моя библиотека
                    </Button>
                  </>
                )}

                {status === 'error' && (
                  <>
                    <Button onClick={() => navigate('/pricing')}>
                      Вернуться к тарифам
                    </Button>
                    <Button variant="outline" onClick={() => window.location.reload()}>
                      Проверить еще раз
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default PaymentSuccess;

