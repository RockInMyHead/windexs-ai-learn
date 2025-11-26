import Navigation from "@/components/Navigation";
import { Trophy, Award, Target, Zap, Star } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const Achievements = () => {
  const achievements = [
    {
      title: "Первые шаги",
      description: "Завершите первый урок",
      icon: Star,
      unlocked: true,
      date: "15 ноября 2024",
    },
    {
      title: "Неделя подряд",
      description: "7 дней занятий без пропусков",
      icon: Zap,
      unlocked: true,
      date: "20 ноября 2024",
    },
    {
      title: "Мастер курса",
      description: "Завершите полный курс",
      icon: Award,
      unlocked: false,
      progress: 65,
    },
    {
      title: "Целеустремленный",
      description: "Достигните 3 целей подряд",
      icon: Target,
      unlocked: false,
      progress: 33,
    },
  ];

  const stats = [
    { label: "Всего достижений", value: "2/12", icon: Trophy },
    { label: "Дней подряд", value: "7", icon: Zap },
    { label: "Баллов заработано", value: "1,234", icon: Star },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 animate-fade-in">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">
              Достижения
            </h1>
            <p className="text-lg text-muted-foreground">
              Отслеживайте свой прогресс и получайте награды
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <Card
                  key={index}
                  className="text-center animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <CardHeader className="pb-2">
                    <Icon className="w-8 h-8 mx-auto text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-primary mb-1">
                      {stat.value}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {stat.label}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {achievements.map((achievement, index) => {
              const Icon = achievement.icon;
              return (
                <Card
                  key={index}
                  className={`animate-fade-in ${
                    achievement.unlocked
                      ? "border-primary shadow-lg shadow-primary/20"
                      : "opacity-60"
                  }`}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          achievement.unlocked
                            ? "bg-gradient-to-br from-yellow-400 to-orange-500"
                            : "bg-muted"
                        }`}
                      >
                        <Icon
                          className={`w-6 h-6 ${
                            achievement.unlocked ? "text-white" : "text-muted-foreground"
                          }`}
                        />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-xl mb-1">
                          {achievement.title}
                        </CardTitle>
                        <CardDescription>
                          {achievement.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {achievement.unlocked ? (
                      <div className="flex items-center gap-2 text-sm text-primary">
                        <Award className="w-4 h-4" />
                        Получено: {achievement.date}
                      </div>
                    ) : achievement.progress ? (
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span>Прогресс</span>
                          <span className="font-semibold">{achievement.progress}%</span>
                        </div>
                        <Progress value={achievement.progress} />
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Заблокировано
                      </div>
                    )}
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

export default Achievements;
