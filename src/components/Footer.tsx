import { Brain, Mail, Phone, MapPin } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-gradient-to-b from-background to-secondary/30 border-t border-border/50 py-12 px-4">
      <div className="container mx-auto max-w-7xl">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold">Windexs-Учитель</span>
            </div>
            <p className="text-muted-foreground">
              Персонализированное обучение с искусственным интеллектом
            </p>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4">Курсы</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li className="hover:text-primary cursor-pointer transition-colors">Программирование</li>
              <li className="hover:text-primary cursor-pointer transition-colors">Языки</li>
              <li className="hover:text-primary cursor-pointer transition-colors">Математика</li>
              <li className="hover:text-primary cursor-pointer transition-colors">Дизайн</li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4">Компания</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li className="hover:text-primary cursor-pointer transition-colors">О нас</li>
              <li className="hover:text-primary cursor-pointer transition-colors">Блог</li>
              <li className="hover:text-primary cursor-pointer transition-colors">Карьера</li>
              <li className="hover:text-primary cursor-pointer transition-colors">Партнеры</li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4">Контакты</h3>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                info@windexs.com
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-primary" />
                +7 (999) 123-45-67
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Москва, Россия
              </li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted-foreground text-sm">
            © 2024 Windexs-Учитель. Все права защищены.
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">Политика конфиденциальности</a>
            <a href="#" className="hover:text-primary transition-colors">Условия использования</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
