import Navigation from "@/components/Navigation";
import { BookOpen, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";

const Library = () => {
  const myCourses = [
    {
      id: "english-grade-8",
      title: "Английский язык",
      grade: "8 класс",
      progress: 65,
      icon: "🇬🇧",
      nextLesson: "Present Perfect"
    },
    {
      id: "math-grade-8",
      title: "Математика",
      grade: "8 класс",
      progress: 42,
      icon: "🔢",
      nextLesson: "Квадратные уравнения"
    },
    {
      id: "physics-grade-9",
      title: "Физика",
      grade: "9 класс",
      progress: 78,
      icon: "⚛️",
      nextLesson: "Законы Ньютона"
    },
    {
      id: "russian-grade-8",
      title: "Русский язык",
      grade: "8 класс",
      progress: 55,
      icon: "📖",
      nextLesson: "Причастие"
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 animate-fade-in">
            <BookOpen className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
              Мои курсы
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Продолжайте изучение выбранных предметов
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {myCourses.map((course, index) => (
              <Card
                key={course.id}
                className="hover:shadow-lg transition-all duration-300 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CardHeader>
                  <div className="flex items-start gap-3 mb-2">
                    <div className="text-3xl">{course.icon}</div>
                    <div className="flex-1">
                      <CardTitle className="text-xl">{course.title}</CardTitle>
                      <CardDescription>{course.grade}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Прогресс</span>
                      <span className="font-semibold text-primary">{course.progress}%</span>
                    </div>
                    <Progress value={course.progress} />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Следующий урок: <span className="text-foreground font-medium">{course.nextLesson}</span>
                  </div>
                  <Button 
                    className="w-full"
                    onClick={() => {
                      const navigate = useNavigate();
                      navigate(`/learning-mode/${course.id}`);
                    }}
                  >
                    Продолжить обучение
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Library;
