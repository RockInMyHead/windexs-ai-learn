import Navigation from "@/components/Navigation";
import { MessageSquare, Mic, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useParams, useNavigate } from "react-router-dom";

const LearningMode = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const modes = [
    {
      id: "chat",
      title: "Текстовый чат",
      description: "Общайтесь с AI-преподавателем в текстовом формате. Задавайте вопросы и получайте подробные объяснения.",
      icon: MessageSquare,
      features: ["Текстовые объяснения", "Примеры и задачи", "Мгновенные ответы"],
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      route: `/course-chat/${courseId}`
    },
    {
      id: "voice",
      title: "Голосовое общение",
      description: "Разговаривайте с AI-преподавателем голосом в реальном времени. Практикуйте произношение и получайте живые ответы.",
      icon: Mic,
      features: ["Живой диалог", "Практика произношения", "Естественное общение"],
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      route: `/voice-chat/${courseId}`
    }
  ];

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
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {modes.map((mode, index) => {
              const Icon = mode.icon;
              return (
                <Card
                  key={mode.id}
                  className="cursor-pointer hover:shadow-2xl transition-all duration-300 hover:scale-[1.03] animate-fade-in group"
                  style={{ animationDelay: `${index * 150}ms` }}
                  onClick={() => navigate(mode.route)}
                >
                  <CardHeader className="text-center pb-4">
                    <div className={`w-20 h-20 mx-auto mb-4 rounded-2xl ${mode.bgColor} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className={`w-10 h-10 ${mode.color}`} />
                    </div>
                    <CardTitle className="text-2xl mb-2">{mode.title}</CardTitle>
                    <CardDescription className="text-base">
                      {mode.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {mode.features.map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <div className={`w-1.5 h-1.5 rounded-full ${mode.bgColor}`}></div>
                          <span className="text-muted-foreground">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};

export default LearningMode;
