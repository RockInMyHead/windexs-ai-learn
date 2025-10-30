import { CheckCircle2, Users, Brain, Rocket, TrendingUp, Award } from "lucide-react";

const learningSteps = [
  {
    phase: "Фаза 1",
    title: "Знакомство и диагностика",
    duration: "1-2 дня",
    icon: Users,
    color: "from-primary to-accent",
    steps: [
      "Регистрация и создание профиля",
      "Интерактивное тестирование текущего уровня",
      "Определение стиля обучения (визуал, аудиал, кинестетик)",
      "Постановка целей и сроков обучения"
    ]
  },
  {
    phase: "Фаза 2",
    title: "AI анализ и создание плана",
    duration: "1 день",
    icon: Brain,
    color: "from-accent to-primary",
    steps: [
      "Глубокий анализ ваших знаний и навыков",
      "Выявление сильных сторон и пробелов",
      "Создание персонального учебного плана",
      "Подбор оптимальных материалов и методик"
    ]
  },
  {
    phase: "Фаза 3",
    title: "Активное обучение",
    duration: "Индивидуально",
    icon: Rocket,
    color: "from-primary to-accent",
    steps: [
      "Прохождение персонализированных уроков",
      "Практические задания и проекты",
      "Регулярная обратная связь от AI",
      "Адаптация программы в реальном времени"
    ]
  },
  {
    phase: "Фаза 4",
    title: "Контроль и корректировка",
    duration: "Постоянно",
    icon: TrendingUp,
    color: "from-accent to-primary",
    steps: [
      "Еженедельный анализ прогресса",
      "Корректировка сложности материалов",
      "Рекомендации по улучшению результатов",
      "Отслеживание достижения целей"
    ]
  },
  {
    phase: "Фаза 5",
    title: "Достижение и сертификация",
    duration: "Финал",
    icon: Award,
    color: "from-primary to-accent",
    steps: [
      "Финальное тестирование знаний",
      "Защита итогового проекта",
      "Получение сертификата",
      "Рекомендации для дальнейшего развития"
    ]
  }
];

const LearningSteps = () => {
  return (
    <section className="py-24 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "1.5s" }} />
      
      <div className="container mx-auto max-w-7xl relative z-10">
        <div className="text-center mb-20 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full border border-primary/20 mb-6">
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Пошаговая система обучения</span>
          </div>
          
          <h2 className="text-4xl md:text-6xl font-bold mb-6">
            Ваш путь к <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">знаниям</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Структурированный процесс обучения с постоянной адаптацией под ваши потребности
          </p>
        </div>
        
        <div className="relative">
          {/* Connection line */}
          <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-primary via-accent to-primary opacity-20 -translate-x-1/2" />
          
          <div className="space-y-16">
            {learningSteps.map((step, index) => {
              const Icon = step.icon;
              const isEven = index % 2 === 0;
              
              return (
                <div
                  key={index}
                  className={`relative grid lg:grid-cols-2 gap-8 items-center animate-fade-in-up`}
                  style={{ animationDelay: `${index * 0.15}s` }}
                >
                  {/* Content */}
                  <div className={`${isEven ? 'lg:order-1' : 'lg:order-2'} space-y-4`}>
                    <div className={`inline-flex items-center gap-3 px-4 py-2 bg-gradient-to-r ${step.color} rounded-full`}>
                      <span className="text-sm font-bold text-white">{step.phase}</span>
                      <span className="text-xs text-white/80">• {step.duration}</span>
                    </div>
                    
                    <h3 className="text-3xl font-bold text-foreground">
                      {step.title}
                    </h3>
                    
                    <div className="space-y-3">
                      {step.steps.map((item, i) => (
                        <div key={i} className="flex items-start gap-3 group">
                          <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform" />
                          <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                            {item}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Visual element */}
                  <div className={`${isEven ? 'lg:order-2' : 'lg:order-1'} flex justify-center`}>
                    <div className="relative group">
                      <div className={`absolute inset-0 bg-gradient-to-br ${step.color} rounded-3xl blur-2xl opacity-30 group-hover:opacity-50 transition-opacity duration-300`} />
                      
                      <div className="relative w-64 h-64 bg-card/80 backdrop-blur-sm rounded-3xl border border-primary/30 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                        <div className={`w-32 h-32 bg-gradient-to-br ${step.color} rounded-2xl flex items-center justify-center shadow-xl group-hover:rotate-6 transition-transform duration-300`}>
                          <Icon className="w-16 h-16 text-white" />
                        </div>
                        
                        {/* Step number */}
                        <div className={`absolute -top-4 -right-4 w-12 h-12 bg-gradient-to-br ${step.color} rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg`}>
                          {index + 1}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Center dot for timeline */}
                  <div className="hidden lg:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full border-4 border-background shadow-lg" />
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Bottom CTA */}
        <div className="mt-20 text-center animate-fade-in" style={{ animationDelay: "1s" }}>
          <div className="p-8 bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10 rounded-3xl border border-primary/20 max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold mb-3">
              Готовы начать свой путь?
            </h3>
            <p className="text-muted-foreground mb-6">
              AI составит персональный план обучения за 5 минут
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <span className="inline-flex items-center gap-2 text-sm text-primary font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Без кредитной карты
              </span>
              <span className="inline-flex items-center gap-2 text-sm text-primary font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Первый месяц бесплатно
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LearningSteps;
