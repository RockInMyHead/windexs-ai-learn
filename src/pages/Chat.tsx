import Navigation from "@/components/Navigation";
import { Send, Sparkles, Loader2, Paperclip, Image, Camera, Volume2, VolumeX, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MathRenderer from "@/components/MathRenderer";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || 'https://teacher.windexs.ru/api';

interface Message {
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  file?: File;
}

const Chat = () => {
  const { token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      content: 'Привет! 👋 Я Юлия, твой универсальный AI-учитель. Я могу помочь тебе с любыми предметами: математика, программирование, языки, науки и многое другое. Что тебя интересует сегодня?',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<number | null>(null);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Cleanup camera stream, audio recording and audio playback on unmount
  useEffect(() => {
    return () => {
      // Stop camera stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      // Stop audio recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }

      // Stop audio playback
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
    };
  }, [stream, currentAudio]);

  const sendMessage = async (messageText: string) => {
    if ((!messageText.trim() && !selectedFile) || isLoading) return;

    let messageContent = messageText.trim();
    if (selectedFile) {
      messageContent += `\n\n[Прикреплен файл: ${selectedFile.name}]`;
    }

    const userMessage: Message = {
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
      file: selectedFile
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      let response;

      if (selectedFile) {
        // Отправка с файлом через FormData
        const formData = new FormData();
        formData.append('content', messageText.trim() || '[Изображение]');
        formData.append('messageType', 'image');
        formData.append('image', selectedFile);
        formData.append('token', token);

        console.log('🖼️ Sending message with image to server...');

        response = await fetch(`${API_URL}/chat/general`, {
          method: 'POST',
          body: formData
        });
      } else {
        // Отправка текстового сообщения
        response = await fetch(`${API_URL}/chat/general`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            content: messageText.trim(),
            messageType: 'text'
          })
        });
      }

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      const aiMessage: Message = {
        role: 'ai',
        content: data.message,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);

      // Очищаем выбранный файл после успешной отправки
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        role: 'ai',
        content: 'Извини, у меня технические неполадки. Попробуй еще раз через минуту.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendVoiceMessage = async (audioFile: File) => {
    try {
      setIsLoading(true);

      // Создаем FormData для отправки файла
      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('messageType', 'voice');
      formData.append('token', token); // Отправляем токен как поле формы

      console.log('🎤 Sending voice message to server...');

      const response = await fetch(`${API_URL}/chat/general`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Добавляем сообщение пользователя (голосовое)
      const userMessage: Message = {
        role: 'user',
        content: data.transcribedText || '🎤 Голосовое сообщение',
        timestamp: new Date(),
        file: audioFile
      };

      // Добавляем ответ AI
      const aiMessage: Message = {
        role: 'ai',
        content: data.message,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, userMessage, aiMessage]);

      // Очищаем поле ввода
      setInputValue('');
      setSelectedFile(null);

    } catch (error) {
      console.error('❌ Voice message error:', error);
      const errorMessage: Message = {
        role: 'ai',
        content: 'Извини, не удалось обработать голосовое сообщение. Попробуй еще раз.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      sendMessage(inputValue);
    } else {
      handleButtonClick();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim()) {
        sendMessage(inputValue);
      }
    } else if (e.key === 'Escape' && isRecording) {
      // Останавливаем запись по Escape
      stopRecording();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Можно добавить логику для предварительного просмотра или отправки файла
      console.log('Selected file:', file.name, file.type, file.size);
    }
  };

  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Ваш браузер не поддерживает запись аудио. Попробуйте Chrome, Firefox или Safari.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `voice-message-${Date.now()}.webm`, { type: 'audio/webm' });

        // Останавливаем все треки стрима
        stream.getTracks().forEach(track => track.stop());

        // Отправляем аудио сообщение
        sendVoiceMessage(audioFile);
      };

      mediaRecorder.start();
      setIsRecording(true);
      console.log('🎤 Recording started...');

    } catch (error) {
      console.error('❌ Error accessing microphone:', error);
      alert('Не удалось получить доступ к микрофону. Проверьте разрешения.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      console.log('🎤 Recording stopped');
    }
    setIsRecording(false);
  };

  const handleButtonClick = () => {
    if (inputValue.trim()) {
      // Если есть текст - отправляем сообщение
      sendMessage(inputValue);
    } else {
      // Если поле пустое - начинаем/останавливаем запись
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  };

  const openCamera = async () => {
    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Ваш браузер не поддерживает камеру. Попробуйте Chrome, Firefox или Safari.');
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' } // Использовать заднюю камеру на мобильных
      });
      setStream(mediaStream);
      setIsCameraOpen(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Не удалось получить доступ к камере. Проверьте разрешения.');
    }
  };

  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Устанавливаем размер canvas равным видео
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Рисуем кадр с видео на canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Конвертируем canvas в blob
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setSelectedFile(file);
        closeCamera();
      }
    }, 'image/jpeg', 0.8);
  };

  const speakMessage = async (messageId: number, text: string) => {
    // If already speaking this message, stop it
    if (speakingMessageId === messageId) {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        setCurrentAudio(null);
      }
      setSpeakingMessageId(null);
      return;
    }

    // Stop any currently playing audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    try {
      setSpeakingMessageId(messageId);

      // First, prepare text for TTS (convert formulas, numbers, symbols)
      console.log('📝 Подготовка текста для TTS...');
      const prepareResponse = await fetch(`${API_URL}/tts/prepare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text })
      });

      let textToSpeak = text;
      if (prepareResponse.ok) {
        const prepareData = await prepareResponse.json();
        textToSpeak = prepareData.preparedText || text;
        console.log('✅ Текст подготовлен для TTS');
      } else {
        console.warn('⚠️ Не удалось подготовить текст, используем оригинал');
      }

      // Then generate speech
      const response = await fetch(`${API_URL}/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: textToSpeak,
          voice: 'nova' // High-quality voice for chat
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate speech');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        setSpeakingMessageId(null);
        setCurrentAudio(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setSpeakingMessageId(null);
        setCurrentAudio(null);
        URL.revokeObjectURL(audioUrl);
      };

      setCurrentAudio(audio);
      audio.play();

    } catch (error) {
      console.error('TTS error:', error);
      setSpeakingMessageId(null);
      setCurrentAudio(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />


      <main className="container mx-auto px-4 pt-24 pb-4">
        <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <div ref={scrollAreaRef} className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
                    } animate-fade-in`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                      }`}
                  >
                    {message.role === "ai" && (
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-primary" />
                          <span className="text-xs font-medium text-primary">Юлия</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => speakMessage(index, message.content)}
                          className="h-6 w-6 p-0 hover:bg-primary/10"
                          title={speakingMessageId === index ? "Остановить озвучку" : "Озвучить сообщение"}
                        >
                          {speakingMessageId === index ? (
                            <VolumeX className="w-3 h-3 text-primary" />
                          ) : (
                            <Volume2 className="w-3 h-3 text-primary" />
                          )}
                        </Button>
                      </div>
                    )}
                    {/* Отображение прикрепленного файла */}
                    {message.file && message.role === 'user' && (
                      <div className="mb-3 p-2 bg-primary-foreground/10 rounded-lg">
                        {message.file.type.startsWith('image/') ? (
                          <div className="space-y-2">
                            <img
                              src={URL.createObjectURL(message.file)}
                              alt={message.file.name}
                              className="max-w-full max-h-64 rounded-lg object-contain"
                            />
                            <div className="text-xs text-primary-foreground/70">
                              📎 {message.file.name} ({(message.file.size / 1024).toFixed(1)} KB)
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm">
                            <Paperclip className="w-4 h-4 text-primary" />
                            <span className="text-primary-foreground/70">
                              📎 {message.file.name} ({(message.file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    <MathRenderer className="whitespace-pre-wrap">{message.content}</MathRenderer>
                    {/* Отображение прикрепленного файла */}
                    {message.file && message.role === 'user' && (
                      <div className="mb-3 p-2 bg-primary-foreground/10 rounded-lg">
                        {message.file.type.startsWith('image/') ? (
                          <div className="space-y-2">
                            <img
                              src={URL.createObjectURL(message.file)}
                              alt={message.file.name}
                              className="max-w-full max-h-64 rounded-lg object-contain"
                            />
                            <div className="text-xs text-primary-foreground/70">
                              📎 {message.file.name} ({(message.file.size / 1024).toFixed(1)} KB)
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm">
                            <Paperclip className="w-4 h-4 text-primary" />
                            <span className="text-primary-foreground/70">
                              📎 {message.file.name} ({(message.file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className={`text-xs mt-2 ${message.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                      }`}>
                      {message.timestamp.toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start animate-fade-in">
                  <div className="bg-muted rounded-2xl px-4 py-3 max-w-[80%]">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-xs font-medium text-primary">Юлия</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm">Думаю...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t">
              {/* Selected file preview */}
              {selectedFile && (
                <div className="mb-3 p-3 bg-muted rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedFile.type.startsWith('image/') ? (
                      <Image className="w-4 h-4 text-primary" />
                    ) : (
                      <Paperclip className="w-4 h-4 text-primary" />
                    )}
                    <span className="text-sm font-medium">{selectedFile.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelectedFile}
                    className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                  >
                    ×
                  </Button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex gap-3">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* File upload button */}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleFileButtonClick}
                  disabled={isLoading}
                  className="shrink-0"
                  title="Прикрепить файл"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>

                {/* Camera button */}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={openCamera}
                  disabled={isLoading}
                  className="shrink-0"
                  title="Сфотографировать"
                >
                  <Camera className="w-4 h-4" />
                </Button>

                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Напиши свой вопрос..."
                  className="flex-1"
                  disabled={isLoading || isRecording}
                />

                <Button
                  type="button"
                  onClick={handleButtonClick}
                  disabled={isLoading}
                  className={`px-6 ${isRecording ? 'bg-red-500 hover:bg-red-600' : ''}`}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : inputValue.trim() ? (
                    <Send className="w-4 h-4" />
                  ) : isRecording ? (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      <Mic className="w-4 h-4" />
                    </div>
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </Button>
              </form>
            </div>
          </Card>
        </div>
      </main>

      {/* Camera Modal */}
      <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Сфотографировать</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-64 object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="flex justify-center gap-3">
              <Button onClick={takePhoto} className="flex-1">
                <Camera className="w-4 h-4 mr-2" />
                Сфотографировать
              </Button>
              <Button variant="outline" onClick={closeCamera}>
                Отмена
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Chat;
