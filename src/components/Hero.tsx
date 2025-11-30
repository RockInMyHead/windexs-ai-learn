import { Button } from "@/components/ui/button";
import { Brain, Sparkles, ArrowRight, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const Hero = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const scrollToChat = () => {
    const chatSection = document.getElementById('home-chat');
    if (chatSection) {
      chatSection.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const handleStartLearning = () => {
    if (isAuthenticated) {
      navigate('/courses');
    } else {
      navigate('/login');
    }
  };
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
              onClick={handleStartLearning}
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
              className="border-2 border-primary/40 hover:bg-primary/10 hover:border-primary hover:text-black transition-all duration-300 px-8 py-6 text-lg group"
              onClick={scrollToChat}
            >
              <Play className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
              Как это работает
            </Button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 pt-12 sm:pt-16 max-w-4xl mx-auto px-4 sm:px-0">
            {[
              { value: "10K+", label: "Студентов", sublabel: "активно учатся" },
              { value: "50+", label: "Курсов", sublabel: "по всем направлениям" },
              { value: "98%", label: "Успешности", sublabel: "достижения целей" }
            ].map((stat, i) => (
              <div
                key={i}
                className="group p-4 sm:p-6 bg-card/70 backdrop-blur-sm rounded-2xl sm:rounded-3xl border border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/20 animate-scale-in text-center"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent mb-2">
                  {stat.value}
                </div>
                <div className="text-sm sm:text-base font-semibold text-foreground">{stat.label}</div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">{stat.sublabel}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
