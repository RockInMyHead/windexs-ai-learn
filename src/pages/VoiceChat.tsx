import Navigation from "@/components/Navigation";
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useParams } from "react-router-dom";
import { useState } from "react";

const VoiceChat = () => {
  const { courseId } = useParams();
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  const handleConnect = () => {
    setIsConnected(!isConnected);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
              Голосовое общение
            </h1>
            <p className="text-muted-foreground">
              Урок: {courseId}
            </p>
          </div>

          <Card className="shadow-2xl animate-fade-in">
            <CardContent className="p-8 md:p-12">
              <div className="text-center space-y-8">
                {/* Status Indicator */}
                <div className="relative inline-block">
                  <div className={`w-32 h-32 md:w-40 md:h-40 rounded-full ${isConnected ? 'bg-emerald-500/20' : 'bg-muted'} flex items-center justify-center transition-all duration-300`}>
                    <Mic className={`w-16 h-16 md:w-20 md:h-20 ${isConnected ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                  </div>
                  {isConnected && (
                    <div className="absolute inset-0 rounded-full animate-ping bg-emerald-500/20"></div>
                  )}
                </div>

                {/* Status Text */}
                <div>
                  <h2 className="text-2xl font-bold mb-2">
                    {isConnected ? "Вы на связи с AI-преподавателем" : "Нажмите для начала урока"}
                  </h2>
                  <p className="text-muted-foreground">
                    {isConnected 
                      ? "Говорите свободно, AI-преподаватель вас слушает" 
                      : "Голосовое общение в реальном времени"}
                  </p>
                </div>

                {/* Control Buttons */}
                <div className="flex flex-wrap justify-center gap-4">
                  {isConnected && (
                    <>
                      <Button
                        variant={isMuted ? "destructive" : "outline"}
                        size="lg"
                        className="w-16 h-16 rounded-full"
                        onClick={() => setIsMuted(!isMuted)}
                      >
                        {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                      </Button>
                      <Button
                        variant={!isSpeakerOn ? "secondary" : "outline"}
                        size="lg"
                        className="w-16 h-16 rounded-full"
                        onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                      >
                        {isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                      </Button>
                    </>
                  )}
                </div>

                {/* Main Action Button */}
                <Button
                  size="lg"
                  className={`w-full max-w-xs h-14 text-lg ${isConnected ? 'bg-red-500 hover:bg-red-600' : ''}`}
                  onClick={handleConnect}
                >
                  {isConnected ? (
                    <>
                      <PhoneOff className="w-5 h-5 mr-2" />
                      Завершить урок
                    </>
                  ) : (
                    <>
                      <Phone className="w-5 h-5 mr-2" />
                      Начать урок
                    </>
                  )}
                </Button>

                {/* Tips */}
                {!isConnected && (
                  <div className="mt-8 p-4 bg-muted rounded-lg text-left space-y-2">
                    <p className="font-semibold text-sm">Советы для эффективного обучения:</p>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Говорите четко и не спеша</li>
                      <li>Задавайте конкретные вопросы</li>
                      <li>Используйте наушники для лучшего качества звука</li>
                      <li>Найдите тихое место для занятия</li>
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default VoiceChat;
