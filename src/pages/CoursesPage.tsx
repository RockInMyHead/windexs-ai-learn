import Navigation from "@/components/Navigation";
import { GraduationCap, BookOpen, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

const CoursesPage = () => {
  const navigate = useNavigate();

  const subjects = [
    {
      id: "english",
      title: "Английский язык",
      description: "Изучение английского языка с нуля до продвинутого уровня. Грамматика, лексика, разговорная практика.",
      grades: "1 - 11",
      icon: "🇬🇧"
    },
    {
      id: "russian",
      title: "Русский язык",
      description: "Грамматика, орфография, пунктуация и развитие связной речи. Литературное чтение и анализ текстов.",
      grades: "1 - 11",
      icon: "📖"
    },
    {
      id: "math",
      title: "Математика",
      description: "Арифметика, алгебра, геометрия и математический анализ. Решение задач и развитие логического мышления.",
      grades: "1 - 11",
      icon: "🔢"
    },
    {
      id: "physics",
      title: "Физика",
      description: "Основы физики: механика, электричество, оптика, термодинамика. Эксперименты и практические задачи.",
      grades: "7 - 11",
      icon: "⚛️"
    },
    {
      id: "history",
      title: "История",
      description: "История России и мира. Важные события, личности и культурные достижения.",
      grades: "5 - 11",
      icon: "🏛️"
    },
    {
      id: "geography",
      title: "География",
      description: "Физическая и экономическая география. Изучение планеты Земля и ее народов.",
      grades: "5 - 11",
      icon: "🌍"
    },
    {
      id: "social",
      title: "Обществознание",
      description: "Основы общественных наук: право, экономика, социология, политология.",
      grades: "5 - 11",
      icon: "👥"
    },
    {
      id: "arabic",
      title: "Арабский язык",
      description: "Изучение арабского языка: алфавит, грамматика, лексика и разговорная практика. Культура арабских стран.",
      grades: "1 - 11",
      icon: "🇸🇦"
    },
    {
      id: "chinese",
      title: "Китайский язык",
      description: "Изучение китайского языка: иероглифы, грамматика, лексика и разговорная практика. Культура Китая.",
      grades: "1 - 11",
      icon: "🇨🇳"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 animate-fade-in">
            <GraduationCap className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
              Выберите предмет для изучения
            </h1>
            <div className="flex flex-wrap justify-center gap-4 text-sm md:text-base text-muted-foreground">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                <span>9 предметов</span>
              </div>
              <span>•</span>
              <span>Персонализированное обучение</span>
              <span>•</span>
              <span>Все классы с 1 по 11</span>
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-6">
              <Badge variant="secondary" className="px-4 py-2">
                Интерактивные уроки
              </Badge>
              <Badge variant="secondary" className="px-4 py-2">
                ИИ преподаватель
              </Badge>
              <Badge variant="secondary" className="px-4 py-2 flex items-center gap-1">
                <Mic className="w-3 h-3" />
                Голосовое общение
              </Badge>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subject, index) => (
              <Card
                key={subject.id}
                className="hover:shadow-xl transition-all duration-300 hover:scale-[1.02] animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <CardHeader>
                  <div className="text-4xl mb-3">{subject.icon}</div>
                  <CardTitle className="text-xl">{subject.title}</CardTitle>
                  <CardDescription className="min-h-[60px]">
                    {subject.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Классы:</span>
                    <Badge variant="outline">{subject.grades}</Badge>
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={() => navigate(`/course-start/${subject.id}`)}
                  >
                    Начать обучение
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

export default CoursesPage;
