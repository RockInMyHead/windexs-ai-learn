import Navigation from "@/components/Navigation";
import { FileText, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const Exams = () => {
  const navigate = useNavigate();
  const [selectedExam, setSelectedExam] = useState<string | null>(null);

  const examTypes = [
    {
      id: "oge",
      title: "ОГЭ",
      description: "Основной государственный экзамен",
      subtitle: "9 класс",
      icon: "📝"
    },
    {
      id: "ege",
      title: "ЕГЭ",
      description: "Единый государственный экзамен",
      subtitle: "11 класс",
      icon: "🎓"
    }
  ];

  const examCourses = {
    oge: [
      { id: "oge-russian", title: "Русский язык", icon: "📖", lessons: 45 },
      { id: "oge-math", title: "Математика", icon: "🔢", lessons: 52 },
      { id: "oge-english", title: "Английский язык", icon: "🇬🇧", lessons: 38 },
      { id: "oge-physics", title: "Физика", icon: "⚛️", lessons: 35 },
      { id: "oge-chemistry", title: "Химия", icon: "🧪", lessons: 32 },
      { id: "oge-social", title: "Обществознание", icon: "👥", lessons: 40 }
    ],
    ege: [
      { id: "ege-russian", title: "Русский язык", icon: "📖", lessons: 60 },
      { id: "ege-math-basic", title: "Математика (базовый)", icon: "🔢", lessons: 48 },
      { id: "ege-math-prof", title: "Математика (профильный)", icon: "📊", lessons: 72 },
      { id: "ege-english", title: "Английский язык", icon: "🇬🇧", lessons: 55 },
      { id: "ege-physics", title: "Физика", icon: "⚛️", lessons: 65 },
      { id: "ege-chemistry", title: "Химия", icon: "🧪", lessons: 58 },
      { id: "ege-biology", title: "Биология", icon: "🧬", lessons: 60 },
      { id: "ege-history", title: "История", icon: "🏛️", lessons: 70 },
      { id: "ege-social", title: "Обществознание", icon: "👥", lessons: 68 }
    ]
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 animate-fade-in">
            <FileText className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
              Подготовка к экзаменам
            </h1>
            <p className="text-lg text-muted-foreground">
              Выберите тип экзамена и начните подготовку
            </p>
          </div>

          {!selectedExam ? (
            <section>
              <h2 className="text-2xl font-bold mb-6 text-center">Выберите экзамен</h2>
              <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                {examTypes.map((exam, index) => (
                  <Card
                    key={exam.id}
                    className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-[1.02] animate-fade-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                    onClick={() => setSelectedExam(exam.id)}
                  >
                    <CardHeader className="text-center">
                      <div className="text-6xl mb-4">{exam.icon}</div>
                      <CardTitle className="text-3xl">{exam.title}</CardTitle>
                      <CardDescription className="text-base">
                        {exam.description}
                      </CardDescription>
                      <p className="text-sm font-semibold text-primary mt-2">
                        {exam.subtitle}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <Button className="w-full" size="lg">
                        Выбрать
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : (
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">
                  Курсы подготовки к {selectedExam === 'oge' ? 'ОГЭ' : 'ЕГЭ'}
                </h2>
                <Button variant="outline" onClick={() => setSelectedExam(null)}>
                  Назад
                </Button>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {examCourses[selectedExam as keyof typeof examCourses].map((course, index) => (
                  <Card
                    key={course.id}
                    className="hover:shadow-lg transition-all duration-300 hover:scale-[1.02] animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <CardHeader>
                      <div className="text-4xl mb-3 text-center">{course.icon}</div>
                      <CardTitle className="text-center">{course.title}</CardTitle>
                      <CardDescription className="text-center">
                        {course.lessons} уроков
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button 
                        className="w-full"
                        onClick={() => navigate(`/learning-mode/${course.id}`)}
                      >
                        Начать подготовку
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};

export default Exams;
