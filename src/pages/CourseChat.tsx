import Navigation from "@/components/Navigation";
import { Send, Paperclip, X, Image, File, Mic, Square, Volume2, VolumeX, Loader2, MessageSquare, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useParams } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import { getCourseDisplayName } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MathRenderer from "@/components/MathRenderer";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  isStreaming?: boolean;
}

const CourseChat = () => {
  const { courseId } = useParams();
  const { token } = useAuth();
  const { toast } = useToast();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load chat history on mount
  useEffect(() => {
    if (courseId && token) {
      loadChatHistory();
    }
  }, [courseId, token]);

  const loadChatHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`https://teacher.windexs.ru/api/chat/${courseId}/history`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages.map((m: any) => ({
          id: m.id,
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
          created_at: m.created_at
        })));
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if ((!inputMessage.trim() && selectedFiles.length === 0) || isSending) return;

    const messageContent = inputMessage.trim();
    setInputMessage("");
    setSelectedFiles([]);
    setIsSending(true);

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: messageContent,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    // Add placeholder for AI response
    const aiPlaceholder: ChatMessage = {
      id: `ai-${Date.now()}`,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
      isStreaming: true
    };
    setMessages(prev => [...prev, aiPlaceholder]);

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch(`https://teacher.windexs.ru/api/chat/${courseId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          content: messageContent,
          messageType: 'text'
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      // Check if streaming response
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('text/event-stream')) {
        // Handle streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  if (data.content) {
                    fullContent += data.content;
                    setMessages(prev => prev.map(m => 
                      m.isStreaming 
                        ? { ...m, content: fullContent }
                        : m
                    ));
                  }
                  
                  if (data.done) {
                    setMessages(prev => prev.map(m => 
                      m.isStreaming 
                        ? { ...m, id: data.messageId, isStreaming: false }
                        : m
                    ));
                  }

                  if (data.error) {
                    throw new Error(data.error);
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        }
      } else {
        // Handle non-streaming response (fallback)
        const data = await response.json();
        setMessages(prev => prev.map(m => 
          m.isStreaming 
            ? { ...m, id: data.messageId, content: data.message, isStreaming: false }
            : m
        ));
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('Send message error:', error);
        toast({
          title: "Ошибка",
          description: "Не удалось отправить сообщение",
          variant: "destructive"
        });
        // Remove the placeholder message on error
        setMessages(prev => prev.filter(m => !m.isStreaming));
      }
    } finally {
      setIsSending(false);
      abortControllerRef.current = null;
    }
  };


  const handleVoiceMessage = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const hasContent = inputMessage.trim() || selectedFiles.length > 0;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter(file => {
      const maxSize = 10 * 1024 * 1024;
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      return file.size <= maxSize && allowedTypes.includes(file.type);
    });

    if (validFiles.length !== files.length) {
      alert("Некоторые файлы не поддерживаются или слишком большие (макс 10MB)");
    }

    setSelectedFiles(prev => [...prev, ...validFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const isImageFile = (file: File) => {
    return file.type.startsWith('image/');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioFile = new File([audioBlob], `voice-message-${Date.now()}.wav`, { type: 'audio/wav' });
        setSelectedFiles(prev => [...prev, audioFile]);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Не удалось получить доступ к микрофону. Проверьте разрешения.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const speakMessage = async (messageId: string, text: string) => {
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

      const response = await fetch('https://teacher.windexs.ru/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: text,
          voice: 'shimmer'
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

  // Custom components for ReactMarkdown
  const MarkdownComponents = {
    h1: ({ children }: any) => <h1 className="text-xl font-bold mb-3 text-primary border-b border-primary/20 pb-1">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-lg font-bold mb-2 text-primary">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-base font-semibold mb-2 text-primary">{children}</h3>,
    h4: ({ children }: any) => <h4 className="text-sm font-semibold mb-1 text-primary">{children}</h4>,
    p: ({ children }: any) => <MathRenderer className="mb-2 leading-relaxed last:mb-0">{children}</MathRenderer>,
    strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }: any) => <em className="italic text-muted-foreground">{children}</em>,
    ul: ({ children }: any) => <ul className="ml-4 mb-3 space-y-1 list-disc list-inside marker:text-primary">{children}</ul>,
    ol: ({ children }: any) => <ol className="ml-4 mb-3 space-y-1 list-decimal list-inside marker:text-primary marker:font-semibold">{children}</ol>,
    li: ({ children }: any) => <li className="text-sm leading-relaxed pl-2">{children}</li>,
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-primary/50 pl-4 my-3 italic text-muted-foreground bg-primary/5 py-3 px-4 rounded-r-md shadow-sm">
        {children}
      </blockquote>
    ),
    code: ({ inline, children }: any) =>
      inline ? (
        <code className="bg-muted/80 px-2 py-1 rounded-md text-sm font-mono border border-muted-foreground/20">
          {children}
        </code>
      ) : (
        <pre className="bg-muted/80 p-4 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap border border-muted-foreground/20 my-3">
          <code>{children}</code>
        </pre>
      ),
    pre: ({ children }: any) => <div className="my-3">{children}</div>,
    hr: () => <hr className="border-muted-foreground/30 my-6" />,
    a: ({ href, children }: any) => (
      <a
        href={href}
        className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
  };

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Cleanup audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
    };
  }, [isRecording, currentAudio]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto h-[calc(100vh-12rem)] flex flex-col">
          <div className="text-center mb-6 animate-fade-in">
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
              {getCourseDisplayName(courseId || "")}
            </h1>
          </div>

          <Card className="flex-1 flex flex-col overflow-hidden shadow-xl">
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="w-12 h-12 text-primary/50 mb-4" />
                  <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                    Начните диалог с AI-преподавателем
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Задайте вопрос по теме урока, попросите объяснить материал или помочь с домашним заданием
                  </p>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  } animate-fade-in`}
                    style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div
                    className={`max-w-[85%] md:max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                      {message.role === "assistant" && (
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-primary" />
                          <span className="text-xs font-semibold text-primary">
                            AI Преподаватель
                          </span>
                          {message.isStreaming && (
                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                          )}
                        </div>
                        {!message.isStreaming && message.content && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => speakMessage(message.id, message.content)}
                            className="h-6 w-6 p-0 hover:bg-primary/10"
                            title={speakingMessageId === message.id ? "Остановить озвучку" : "Озвучить сообщение"}
                          >
                            {speakingMessageId === message.id ? (
                              <VolumeX className="w-3 h-3 text-primary" />
                            ) : (
                              <Volume2 className="w-3 h-3 text-primary" />
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                      <div className="text-sm leading-relaxed markdown-content">
                        <ReactMarkdown
                          components={MarkdownComponents}
                          remarkPlugins={[remarkGfm]}
                        >
                          {message.content || (message.isStreaming ? '...' : '')}
                        </ReactMarkdown>
                      </div>
                      {!message.isStreaming && (
                    <span className="text-xs opacity-70 mt-1 block">
                          {formatMessageTime(message.created_at)}
                    </span>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t p-4 bg-background">
              {/* Recording indicator */}
              {isRecording && (
                <div className="mb-3 flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <Volume2 className="w-4 h-4 text-red-500" />
                  </div>
                  <span className="text-red-700 font-medium">Запись голоса: {formatTime(recordingTime)}</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={stopRecording}
                    className="ml-auto"
                  >
                    <Square className="w-3 h-3 mr-1" />
                    Стоп
                  </Button>
                </div>
              )}

              {/* Selected files preview */}
              {selectedFiles.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm"
                    >
                      {file.type.startsWith('audio/') ? (
                        <Volume2 className="w-4 h-4 text-green-500" />
                      ) : isImageFile(file) ? (
                        <Image className="w-4 h-4 text-primary" />
                      ) : (
                        <File className="w-4 h-4 text-primary" />
                      )}
                      <span className="max-w-32 truncate">{file.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => removeFile(index)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  placeholder={isRecording ? "Идет запись голоса..." : "Напишите ваш вопрос..."}
                  className="flex-1"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  disabled={isRecording || isSending}
                />

                {/* File upload button */}
                <Button
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isRecording || isSending}
                >
                  <Paperclip className="w-4 h-4" />
                </Button>

                <Button
                  size="icon"
                  className={`shrink-0 transition-colors ${
                    hasContent
                      ? 'bg-primary hover:bg-primary/90'
                      : isRecording
                      ? 'bg-red-500 hover:bg-red-700 text-white animate-pulse'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                  onClick={hasContent ? handleSend : handleVoiceMessage}
                  disabled={isSending}
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : hasContent ? (
                  <Send className="w-4 h-4" />
                  ) : isRecording ? (
                    <Square className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default CourseChat;
