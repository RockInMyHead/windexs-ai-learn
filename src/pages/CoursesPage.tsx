import Navigation from "@/components/Navigation";
import { GraduationCap, Clock, Users, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const CoursesPage = () => {
  const activeCourses = [
    {
      title: "Веб-разработка",
      progress: 65,
      nextLesson: "React Hooks",
      duration: "2ч 30мин",
      students: 1234,
    },
    {
      title: "Python для Data Science",
      progress: 42,
      nextLesson: "Pandas библиотека",
      duration: "3ч 15мин",
      students: 892,
    },
  ];

  const recommendedCourses = [
    {
      title: "Machine Learning",
      description: "Основы машинного обучения с Python",
      rating: 4.8,
      students: 2341,
      duration: "40 часов",
    },
    {
      title: "UI/UX Design",
      description: "Создание современных интерфейсов",
      rating: 4.9,
      students: 1567,
      duration: "25 часов",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 animate-fade-in">
            <GraduationCap className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
              Мои курсы
            </h1>
            <p className="text-lg text-muted-foreground">
              Продолжайте обучение и откройте новые возможности
            </p>
          </div>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Активные курсы</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {activeCourses.map((course, index) => (
                <Card key={index} className="animate-fade-in">
                  <CardHeader>
                    <CardTitle>{course.title}</CardTitle>
                    <CardDescription>
                      Следующий урок: {course.nextLesson}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Прогресс</span>
                        <span className="font-semibold">{course.progress}%</span>
                      </div>
                      <Progress value={course.progress} />
                    </div>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {course.duration}
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {course.students}
                      </div>
                    </div>
                    <Button className="w-full">Продолжить обучение</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-6">Рекомендуем для вас</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {recommendedCourses.map((course, index) => (
                <Card
                  key={index}
                  className="hover:shadow-lg transition-all duration-300 animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-1 text-yellow-500">
                        <Star className="w-4 h-4 fill-current" />
                        <span className="text-sm font-semibold">{course.rating}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{course.duration}</span>
                    </div>
                    <CardTitle>{course.title}</CardTitle>
                    <CardDescription>{course.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="w-4 h-4" />
                        {course.students} студентов
                      </div>
                    </div>
                    <Button variant="outline" className="w-full">
                      Подробнее
                    </Button>
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

export default CoursesPage;
