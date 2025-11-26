import Navigation from "@/components/Navigation";
import { GraduationCap, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";

const CourseStart = () => {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const subjectNames: Record<string, string> = {
    english: "Английский язык",
    russian: "Русский язык",
    math: "Математика",
    physics: "Физика",
    history: "История",
    geography: "География",
    social: "Обществознание",
    arabic: "Арабский язык",
    chinese: "Китайский язык"
  };

  const grades = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  
  const goals = [
    { id: "school", title: "Школьная программа", description: "Изучение по стандартной программе", icon: "📚" },
    { id: "oge", title: "Подготовка к ОГЭ", description: "Подготовка к экзамену в 9 классе", icon: "📝" },
    { id: "ege", title: "Подготовка к ЕГЭ", description: "Подготовка к экзамену в 11 классе", icon: "🎓" },
    { id: "advanced", title: "Углубленное изучение", description: "Расширенная программа", icon: "🚀" }
  ];

  const handleStart = () => {
    if (selectedOption) {
      navigate(`/learning-mode/${subjectId}-${selectedOption}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 animate-fade-in">
            <GraduationCap className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
              {subjectNames[subjectId || ""] || "Предмет"}
            </h1>
            <p className="text-lg text-muted-foreground">
              Выберите класс или цель обучения
            </p>
          </div>

          <section className="mb-12">
            <div className="flex items-center gap-2 mb-6">
              <GraduationCap className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold">Выберите класс</h2>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11 gap-3">
              {grades.map((grade) => (
                <Button
                  key={grade}
                  variant={selectedOption === `grade-${grade}` ? "default" : "outline"}
                  className="h-16 text-lg font-bold"
                  onClick={() => setSelectedOption(`grade-${grade}`)}
                >
                  {grade}
                </Button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-6">
              <Target className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold">Или выберите цель</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {goals.map((goal) => (
                <Card
                  key={goal.id}
                  className={`cursor-pointer transition-all duration-300 hover:scale-[1.02] ${
                    selectedOption === `goal-${goal.id}` 
                      ? "border-primary shadow-lg" 
                      : "hover:shadow-md"
                  }`}
                  onClick={() => setSelectedOption(`goal-${goal.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">{goal.icon}</div>
                      <div className="flex-1">
                        <CardTitle className="text-lg">{goal.title}</CardTitle>
                        <CardDescription>{goal.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>

          <div className="mt-12 flex justify-center">
            <Button 
              size="lg" 
              className="px-12"
              disabled={!selectedOption}
              onClick={handleStart}
            >
              Продолжить
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CourseStart;
