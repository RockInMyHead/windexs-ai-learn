import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";

const CTA = () => {
  return (
    <section className="py-24 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-float" style={{ animationDelay: "1.5s" }} />
      
      <div className="container mx-auto max-w-4xl relative z-10">
        <div className="bg-card/80 backdrop-blur-xl rounded-3xl border border-primary/30 p-12 md:p-16 text-center shadow-2xl shadow-primary/20 animate-scale-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full border border-primary/20 mb-6">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Первый месяц бесплатно</span>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Готовы начать обучение <br />
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              с персональным AI?
            </span>
          </h2>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Присоединяйтесь к тысячам студентов, которые уже достигают своих целей 
            с помощью персонализированного обучения
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              size="lg"
              className="group bg-gradient-to-r from-primary to-accent hover:shadow-lg hover:shadow-primary/50 transition-all duration-300 text-white border-0"
            >
              Начать бесплатно
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            
            <Button 
              size="lg"
              variant="outline"
              className="border-primary/30 hover:bg-primary/5 hover:border-primary transition-all duration-300"
            >
              Связаться с нами
            </Button>
          </div>
          
          <p className="text-sm text-muted-foreground mt-6">
            Кредитная карта не требуется • Доступ ко всем функциям • Отмена в любое время
          </p>
        </div>
      </div>
    </section>
  );
};

export default CTA;
