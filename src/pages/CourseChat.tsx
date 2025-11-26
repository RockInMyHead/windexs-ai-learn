import Navigation from "@/components/Navigation";
import { MessageSquare, Send, Sparkles, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useParams } from "react-router-dom";
import { useState } from "react";

const CourseChat = () => {
  const { courseId } = useParams();
  const [inputMessage, setInputMessage] = useState("");

  const messages = [
    {
      role: "ai",
      content: "Здравствуйте! Я ваш AI-преподаватель. Готов помочь вам с изучением предмета. Какую тему вы хотели бы разобрать сегодня?",
      time: "10:30",
    },
    {
      role: "user",
      content: "Расскажи про квадратные уравнения",
      time: "10:31",
    },
    {
      role: "ai",
      content: "Отлично! Квадратное уравнение - это уравнение вида ax² + bx + c = 0, где a ≠ 0. Для решения квадратных уравнений используется формула дискриминанта: D = b² - 4ac. Давайте разберем на примере?",
      time: "10:31",
    },
  ];

  const handleSend = () => {
    if (inputMessage.trim()) {
      // Handle message sending
      setInputMessage("");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto h-[calc(100vh-12rem)] flex flex-col">
          <div className="text-center mb-6 animate-fade-in">
            <div className="flex items-center justify-center gap-2 mb-2">
              <BookOpen className="w-8 h-8 text-primary" />
              <MessageSquare className="w-8 h-8 text-primary" />
              <Sparkles className="w-6 h-6 text-yellow-500" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
              Урок: {courseId}
            </h1>
            <p className="text-muted-foreground">
              AI-преподаватель готов ответить на ваши вопросы
            </p>
          </div>

          <Card className="flex-1 flex flex-col overflow-hidden shadow-xl">
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  } animate-fade-in`}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div
                    className={`max-w-[85%] md:max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {message.role === "ai" && (
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span className="text-xs font-semibold text-primary">
                          AI Преподаватель
                        </span>
                      </div>
                    )}
                    <p className="text-sm leading-relaxed">{message.content}</p>
                    <span className="text-xs opacity-70 mt-1 block">
                      {message.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t p-4 bg-background">
              <div className="flex gap-2">
                <Input
                  placeholder="Напишите ваш вопрос..."
                  className="flex-1"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                />
                <Button size="icon" className="shrink-0" onClick={handleSend}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default CourseChat;
