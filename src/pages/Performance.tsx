import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPerformance, PerformanceRecord, getCourses, Course } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Award } from "lucide-react";
import { getCourseDisplayName } from "@/lib/utils";

const Performance = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [items, setItems] = useState<PerformanceRecord[]>([]);
  const [courseTitle, setCourseTitle] = useState<string>('Курс');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!courseId) return;
      try {
        const [perf, courses] = await Promise.all([
          getPerformance(courseId),
          getCourses().catch(() => [] as Course[])
        ]);
        setItems(perf);

        // Найти курс по id
        const found = courses.find((c) => c.id === courseId);
        if (found) {
          if (found.goal_name) {
            setCourseTitle(`${found.subject_name} — ${found.goal_name}`);
          } else if (found.grade) {
            setCourseTitle(`${found.subject_name} — ${found.grade} класс`);
          } else {
            setCourseTitle(found.subject_name);
          }
        } else {
          // fallback: попробовать распарсить courseId
          setCourseTitle(getCourseDisplayName(courseId));
        }
      } catch (error) {
        toast({
          title: "Ошибка",
          description: "Не удалось загрузить успеваемость",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [courseId, toast]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Курс</p>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
                {courseTitle}
              </h1>
              <p className="text-muted-foreground">Успеваемость: темы и оценки</p>
            </div>
            <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Назад
            </Button>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                <CardTitle>Успеваемость</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Пока нет оценок. Завершайте уроки, и Юлия выставит тему и оценку.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Тема урока</TableHead>
                        <TableHead>Оценка</TableHead>
                        <TableHead>Дата</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.topic}</TableCell>
                          <TableCell>{item.grade}</TableCell>
                          <TableCell>{new Date(item.created_at).toLocaleString('ru-RU')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Performance;

