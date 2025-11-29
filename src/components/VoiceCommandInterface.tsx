/**
 * Voice Command Interface
 * Professional UI for voice command system with wake words and command execution
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Mic,
  MicOff,
  Volume2,
  Settings,
  Play,
  Pause,
  Command,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  List,
  Plus
} from 'lucide-react';
import { VoiceCommandProcessor, VoiceCommand, VoiceCommandResult } from '@/utils/voiceCommands/VoiceCommandProcessor';

interface VoiceCommandInterfaceProps {
  isVisible: boolean;
  onClose: () => void;
  className?: string;
}

interface CommandHistoryItem {
  id: string;
  command: string;
  result: VoiceCommandResult;
  timestamp: Date;
}

export const VoiceCommandInterface: React.FC<VoiceCommandInterfaceProps> = ({
  isVisible,
  onClose,
  className = ''
}) => {
  const [processor] = useState(() => new VoiceCommandProcessor());
  const [isListening, setIsListening] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [commands, setCommands] = useState<VoiceCommand[]>([]);
  const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>([]);
  const [lastWakeWord, setLastWakeWord] = useState<string | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const wakeWordTimeoutRef = useRef<NodeJS.Timeout>();
  const transcriptTimeoutRef = useRef<NodeJS.Timeout>();

  // Initialize processor
  useEffect(() => {
    if (isVisible && !isInitialized) {
      processor.initialize()
        .then(() => {
          setIsInitialized(true);
          setCommands(processor.getCommands());
          console.log('Voice command interface initialized');
        })
        .catch(error => {
          console.error('Failed to initialize voice command processor:', error);
        });
    }

    return () => {
      if (!isVisible) {
        processor.destroy();
        setIsInitialized(false);
      }
    };
  }, [isVisible, isInitialized, processor]);

  // Setup event handlers
  useEffect(() => {
    if (!isInitialized) return;

    processor.onListeningStateChanged = (listening) => {
      setIsListening(listening);
    };

    processor.onWakeWordDetected = (wakeWord) => {
      setLastWakeWord(wakeWord);

      // Clear wake word indicator after 3 seconds
      if (wakeWordTimeoutRef.current) {
        clearTimeout(wakeWordTimeoutRef.current);
      }
      wakeWordTimeoutRef.current = setTimeout(() => {
        setLastWakeWord(null);
      }, 3000);
    };

    processor.onCommandDetected = (result) => {
      const historyItem: CommandHistoryItem = {
        id: Date.now().toString(),
        command: result.params.rawTranscript,
        result,
        timestamp: new Date()
      };

      setCommandHistory(prev => [historyItem, ...prev.slice(0, 49)]); // Keep last 50
      setCurrentTranscript('');
      setConfidence(0);
    };

    return () => {
      processor.onListeningStateChanged = undefined;
      processor.onWakeWordDetected = undefined;
      processor.onCommandDetected = undefined;
    };
  }, [isInitialized, processor]);

  // Handle start/stop listening
  const handleToggleListening = async () => {
    try {
      if (isListening) {
        processor.stopListening();
      } else {
        await processor.startListening();
      }
    } catch (error) {
      console.error('Failed to toggle listening:', error);
    }
  };

  // Test command execution
  const handleTestCommand = async (commandId: string) => {
    try {
      const result = await processor.executeCommand(commandId);
      const historyItem: CommandHistoryItem = {
        id: Date.now().toString(),
        command: `Test: ${commandId}`,
        result,
        timestamp: new Date()
      };
      setCommandHistory(prev => [historyItem, ...prev.slice(0, 49)]);
    } catch (error) {
      console.error('Failed to test command:', error);
    }
  };

  // Clear transcript after delay
  useEffect(() => {
    if (currentTranscript) {
      if (transcriptTimeoutRef.current) {
        clearTimeout(transcriptTimeoutRef.current);
      }
      transcriptTimeoutRef.current = setTimeout(() => {
        setCurrentTranscript('');
        setConfidence(0);
      }, 3000);
    }
  }, [currentTranscript]);

  if (!isVisible) return null;

  const getCommandStatusIcon = (result: VoiceCommandResult) => {
    if (!result.executed) return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    if (result.success) return <CheckCircle className="w-4 h-4 text-green-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  const getCommandStatusText = (result: VoiceCommandResult) => {
    if (!result.executed) return 'Не выполнена';
    if (result.success) return 'Выполнена';
    return 'Ошибка';
  };

  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.8) return 'text-green-600';
    if (conf >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const commandsByCategory = commands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, VoiceCommand[]>);

  return (
    <div className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 ${className}`}>
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-full ${isListening ? 'bg-green-100' : 'bg-gray-100'}`}>
              {isListening ? (
                <Mic className="w-6 h-6 text-green-600 animate-pulse" />
              ) : (
                <MicOff className="w-6 h-6 text-gray-600" />
              )}
            </div>
            <div>
              <CardTitle>Голосовые команды</CardTitle>
              <p className="text-sm text-gray-600">
                {isListening ? 'Прослушиваю команды...' : 'Готов к прослушиванию'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {lastWakeWord && (
              <Badge variant="secondary" className="animate-bounce">
                <Zap className="w-3 h-3 mr-1" />
                "{lastWakeWord}"
              </Badge>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="w-4 h-4" />
            </Button>

            <Button variant="outline" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Tabs defaultValue="control" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="control">Управление</TabsTrigger>
              <TabsTrigger value="commands">Команды</TabsTrigger>
              <TabsTrigger value="history">История</TabsTrigger>
            </TabsList>

            {/* Control Tab */}
            <TabsContent value="control" className="p-6 space-y-6">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <Button
                    size="lg"
                    onClick={handleToggleListening}
                    disabled={!isInitialized}
                    className={`w-32 h-32 rounded-full ${
                      isListening
                        ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                        : 'bg-blue-500 hover:bg-blue-600'
                    }`}
                  >
                    {isListening ? (
                      <div className="flex flex-col items-center">
                        <Pause className="w-8 h-8 mb-2" />
                        <span className="text-sm">Стоп</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <Play className="w-8 h-8 mb-2" />
                        <span className="text-sm">Старт</span>
                      </div>
                    )}
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Скажите одно из слов активации: "Эй", "Слушай", "Помоги", "Ассистент"
                  </p>
                  <p className="text-xs text-gray-500">
                    Затем произнесите команду, например: "домой", "вниз", "громче"
                  </p>
                </div>
              </div>

              {/* Current Status */}
              {(currentTranscript || confidence > 0) && (
                <Card className="bg-gray-50">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Текущий текст:</span>
                        <Badge className={getConfidenceColor(confidence)}>
                          {(confidence * 100).toFixed(0)}%
                        </Badge>
                      </div>

                      <p className="text-lg font-mono bg-white p-3 rounded border">
                        {currentTranscript || 'Ожидание речи...'}
                      </p>

                      {confidence > 0 && (
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Уверенность распознавания</span>
                            <span>{(confidence * 100).toFixed(1)}%</span>
                          </div>
                          <Progress value={confidence * 100} className="h-2" />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quick Commands */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Быстрые команды</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {['stop_listening', 'go_home', 'scroll_down', 'increase_volume'].map((cmdId) => {
                    const command = commands.find(c => c.id === cmdId);
                    if (!command) return null;

                    return (
                      <Button
                        key={cmdId}
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestCommand(cmdId)}
                        className="text-left h-auto p-3"
                      >
                        <div>
                          <div className="font-medium text-sm">{command.description}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            "{command.keywords[0]}"
                          </div>
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* Commands Tab */}
            <TabsContent value="commands" className="p-6">
              <div className="space-y-6">
                {Object.entries(commandsByCategory).map(([category, categoryCommands]) => (
                  <div key={category}>
                    <h3 className="text-lg font-semibold mb-3 capitalize">
                      {category === 'system' && '🔧 Система'}
                      {category === 'navigation' && '🧭 Навигация'}
                      {category === 'content' && '📄 Контент'}
                      {category === 'communication' && '💬 Коммуникация'}
                      {category === 'settings' && '⚙️ Настройки'}
                    </h3>

                    <div className="grid gap-3">
                      {categoryCommands
                        .sort((a, b) => b.priority - a.priority)
                        .map((command) => (
                        <Card key={command.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <h4 className="font-medium">{command.description}</h4>
                                  <Badge variant="outline" className="text-xs">
                                    Приоритет {command.priority}
                                  </Badge>
                                  {command.requiresConfirmation && (
                                    <Badge variant="secondary" className="text-xs">
                                      Требует подтверждения
                                    </Badge>
                                  )}
                                </div>

                                <div className="space-y-1">
                                  <div className="text-sm text-gray-600">
                                    <strong>Ключевые слова:</strong> {command.keywords.join(', ')}
                                  </div>
                                  {command.aliases && command.aliases.length > 0 && (
                                    <div className="text-sm text-gray-600">
                                      <strong>Синонимы:</strong> {command.aliases.join(', ')}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleTestCommand(command.id)}
                              >
                                <Command className="w-4 h-4 mr-1" />
                                Тест
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">История команд</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCommandHistory([])}
                  >
                    Очистить
                  </Button>
                </div>

                {commandHistory.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <List className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>История команд пуста</p>
                    <p className="text-sm">Выполните команду, чтобы увидеть результат здесь</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {commandHistory.map((item) => (
                      <Card key={item.id} className="hover:shadow-sm transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start space-x-3">
                            {getCommandStatusIcon(item.result)}

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-medium truncate">
                                  {item.command}
                                </p>
                                <Badge
                                  variant={
                                    !item.result.executed ? 'secondary' :
                                    item.result.success ? 'default' : 'destructive'
                                  }
                                  className="text-xs"
                                >
                                  {getCommandStatusText(item.result)}
                                </Badge>
                              </div>

                              <p className="text-xs text-gray-600 mb-2">
                                {item.timestamp.toLocaleString()}
                              </p>

                              {item.result.response && (
                                <p className="text-sm text-green-700 bg-green-50 p-2 rounded">
                                  {item.result.response}
                                </p>
                              )}

                              {item.result.error && (
                                <p className="text-sm text-red-700 bg-red-50 p-2 rounded">
                                  Ошибка: {item.result.error}
                                </p>
                              )}

                              <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                                <span>Команда: {item.result.command.id}</span>
                                <span>Уверенность: {(item.result.params.confidence * 100).toFixed(0)}%</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default VoiceCommandInterface;
