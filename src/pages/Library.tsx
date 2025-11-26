import Navigation from "@/components/Navigation";
import { BookOpen, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Library = () => {
  const materials = [
    {
      title: "Основы JavaScript",
      category: "Программирование",
      level: "Начальный",
      lessons: 24,
    },
    {
      title: "React для начинающих",
      category: "Программирование",
      level: "Средний",
      lessons: 18,
    },
    {
      title: "Математический анализ",
      category: "Математика",
      level: "Продвинутый",
      lessons: 32,
    },
    {
      title: "Английский язык B2",
      category: "Языки",
      level: "Средний",
      lessons: 45,
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
              Библиотека материалов
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Тысячи учебных материалов, адаптированных под ваш уровень
            </p>
          </div>

          <div className="flex gap-4 mb-8">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Поиск материалов..."
                className="pl-10"
              />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              Фильтры
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {materials.map((material, index) => (
              <Card
                key={index}
                className="hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
                      {material.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {material.level}
                    </span>
                  </div>
                  <CardTitle className="text-xl">{material.title}</CardTitle>
                  <CardDescription>
                    {material.lessons} уроков
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">
                    Начать изучение
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
