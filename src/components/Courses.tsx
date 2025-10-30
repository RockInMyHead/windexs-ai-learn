import { Code, Languages, Calculator, Palette, Music, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

const courses = [
  {
    icon: Code,
    title: "Программирование",
    description: "Python, JavaScript, React и другие современные технологии",
    students: "3.5K",
    color: "from-primary to-accent"
  },
  {
    icon: Languages,
    title: "Иностранные языки",
    description: "Английский, немецкий, испанский с AI-ассистентом",
    students: "2.8K",
    color: "from-accent to-primary"
  },
  {
    icon: Calculator,
    title: "Математика",
    description: "От базового уровня до высшей математики",
    students: "2.2K",
    color: "from-primary to-accent"
  },
  {
    icon: Palette,
    title: "Дизайн",
    description: "UI/UX, графический дизайн, 3D моделирование",
    students: "1.9K",
    color: "from-accent to-primary"
  },
  {
    icon: Music,
    title: "Музыка",
    description: "Теория, композиция, игра на инструментах",
    students: "1.5K",
    color: "from-primary to-accent"
  },
  {
    icon: Globe,
    title: "Культура",
    description: "История, литература, искусство",
    students: "1.1K",
    color: "from-accent to-primary"
  }
];

const Courses = () => {
  return (
    <section className="py-24 px-4 bg-gradient-to-b from-secondary/30 to-background">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Популярные <span className="text-primary">направления</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Выберите курс и начните персонализированное обучение уже сегодня
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {courses.map((course, index) => {
            const Icon = course.icon;
            return (
              <div
                key={index}
                className="group p-8 bg-card rounded-3xl border border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 cursor-pointer animate-scale-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className={`w-14 h-14 bg-gradient-to-br ${course.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                
                <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                  {course.title}
                </h3>
                
                <p className="text-muted-foreground mb-4 leading-relaxed">
                  {course.description}
                </p>
                
                <div className="flex items-center justify-between pt-4 border-t border-border/50">
                  <span className="text-sm text-muted-foreground">
                    {course.students} студентов
                  </span>
                  <span className="text-sm font-medium text-primary group-hover:translate-x-1 transition-transform">
                    Подробнее →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="text-center animate-fade-in">
          <Button 
            size="lg"
            variant="outline"
            className="border-primary/30 hover:bg-primary/5 hover:border-primary transition-all duration-300"
          >
            Смотреть все курсы
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Courses;
