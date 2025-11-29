import Navigation from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, CheckCircle, Clock, AlertCircle, BookOpen, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCourseDisplayName } from "@/lib/utils";

interface HomeworkItem {
  id: string;
  course_id: string;
  title: string;
  description: string;
  status: 'pending' | 'submitted' | 'checked' | 'completed';
  score?: number;
  feedback?: string;
  due_date?: string;
  created_at: string;
}

interface Course {
  id: string;
  subject_id: string;
  subject_name: string;
  grade?: string;
  goal?: string;
}

const Homework = () => {
  const { token, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadData();
  }, [isAuthenticated, navigate]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load user courses
      const coursesRes = await fetch('https://teacher.windexs.ru/api/courses', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (coursesRes.ok) {
        const coursesData = await coursesRes.json();
        setCourses(coursesData.courses || []);

        // Load homework for all courses
        const allHomework: HomeworkItem[] = [];
        for (const course of coursesData.courses || []) {
          const courseId = `${course.subject_id}-${course.grade ? 'grade-' + course.grade : 'goal-' + course.goal}`;
          const hwRes = await fetch(`https://teacher.windexs.ru/api/homework/${courseId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (hwRes.ok) {
            const hwData = await hwRes.json();
            allHomework.push(...(hwData.homework || []));
          }
        }
        setHomework(allHomework);
      }
    } catch (error) {
      console.error('Failed to load homework:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" /> Ожидает</Badge>;
      case 'submitted':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><AlertCircle className="w-3 h-3 mr-1" /> На проверке</Badge>;
      case 'checked':
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200"><CheckCircle className="w-3 h-3 mr-1" /> Проверено</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Выполнено</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredHomework = selectedCourse
    ? homework.filter(h => h.course_id === selectedCourse)
    : homework;

  const pendingCount = homework.filter(h => h.status === 'pending').length;
  const completedCount = homework.filter(h => h.status === 'completed' || h.status === 'checked').length;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8 animate-fade-in">
            <div className="flex items-center justify-center gap-2 mb-4">
              <ClipboardList className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent mb-2">
              Домашние задания
            </h1>
            <p className="text-muted-foreground">
              Отслеживайте и выполняйте задания от AI-преподавателя
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200">
              <CardContent className="p-4 text-center">
                <Clock className="w-6 h-6 text-yellow-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-yellow-700">{pendingCount}</div>
                <div className="text-xs text-yellow-600">Ожидают</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
              <CardContent className="p-4 text-center">
                <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-green-700">{completedCount}</div>
                <div className="text-xs text-green-600">Выполнено</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
              <CardContent className="p-4 text-center">
                <BookOpen className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-blue-700">{courses.length}</div>
                <div className="text-xs text-blue-600">Курсов</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
              <CardContent className="p-4 text-center">
                <ClipboardList className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-purple-700">{homework.length}</div>
                <div className="text-xs text-purple-600">Всего заданий</div>
              </CardContent>
            </Card>
          </div>

          {/* Course filter */}
          {courses.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              <Button
                variant={selectedCourse === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCourse(null)}
              >
                Все курсы
              </Button>
              {courses.map(course => {
                const courseId = `${course.subject_id}-${course.grade ? 'grade-' + course.grade : 'goal-' + course.goal}`;
                return (
                  <Button
                    key={course.id}
                    variant={selectedCourse === courseId ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCourse(courseId)}
                  >
                    {course.subject_name}
                  </Button>
                );
              })}
            </div>
          )}

          {/* Homework list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredHomework.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <ClipboardList className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                  Домашних заданий пока нет
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Начните урок с AI-преподавателем, и он будет давать вам задания для закрепления материала
                </p>
                <Button onClick={() => navigate('/courses')}>
                  Перейти к курсам
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredHomework.map((item, index) => (
                <Card
                  key={item.id}
                  className="hover:shadow-md transition-shadow animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{item.title}</CardTitle>
                        <CardDescription>
                          {getCourseDisplayName(item.course_id)}
                        </CardDescription>
                      </div>
                      {getStatusBadge(item.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mb-3">{item.description}</p>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {item.due_date && (
                          <span>Срок: {new Date(item.due_date).toLocaleDateString('ru-RU')}</span>
                        )}
                        {item.score !== undefined && (
                          <span className="font-semibold text-primary">Оценка: {item.score}/100</span>
                        )}
                      </div>

                      {item.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => navigate(`/course/${item.course_id}/chat`)}
                        >
                          Выполнить
                        </Button>
                      )}
                    </div>

                    {item.feedback && (
                      <div className="mt-3 p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium mb-1">Отзыв преподавателя:</p>
                        <p className="text-sm text-muted-foreground">{item.feedback}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Homework;

