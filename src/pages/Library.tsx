import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import { BookOpen, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getCourses, deleteCourse, Course } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Library = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadCourses = async () => {
      if (!isAuthenticated) {
        setIsLoading(false);
        return;
      }
      
      try {
        const data = await getCourses();
        setCourses(data);
      } catch (error) {
        console.error('Error loading courses:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadCourses();
  }, [isAuthenticated]);

  const handleDeleteCourse = async (courseId: string) => {
    try {
      await deleteCourse(courseId);
      setCourses(courses.filter(c => c.id !== courseId));
      toast({
        title: "Курс удален",
        description: "Курс был удален из вашей библиотеки",
      });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить курс",
        variant: "destructive",
      });
    }
  };

  const getCourseDisplayName = (course: Course) => {
    if (course.grade) {
      return `${course.subject_name} - ${course.grade} класс`;
    }
    if (course.goal_name) {
      return `${course.subject_name} - ${course.goal_name}`;
    }
    return course.subject_name;
  };

  const getCourseSubtitle = (course: Course) => {
    if (course.grade) {
      return `${course.grade} класс`;
    }
    if (course.goal_name) {
      return course.goal_name;
    }
    return '';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 pt-24 pb-16">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-6xl mx-auto">
          {courses.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6">
              {courses.map((course, index) => (
                <Card
                  key={course.id}
                  className="hover:shadow-lg transition-all duration-300 animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <CardHeader>
                    <div className="flex items-start gap-3 mb-2">
                      <div className="text-3xl">{course.icon}</div>
                      <div className="flex-1">
                        <CardTitle className="text-xl">{course.subject_name}</CardTitle>
                        <CardDescription>{getCourseSubtitle(course)}</CardDescription>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить курс?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Вы уверены, что хотите удалить "{getCourseDisplayName(course)}" из библиотеки? Прогресс будет потерян.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteCourse(course.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Удалить
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
                      Следующий урок: <span className="text-foreground font-medium">{course.next_lesson}</span>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => navigate(`/learning-mode/${course.subject_id}-${course.grade ? `grade-${course.grade}` : `goal-${course.goal}`}`)}
                    >
                      Продолжить обучение
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="max-w-md mx-auto">
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <BookOpen className="w-12 h-12 text-primary" />
                </div>
                <h3 className="text-2xl font-semibold mb-4">У вас пока нет курсов</h3>
                <p className="text-muted-foreground mb-8">
                  Начните обучение, выбрав интересующие вас предметы из каталога курсов
                </p>
                <Button
                  onClick={() => navigate("/courses")}
                  className="group"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Выбрать курсы
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Library;
