import Navigation from "@/components/Navigation";
import { GraduationCap, Target, BookOpen, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { addCourse } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const CourseStart = () => {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  const subjectIcons: Record<string, string> = {
    english: "🇬🇧",
    russian: "📖",
    math: "🔢",
    physics: "⚛️",
    history: "🏛️",
    geography: "🌍",
    social: "👥",
    arabic: "🇸🇦",
    chinese: "🇨🇳"
  };

  // Языковые предметы с целями
  const languageSubjects = ["english", "chinese", "arabic"];
  const isLanguageSubject = languageSubjects.includes(subjectId || "");

  const grades = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  // Цели только для языков (Английский, Китайский, Арабский)
  const languageGoals = [
    { id: "travel", title: "Для путешествий", description: "Базовые фразы и общение в поездках", icon: "✈️" },
    { id: "communication", title: "Для общения", description: "Разговорный язык и повседневное общение", icon: "💬" },
    { id: "study", title: "Для обучения", description: "Академический язык и подготовка к экзаменам", icon: "📖" }
  ];

  // Цели показываются только для языковых предметов
  const goals = isLanguageSubject ? languageGoals : [];

  const getSelectedInfo = () => {
    if (!selectedOption) return null;
    
    if (selectedOption.startsWith('grade-')) {
      const grade = selectedOption.replace('grade-', '');
      return { type: 'grade', value: grade, name: `${grade} класс` };
    } else if (selectedOption.startsWith('goal-')) {
      const goalId = selectedOption.replace('goal-', '');
      const goal = goals.find(g => g.id === goalId);
      return { type: 'goal', value: goalId, name: goal?.title || '', icon: goal?.icon };
    }
    return null;
  };

  const handleStartCourse = async (mode: 'lesson' | 'voice') => {
    if (!selectedOption || !subjectId) return;
    
    setIsLoading(true);
    const info = getSelectedInfo();
    
    try {
      // Add course to library
      const result = await addCourse({
        subjectId,
        subjectName: subjectNames[subjectId] || subjectId,
        grade: info?.type === 'grade' ? info.value : undefined,
        goal: info?.type === 'goal' ? info.value : undefined,
        goalName: info?.type === 'goal' ? info.name : undefined,
        icon: subjectIcons[subjectId] || '📚'
      });

      if (result.isDuplicate) {
        toast({
          title: "Курс уже выбран",
          description: `${subjectNames[subjectId]} уже есть в вашей библиотеке`,
        });
      } else {
        toast({
          title: "Курс добавлен",
          description: `${subjectNames[subjectId]} добавлен в вашу библиотеку`,
        });
      }

      // Navigate to selected mode
      const courseId = `${subjectId}-${selectedOption}`;
      if (mode === 'lesson') {
        navigate(`/learning-mode/${courseId}`);
      } else if (mode === 'voice') {
        navigate(`/voice-chat/${courseId}`);
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось добавить курс",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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

          {goals.length > 0 && (
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
          )}

          {selectedOption && (
            <div className="mt-12 animate-fade-in">
              <div className="flex justify-center max-w-md mx-auto">
                <Button
                  size="lg"
                  className="h-20 flex flex-col gap-2 w-full max-w-sm"
                  disabled={isLoading}
                  onClick={() => handleStartCourse('lesson')}
                >
                  <BookOpen className="w-6 h-6" />
                  <span>Начать урок</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default CourseStart;
