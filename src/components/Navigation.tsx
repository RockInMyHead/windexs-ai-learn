import { Link, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, GraduationCap, MessageSquare, Trophy, FileText, User, LogOut, LogIn, Menu, X } from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { useState } from "react";

const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: "/library", label: "Библиотека", icon: BookOpen },
    { path: "/courses", label: "Курсы", icon: GraduationCap },
    { path: "/chat", label: "Чат", icon: MessageSquare },
    { path: "/achievements", label: "Достижения", icon: Trophy },
    { path: "/exams", label: "Экзамены", icon: FileText },
  ];

  const handleLogout = async () => {
    await logout();
    setMobileMenuOpen(false);
    toast({
      title: "До свидания!",
      description: "Вы вышли из аккаунта",
    });
    navigate("/");
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

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

            {isAuthenticated ? (
              <>
                <Link to="/account">
                  <Button
                    variant="ghost"
                    className={`gap-2 transition-all ${
                      location.pathname === "/account"
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-accent"
                    }`}
                  >
                    <Avatar className="w-6 h-6">
                      <AvatarImage src={user?.avatar} />
                      <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                        {user?.name ? getInitials(user.name) : "U"}
                      </AvatarFallback>
                    </Avatar>
                    {user?.name?.split(" ")[0] || "Аккаунт"}
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  className="gap-2 text-destructive hover:bg-destructive/10"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" />
                  Выход
                </Button>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button
                    variant="ghost"
                    className="gap-2 hover:bg-accent"
                  >
                    <LogIn className="w-4 h-4" />
                    Вход
                  </Button>
                </Link>
                <Link to="/register">
                  <Button className="gap-2 bg-gradient-to-r from-primary to-emerald-600 hover:opacity-90">
                    <User className="w-4 h-4" />
                    Регистрация
                  </Button>
                </Link>
              </>
            )}
          </div>

          <div className="md:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Menu className="w-5 h-5" />
                  <span className="sr-only">Открыть меню</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 bg-background/95 backdrop-blur-xl border-border/50">
                <SheetHeader className="text-left border-b border-border/50 pb-4 mb-4">
                  <SheetTitle className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center">
                      <GraduationCap className="w-6 h-6 text-white" />
                    </div>
                    <span className="bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
                      Windexs-Учитель
                    </span>
                  </SheetTitle>
                </SheetHeader>

                <div className="space-y-2">
                  {/* Основная навигация */}
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Button
                        key={item.path}
                        variant="ghost"
                        className={`w-full justify-start gap-3 h-12 ${
                          isActive
                            ? "bg-primary/10 text-primary border-l-2 border-primary"
                            : "hover:bg-accent"
                        }`}
                        onClick={() => handleNavClick(item.path)}
                      >
                        <Icon className="w-5 h-5" />
                        {item.label}
                      </Button>
                    );
                  })}

                  {/* Разделитель */}
                  <div className="border-t border-border/50 my-4" />

                  {/* Аккаунт */}
                  {isAuthenticated ? (
                    <>
                      <Button
                        variant="ghost"
                        className={`w-full justify-start gap-3 h-12 ${
                          location.pathname === "/account"
                            ? "bg-primary/10 text-primary border-l-2 border-primary"
                            : "hover:bg-accent"
                        }`}
                        onClick={() => handleNavClick("/account")}
                      >
                        <Avatar className="w-6 h-6">
                          <AvatarImage src={user?.avatar} />
                          <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                            {user?.name ? getInitials(user.name) : "U"}
                          </AvatarFallback>
                        </Avatar>
                        {user?.name?.split(" ")[0] || "Аккаунт"}
                      </Button>

                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 h-12 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={handleLogout}
                      >
                        <LogOut className="w-5 h-5" />
                        Выход
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 h-12 hover:bg-accent"
                        onClick={() => handleNavClick("/login")}
                      >
                        <LogIn className="w-5 h-5" />
                        Вход
                      </Button>

                      <Button
                        className="w-full justify-start gap-3 h-12 bg-gradient-to-r from-primary to-emerald-600 hover:opacity-90 text-white"
                        onClick={() => handleNavClick("/register")}
                      >
                        <User className="w-5 h-5" />
                        Регистрация
                      </Button>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
