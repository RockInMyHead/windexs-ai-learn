import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";

const CTA = () => {
  return (
    <section className="py-32 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/10 to-primary/10" />
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/30 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent/30 rounded-full blur-3xl animate-float" style={{ animationDelay: "1.5s" }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.1),transparent_70%)]" />
      
      <div className="container mx-auto max-w-4xl relative z-10">
        <div className="relative bg-card/90 backdrop-blur-xl rounded-3xl border-2 border-primary/30 p-12 md:p-20 text-center shadow-2xl shadow-primary/30 animate-scale-in overflow-hidden">
          {/* Background pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--primary)/0.1)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--primary)/0.1)_1px,transparent_1px)] bg-[size:2rem_2rem] opacity-30" />
          
          <div className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              Готовы начать обучение?
            </h2>
            
            <p className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              Присоединяйтесь к <span className="text-primary font-semibold">10 000+ студентам</span>, которые уже достигают своих целей 
              с помощью персонализированного обучения
            </p>
          
            <div className="flex justify-center mb-8">
              <Button 
                size="lg"
                className="group relative overflow-hidden bg-gradient-to-r from-primary to-accent hover:shadow-2xl hover:shadow-primary/60 transition-all duration-300 text-white border-0 px-12 py-7 text-lg font-semibold"
              >
                <span className="relative z-10 flex items-center">
                  Начать обучение
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-accent to-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Button>
            </div>
            
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
