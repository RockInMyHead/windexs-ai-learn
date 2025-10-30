import { Button } from "@/components/ui/button";
import { Brain, Sparkles, ArrowRight, Play } from "lucide-react";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 py-20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/30 to-background" />
      
      {/* Animated grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20" />
      
      {/* Floating elements */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-10 w-40 h-40 bg-accent/20 rounded-full blur-3xl animate-float" style={{ animationDelay: "1s" }} />
      <div className="absolute top-1/2 left-1/3 w-24 h-24 bg-primary/10 rounded-full blur-2xl animate-float" style={{ animationDelay: "2s" }} />
      
      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="text-center space-y-8 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full border border-primary/20 mb-4">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">AI-персонализация обучения</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold leading-tight tracking-tight">
            <span className="inline-block bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-glow-pulse">
              Windexs-Учитель
            </span>
            <br />
            <span className="text-foreground mt-2 block">Будущее образования</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Инновационная онлайн школа с искусственным интеллектом, 
            создающим <span className="text-primary font-semibold">индивидуальный путь обучения</span> для каждого студента
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
            <Button 
              size="lg" 
              className="group relative overflow-hidden bg-gradient-to-r from-primary to-accent hover:shadow-2xl hover:shadow-primary/50 transition-all duration-300 text-white border-0 px-8 py-6 text-lg"
            >
              <span className="relative z-10 flex items-center">
                <Brain className="w-5 h-5 mr-2" />
                Начать обучение
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-accent to-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Button>
            
            <Button 
              size="lg" 
              variant="outline"
              className="border-2 border-primary/40 hover:bg-primary/10 hover:border-primary transition-all duration-300 px-8 py-6 text-lg group"
            >
              <Play className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
              Как это работает
            </Button>
          </div>
          
          <div className="grid grid-cols-3 gap-6 pt-16 max-w-3xl mx-auto">
            {[
              { value: "10K+", label: "Студентов", sublabel: "активно учатся" },
              { value: "50+", label: "Курсов", sublabel: "по всем направлениям" },
              { value: "98%", label: "Успешности", sublabel: "достижения целей" }
            ].map((stat, i) => (
              <div 
                key={i} 
                className="group p-6 bg-card/70 backdrop-blur-sm rounded-3xl border border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/20 animate-scale-in"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="text-4xl md:text-5xl font-bold bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent mb-2">
                  {stat.value}
                </div>
                <div className="text-sm font-semibold text-foreground">{stat.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.sublabel}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
