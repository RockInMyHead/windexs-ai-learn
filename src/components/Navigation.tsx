import { Link, useLocation } from "react-router-dom";
import { BookOpen, GraduationCap, MessageSquare, Trophy, FileText, User, LogOut } from "lucide-react";
import { Button } from "./ui/button";

const Navigation = () => {
  const location = useLocation();

  const navItems = [
    { path: "/library", label: "Библиотека", icon: BookOpen },
    { path: "/courses", label: "Курсы", icon: GraduationCap },
    { path: "/chat", label: "Чат", icon: MessageSquare },
    { path: "/achievements", label: "Достижения", icon: Trophy },
    { path: "/exams", label: "Экзамены", icon: FileText },
    { path: "/account", label: "Аккаунт", icon: User },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center transform group-hover:scale-110 transition-transform">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
              Windexs-Учитель
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link key={item.path} to={item.path}>
                  <Button
                    variant="ghost"
                    className={`gap-2 transition-all ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-accent"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
            <Button
              variant="ghost"
              className="gap-2 text-destructive hover:bg-destructive/10"
            >
              <LogOut className="w-4 h-4" />
              Выход
            </Button>
          </div>

          <div className="md:hidden">
            <Button variant="ghost" size="icon">
              <MessageSquare className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
