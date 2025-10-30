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
    <section className="py-24 px-4 bg-gradient-to-b from-background to-secondary/30 relative">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5" />
      
      <div className="container mx-auto max-w-7xl relative z-10">
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Почему выбирают <span className="text-primary">Windexs-Учитель?</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Мы используем передовые технологии для создания уникального образовательного опыта
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="group p-8 bg-card rounded-3xl border border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 animate-fade-in-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-14 h-14 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Icon className="w-7 h-7 text-white" />
                </div>
                
                <h3 className="text-xl font-semibold mb-3 group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;
