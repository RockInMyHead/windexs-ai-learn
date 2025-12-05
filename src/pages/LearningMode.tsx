import Navigation from "@/components/Navigation";
import { MessageSquare, Mic, Sparkles, Lock, CreditCard, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useParams, useNavigate } from "react-router-dom";
import { getCourseDisplayName } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { checkAccess, getUserSubscription, type AccessCheck, type UserSubscription } from "@/lib/api";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const LearningMode = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [lessonAccess, setLessonAccess] = useState<AccessCheck | null>(null);
  const [voiceAccess, setVoiceAccess] = useState<AccessCheck | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);

  const courseName = getCourseDisplayName(courseId || "");

  useEffect(() => {
    if (token) {
      loadAccessInfo();
    } else {
      setLoading(false);
    }
  }, [token]);

  const loadAccessInfo = async () => {
    try {
      const [lessonData, voiceData, subData] = await Promise.all([
        checkAccess('lessons'),
        checkAccess('voice'),
        getUserSubscription()
      ]);
      setLessonAccess(lessonData);
      setVoiceAccess(voiceData);
      setSubscription(subData);
    } catch (error) {
      console.error('Failed to load access info:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleModeClick = (mode: 'chat' | 'voice', route: string) => {
    const access = mode === 'chat' ? lessonAccess : voiceAccess;
    
    if (!access?.hasAccess) {
      toast({
        title: mode === 'chat' ? "Уроки закончились" : "Голосовые сессии закончились",
        description: "Оформите подписку для продолжения обучения",
      });
      navigate('/pricing');
      return;
    }

    navigate(route);
  };

  const modes = [
    {
      id: "chat",
      title: "Текстовый чат",
      description: "Общайтесь с AI-преподавателем в текстовом формате. Задавайте вопросы и получайте подробные объяснения.",
      icon: MessageSquare,
      features: ["Текстовые объяснения", "Примеры и задачи", "Мгновенные ответы"],
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      route: `/course-chat/${courseId}`,
      access: lessonAccess,
      accessType: 'chat' as const
    },
    {
      id: "voice",
      title: "Голосовое общение",
      description: "Разговаривайте с AI-преподавателем голосом в реальном времени. Практикуйте произношение и получайте живые ответы.",
      icon: Mic,
      features: ["Живой диалог", "Практика произношения", "Естественное общение"],
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      route: `/voice-chat/${courseId}`,
      access: voiceAccess,
      accessType: 'voice' as const
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 pt-24 pb-16">
          <div className="flex items-center justify-center min-h-[50vh]">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 animate-fade-in">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Sparkles className="w-12 h-12 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
              Выберите режим обучения
            </h1>
            <p className="text-lg text-muted-foreground">
              Как вы хотите общаться с AI-преподавателем?
              <br />
              <span className="block text-2xl md:text-3xl font-bold text-emerald-600 mt-2">
                {courseName}
              </span>
            </p>
          </div>

          {/* Subscription info banner */}
          {subscription && (
            <div className="mb-8 p-4 rounded-xl bg-gradient-to-r from-primary/5 via-purple-500/5 to-pink-500/5 border flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <p className="text-sm text-muted-foreground">Ваш план: <span className="font-semibold text-foreground">{subscription.planName || 'Нет подписки'}</span></p>
                <p className="text-sm">
                  Уроков: <span className="font-bold text-primary">{subscription.isUnlimited ? '∞' : subscription.lessonsRemaining}</span>
                  {' • '}
                  Голосовых: <span className="font-bold text-primary">{subscription.isUnlimited ? '∞' : subscription.voiceSessionsRemaining}</span>
                </p>
              </div>
              {!subscription.hasSubscription && (
                <Button size="sm" onClick={() => navigate('/pricing')} className="gap-2">
                  <CreditCard className="w-4 h-4" />
                  Оформить подписку
                </Button>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-8">
            {modes.map((mode, index) => {
              const Icon = mode.icon;
              const hasAccess = mode.access?.hasAccess;
              const remaining = mode.access?.remaining ?? 0;
              const isUnlimited = mode.access?.isUnlimited;
              
              return (
                <Card
                  key={mode.id}
                  className={`cursor-pointer transition-all duration-300 animate-fade-in group ${
                    hasAccess 
                      ? 'hover:shadow-2xl hover:scale-[1.03]' 
                      : 'opacity-75 hover:opacity-100'
                  }`}
                  style={{ animationDelay: `${index * 150}ms` }}
                  onClick={() => handleModeClick(mode.accessType, mode.route)}
                >
                  <CardHeader className="text-center pb-4">
                    <div className={`relative w-20 h-20 mx-auto mb-4 rounded-2xl ${mode.bgColor} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className={`w-10 h-10 ${mode.color}`} />
                      {!hasAccess && (
                        <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
                          <Lock className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                    <CardTitle className="text-2xl mb-2">{mode.title}</CardTitle>
                    <CardDescription className="text-base">
                      {mode.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 mb-4">
                      {mode.features.map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <div className={`w-1.5 h-1.5 rounded-full ${mode.bgColor}`}></div>
                          <span className="text-muted-foreground">{feature}</span>
                        </div>
                      ))}
                    </div>
                    
                    {/* Access status */}
                    <div className={`mt-4 p-3 rounded-lg ${hasAccess ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
                      {hasAccess ? (
                        <p className="text-sm text-center font-medium text-green-600">
                          {isUnlimited ? '∞ Безлимитный доступ' : `Осталось: ${remaining}`}
                        </p>
                      ) : (
                        <p className="text-sm text-center font-medium text-amber-600">
                          {mode.accessType === 'chat' ? 'Уроки закончились' : 'Голосовые сессии закончились'}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* No subscription message */}
          {!subscription?.hasSubscription && (
            <div className="mt-10 text-center p-8 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border border-amber-500/20">
              <Lock className="w-12 h-12 mx-auto mb-4 text-amber-500" />
              <h3 className="text-xl font-bold mb-2">Оформите подписку</h3>
              <p className="text-muted-foreground mb-4">
                Чтобы начать обучение, выберите подходящий тарифный план
              </p>
              <Button onClick={() => navigate('/pricing')} className="gap-2">
                <CreditCard className="w-4 h-4" />
                Выбрать тариф
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default LearningMode;
