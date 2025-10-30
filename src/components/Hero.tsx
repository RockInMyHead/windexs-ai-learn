import { Button } from "@/components/ui/button";
import { Brain, Sparkles, ArrowRight } from "lucide-react";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 py-20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/30 to-background" />
      
      {/* Floating elements */}
      <div className="absolute top-20 left-10 w-20 h-20 bg-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-10 w-32 h-32 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "1s" }} />
      
      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="text-center space-y-8 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full border border-primary/20 mb-4">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">AI-персонализация обучения</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold leading-tight">
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Windexs-Учитель
            </span>
            <br />
            <span className="text-foreground">Будущее образования</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Инновационная онлайн школа с искусственным интеллектом, 
            создающим индивидуальный путь обучения для каждого студента
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <Button 
              size="lg" 
              className="group bg-gradient-to-r from-primary to-accent hover:shadow-lg hover:shadow-primary/50 transition-all duration-300 text-white border-0"
            >
              <Brain className="w-5 h-5 mr-2" />
              Начать обучение
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            
            <Button 
              size="lg" 
              variant="outline"
              className="border-primary/30 hover:bg-primary/5 hover:border-primary transition-all duration-300"
            >
              Как это работает
            </Button>
          </div>
          
          <div className="grid grid-cols-3 gap-8 pt-12 max-w-2xl mx-auto">
            {[
              { value: "10K+", label: "Студентов" },
              { value: "50+", label: "Курсов" },
              { value: "98%", label: "Успешности" }
            ].map((stat, i) => (
              <div 
                key={i} 
                className="p-4 bg-card/50 backdrop-blur-sm rounded-2xl border border-border/50 animate-scale-in"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="text-3xl font-bold text-primary">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
