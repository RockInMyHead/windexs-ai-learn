import { User, ScanLine, Lightbulb, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: User,
    title: "1. Знакомство",
    description: "AI анализирует ваш уровень знаний и цели обучения через интерактивное тестирование"
  },
  {
    icon: ScanLine,
    title: "2. Анализ",
    description: "Система оценивает ваши сильные стороны, пробелы в знаниях и предпочтения в обучении"
  },
  {
    icon: Lightbulb,
    title: "3. Персонализация",
    description: "AI создает уникальную программу с оптимальными материалами и темпом обучения"
  },
  {
    icon: TrendingUp,
    title: "4. Адаптация",
    description: "Программа постоянно адаптируется на основе вашего прогресса и обратной связи"
  }
];

const AIProcess = () => {
  return (
    <section className="py-24 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
      
      <div className="container mx-auto max-w-7xl relative z-10">
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Как работает <span className="text-primary">AI-персонализация</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Четыре шага к вашему идеальному образовательному пути
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={index}
                className="relative group animate-fade-in-up"
                style={{ animationDelay: `${index * 0.15}s` }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100" />
                
                <div className="relative p-8 bg-card rounded-3xl border border-border/50 group-hover:border-primary/50 transition-all duration-300 h-full">
                  <div className="flex items-start gap-6">
                    <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="text-2xl font-semibold mb-3 group-hover:text-primary transition-colors">
                        {step.title}
                      </h3>
                      <p className="text-muted-foreground leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                  
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 -right-6 w-12 h-0.5 bg-gradient-to-r from-primary to-transparent" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default AIProcess;
