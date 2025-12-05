import Navigation from "@/components/Navigation";
import { Trophy, Award, Target, Zap, Star } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useEffect, useMemo, useState } from "react";
import { getCourses } from "@/lib/api";

type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: any;
  unlocked: boolean;
  progress?: number;
  date?: string;
};

const Achievements = () => {
  const [coursesCount, setCoursesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [streak, setStreak] = useState(0);

  // Ежедневный вход для стрика
  useEffect(() => {
    const today = new Date().toDateString();
    const lastVisit = localStorage.getItem('ach_last_visit');
    let currentStreak = Number(localStorage.getItem('ach_streak') || '0');

    if (lastVisit !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastVisit === yesterday.toDateString()) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
      localStorage.setItem('ach_last_visit', today);
      localStorage.setItem('ach_streak', currentStreak.toString());
    }

    setStreak(currentStreak);
  }, []);

  // Загрузка курсов для вычисления достижений
  useEffect(() => {
    const loadData = async () => {
      try {
        const courses = await getCourses();
        setCoursesCount(courses.length);
      } catch (error) {
        console.error('Achievements: failed to load courses', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const achievementsComputed: Achievement[] = useMemo(() => {
    // Базовые достижения без привязки к очкам
    const base: Achievement[] = [
      {
        id: 'first_course',
        title: 'Первый шаг',
        description: 'Добавьте первый курс в библиотеку',
        icon: Target,
        unlocked: coursesCount >= 1,
        progress: Math.min(100, (coursesCount / 1) * 100),
      },
      {
        id: 'three_courses',
        title: 'Коллекционер',
        description: 'Добавьте 3 курса',
        icon: Trophy,
        unlocked: coursesCount >= 3,
        progress: Math.min(100, (coursesCount / 3) * 100),
      },
      {
        id: 'five_courses',
        title: 'Учёный',
        description: 'Добавьте 5 курсов',
        icon: Award,
        unlocked: coursesCount >= 5,
        progress: Math.min(100, (coursesCount / 5) * 100),
      },
      {
        id: 'streak_1',
        title: 'Старт серии',
        description: 'Зайдите 1 день подряд',
        icon: Zap,
        unlocked: streak >= 1,
        progress: Math.min(100, (streak / 1) * 100),
      },
      {
        id: 'streak_3',
        title: 'Разгон',
        description: '3 дня подряд в учебе',
        icon: Zap,
        unlocked: streak >= 3,
        progress: Math.min(100, (streak / 3) * 100),
      },
      {
        id: 'streak_7',
        title: 'Неделя фокуса',
        description: '7 дней подряд в учебе',
        icon: Zap,
        unlocked: streak >= 7,
        progress: Math.min(100, (streak / 7) * 100),
      },
    ];

    // Считаем баллы на основе базовых достижений
    const unlockedBase = base.filter(a => a.unlocked).length;
    const basePoints = unlockedBase * 10 + coursesCount * 2;

    // Достижение за очки
    const pointsAchievement: Achievement = {
      id: 'points_50',
      title: 'Первые 50 очков',
      description: 'Заработайте 50 баллов',
      icon: Star,
      unlocked: basePoints >= 50,
      progress: Math.min(100, (basePoints / 50) * 100),
    };

    const full = [...base, pointsAchievement];

    return full.map(a => ({
      ...a,
      date: a.unlocked ? new Date().toLocaleDateString('ru-RU') : undefined,
    }));
  }, [coursesCount, streak]);

  // Простая система подсчёта: 10 баллов за каждое достижение + 2 за курс
  const points = useMemo(() => {
    const unlockedCount = achievementsComputed.filter(a => a.unlocked).length;
    return unlockedCount * 10 + coursesCount * 2;
  }, [achievementsComputed, coursesCount]);

  const unlockedCount = achievementsComputed.filter(a => a.unlocked).length;
  const totalCount = achievementsComputed.length;

  const stats = [
    { label: "Всего достижений", value: `${unlockedCount}/${totalCount}`, icon: Trophy },
    { label: "Дней подряд", value: `${streak}`, icon: Zap },
    { label: "Баллов заработано", value: `${points}`, icon: Star },
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

          {!isLoading && achievementsComputed.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6">
              {achievementsComputed.map((achievement, index) => {
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
                            <span className="font-semibold">
                              {Math.round(achievement.progress)}%
                            </span>
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
          ) : (
            <div className="text-center py-16">
              <div className="max-w-md mx-auto">
                <div className="w-24 h-24 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trophy className="w-12 h-12 text-yellow-500" />
                </div>
                <h3 className="text-2xl font-semibold mb-4">У вас пока нет достижений</h3>
                <p className="text-muted-foreground mb-8">
                  Начните обучение, чтобы получать награды за успехи и достижения
                </p>
                <div className="text-sm text-muted-foreground">
                  Первые достижения появятся после прохождения уроков
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Achievements;
