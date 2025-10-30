import { Brain, Target, Rocket, BarChart3, BookOpen, Zap } from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "AI Адаптация",
    description: "Искусственный интеллект анализирует ваш прогресс и адаптирует программу под ваш темп и стиль обучения"
  },
  {
    icon: Target,
    title: "Персональный план",
    description: "Индивидуальная траектория обучения, созданная специально для достижения ваших целей"
  },
  {
    icon: Rocket,
    title: "Быстрый старт",
    description: "Начните обучение сразу после регистрации. AI создаст ваш план за считанные минуты"
  },
  {
    icon: BarChart3,
    title: "Анализ прогресса",
    description: "Детальная статистика и аналитика вашего прогресса в реальном времени"
  },
  {
    icon: BookOpen,
    title: "Умные материалы",
    description: "Контент автоматически подстраивается под ваш уровень знаний и интересы"
  },
  {
    icon: Zap,
    title: "Эффективность",
    description: "Учитесь на 40% быстрее благодаря персонализированному подходу"
  }
];

const Features = () => {
  return (
    <section className="py-24 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-secondary/30 via-background to-secondary/30" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--primary)/0.1),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,hsl(var(--accent)/0.1),transparent_50%)]" />
      
      <div className="container mx-auto max-w-7xl relative z-10">
        <div className="text-center mb-20 animate-fade-in">
          <h2 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Почему выбирают <br />
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Windexs-Учитель?
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Мы используем передовые технологии для создания уникального образовательного опыта
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="group relative p-8 bg-card/80 backdrop-blur-sm rounded-3xl border border-border/50 hover:border-primary/50 transition-all duration-300 animate-fade-in-up overflow-hidden"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {/* Hover effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                <div className="relative">
                  <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg shadow-primary/20">
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  
                  <h3 className="text-2xl font-bold mb-4 group-hover:text-primary transition-colors">
                    {feature.title}
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed text-lg">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;
