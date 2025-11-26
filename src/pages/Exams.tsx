import Navigation from "@/components/Navigation";
import { FileText, Calendar, Clock, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Exams = () => {
  const upcomingExams = [
    {
      title: "JavaScript Основы",
      date: "28 ноября 2024",
      time: "14:00",
      duration: "60 мин",
      questions: 30,
    },
    {
      title: "React Advanced",
      date: "5 декабря 2024",
      time: "16:00",
      duration: "90 мин",
      questions: 45,
    },
  ];

  const completedExams = [
    {
      title: "HTML & CSS Базовый",
      date: "15 ноября 2024",
      score: 92,
      passed: true,
    },
    {
      title: "TypeScript Введение",
      date: "10 ноября 2024",
      score: 78,
      passed: true,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 animate-fade-in">
            <FileText className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
              Экзамены
            </h1>
            <p className="text-lg text-muted-foreground">
              Проверьте свои знания и получите сертификаты
            </p>
          </div>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Предстоящие экзамены</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {upcomingExams.map((exam, index) => (
                <Card
                  key={index}
                  className="border-primary/50 hover:shadow-lg transition-all duration-300 animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <CardHeader>
                    <CardTitle>{exam.title}</CardTitle>
                    <CardDescription>
                      {exam.questions} вопросов • {exam.duration}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span>{exam.date}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 text-primary" />
                        <span>{exam.time}</span>
                      </div>
                    </div>
                    <Button className="w-full">Записаться</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-6">Завершенные экзамены</h2>
            <div className="space-y-4">
              {completedExams.map((exam, index) => (
                <Card
                  key={index}
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <CardContent className="flex items-center justify-between p-6">
                    <div className="flex items-center gap-4">
                      {exam.passed ? (
                        <CheckCircle className="w-8 h-8 text-green-500" />
                      ) : (
                        <XCircle className="w-8 h-8 text-red-500" />
                      )}
                      <div>
                        <h3 className="font-semibold text-lg">{exam.title}</h3>
                        <p className="text-sm text-muted-foreground">{exam.date}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-2xl font-bold ${
                          exam.passed ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {exam.score}%
                      </div>
                      <Button variant="ghost" size="sm" className="mt-2">
                        Посмотреть результаты
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Exams;
