/**
 * Voice Command Processor
 * Advanced voice command recognition and execution system
 */

import { UniversalSpeechRecognition } from '../browserCompatibility/UniversalSpeechRecognition';
import { echoDetectorV2 } from '../echoDetection/EchoDetectorV2';

export interface VoiceCommand {
  id: string;
  keywords: string[];
  aliases?: string[];
  description: string;
  category: 'system' | 'navigation' | 'content' | 'communication' | 'settings';
  priority: number; // Higher = more important
  requiresConfirmation?: boolean;
  action: (params: VoiceCommandParams) => Promise<void> | void;
  validator?: (params: VoiceCommandParams) => boolean;
}

export interface VoiceCommandParams {
  command: string;
  confidence: number;
  rawTranscript: string;
  extractedParams: Record<string, any>;
  context: {
    currentPage: string;
    userId?: string;
    timestamp: number;
  };
}

export interface VoiceCommandResult {
  command: VoiceCommand;
  params: VoiceCommandParams;
  executed: boolean;
  success: boolean;
  response?: string;
  error?: string;
}

export class VoiceCommandProcessor {
  private commands: Map<string, VoiceCommand> = new Map();
  private speechRecognition: UniversalSpeechRecognition | null = null;
  private isListening = false;
  private wakeWords = ['эй', 'слушай', 'помоги', 'ассистент'];
  private lastCommandTime = 0;
  private commandCooldown = 1000; // 1 second between commands

  // Event callbacks
  private onCommandDetected?: (result: VoiceCommandResult) => void;
  private onWakeWordDetected?: (wakeWord: string) => void;
  private onListeningStateChanged?: (isListening: boolean) => void;

  constructor() {
    this.registerDefaultCommands();
  }

  /**
   * Initialize voice command processor
   */
  async initialize(): Promise<void> {
    this.speechRecognition = new UniversalSpeechRecognition(
      {
        continuous: true,
        interimResults: true,
        lang: 'ru-RU'
      },
      {
        onStart: () => {
          this.isListening = true;
          this.onListeningStateChanged?.(true);
        },
        onResult: (result) => {
          this.processTranscript(result.transcript, result.confidence);
        },
        onError: (error) => {
          console.error('Voice command recognition error:', error);
        },
        onEnd: () => {
          this.isListening = false;
          this.onListeningStateChanged?.(false);
        }
      }
    );

    console.log('✅ Voice command processor initialized');
  }

  /**
   * Start listening for voice commands
   */
  async startListening(): Promise<void> {
    if (!this.speechRecognition) {
      throw new Error('Voice command processor not initialized');
    }

    await this.speechRecognition.start();
  }

  /**
   * Stop listening for voice commands
   */
  stopListening(): void {
    if (this.speechRecognition) {
      this.speechRecognition.stop();
    }
  }

  /**
   * Register a voice command
   */
  registerCommand(command: VoiceCommand): void {
    this.commands.set(command.id, command);
    console.log(`📝 Registered voice command: ${command.id} - ${command.description}`);
  }

  /**
   * Unregister a voice command
   */
  unregisterCommand(commandId: string): void {
    this.commands.delete(commandId);
    console.log(`🗑️ Unregistered voice command: ${commandId}`);
  }

  /**
   * Get all registered commands
   */
  getCommands(): VoiceCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get commands by category
   */
  getCommandsByCategory(category: VoiceCommand['category']): VoiceCommand[] {
    return Array.from(this.commands.values())
      .filter(cmd => cmd.category === category)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Execute a command directly (for testing or programmatic use)
   */
  async executeCommand(commandId: string, params: Partial<VoiceCommandParams> = {}): Promise<VoiceCommandResult> {
    const command = this.commands.get(commandId);
    if (!command) {
      throw new Error(`Command not found: ${commandId}`);
    }

    const commandParams: VoiceCommandParams = {
      command: commandId,
      confidence: 1.0,
      rawTranscript: `Direct execution: ${commandId}`,
      extractedParams: {},
      context: {
        currentPage: window.location.pathname,
        timestamp: Date.now(),
        ...params.context
      },
      ...params
    };

    return this.executeCommandInternal(command, commandParams);
  }

  // Private methods

  private registerDefaultCommands(): void {
    // System commands
    this.registerCommand({
      id: 'stop_listening',
      keywords: ['стоп', 'перестань слушать', 'хватит', 'отмена'],
      aliases: ['прекрати', 'закончи'],
      description: 'Остановить прослушивание команд',
      category: 'system',
      priority: 100,
      action: async () => {
        this.stopListening();
        return 'Прослушивание остановлено';
      }
    });

    this.registerCommand({
      id: 'start_listening',
      keywords: ['начни слушать', 'продолжи', 'возобнови'],
      aliases: ['слушай', 'включи'],
      description: 'Возобновить прослушивание команд',
      category: 'system',
      priority: 95,
      action: async () => {
        await this.startListening();
        return 'Прослушивание возобновлено';
      }
    });

    // Navigation commands
    this.registerCommand({
      id: 'go_home',
      keywords: ['домой', 'главная', 'на главную'],
      aliases: ['вернись на главную'],
      description: 'Перейти на главную страницу',
      category: 'navigation',
      priority: 90,
      action: async () => {
        window.location.href = '/';
        return 'Переход на главную страницу';
      }
    });

    this.registerCommand({
      id: 'go_back',
      keywords: ['назад', 'вернись', 'предыдущая страница'],
      aliases: ['вернуться'],
      description: 'Вернуться на предыдущую страницу',
      category: 'navigation',
      priority: 85,
      action: async () => {
        window.history.back();
        return 'Возврат на предыдущую страницу';
      }
    });

    this.registerCommand({
      id: 'go_chat',
      keywords: ['чат', 'в чат', 'начни чат'],
      aliases: ['открой чат'],
      description: 'Перейти в голосовой чат',
      category: 'navigation',
      priority: 80,
      action: async () => {
        window.location.href = '/voice-chat';
        return 'Переход в голосовой чат';
      }
    });

    // Content commands
    this.registerCommand({
      id: 'scroll_down',
      keywords: ['вниз', 'прокрути вниз', 'далее'],
      aliases: ['ниже', 'дальше'],
      description: 'Прокрутить страницу вниз',
      category: 'content',
      priority: 70,
      action: async () => {
        window.scrollBy({ top: 500, behavior: 'smooth' });
        return 'Страница прокручена вниз';
      }
    });

    this.registerCommand({
      id: 'scroll_up',
      keywords: ['вверх', 'прокрути вверх', 'назад'],
      aliases: ['выше', 'раньше'],
      description: 'Прокрутить страницу вверх',
      category: 'content',
      priority: 70,
      action: async () => {
        window.scrollBy({ top: -500, behavior: 'smooth' });
        return 'Страница прокручена вверх';
      }
    });

    this.registerCommand({
      id: 'refresh_page',
      keywords: ['обнови', 'перезагрузи', 'обновить страницу'],
      aliases: ['reload', 'refresh'],
      description: 'Перезагрузить страницу',
      category: 'content',
      priority: 65,
      action: async () => {
        window.location.reload();
        return 'Страница перезагружается';
      }
    });

    // Communication commands
    this.registerCommand({
      id: 'start_call',
      keywords: ['позвони', 'начни звонок', 'вызов'],
      aliases: ['call', 'позвонить'],
      description: 'Начать голосовой звонок',
      category: 'communication',
      priority: 75,
      requiresConfirmation: true,
      action: async () => {
        // This would integrate with the WebRTC system
        console.log('Starting call...');
        return 'Инициирую звонок';
      }
    });

    this.registerCommand({
      id: 'mute_microphone',
      keywords: ['выключи микрофон', 'замолчи', 'тихо'],
      aliases: ['mute', 'без звука'],
      description: 'Выключить микрофон',
      category: 'communication',
      priority: 85,
      action: async () => {
        // This would integrate with media controls
        console.log('Muting microphone...');
        return 'Микрофон выключен';
      }
    });

    this.registerCommand({
      id: 'unmute_microphone',
      keywords: ['включи микрофон', 'громко', 'говори'],
      aliases: ['unmute', 'со звуком'],
      description: 'Включить микрофон',
      category: 'communication',
      priority: 85,
      action: async () => {
        // This would integrate with media controls
        console.log('Unmuting microphone...');
        return 'Микрофон включен';
      }
    });

    // Settings commands
    this.registerCommand({
      id: 'increase_volume',
      keywords: ['громче', 'увеличь громкость', 'громкость выше'],
      aliases: ['volume up', 'громче звук'],
      description: 'Увеличить громкость',
      category: 'settings',
      priority: 60,
      action: async () => {
        // This would control TTS volume
        console.log('Increasing volume...');
        return 'Громкость увеличена';
      }
    });

    this.registerCommand({
      id: 'decrease_volume',
      keywords: ['тише', 'уменьши громкость', 'громкость ниже'],
      aliases: ['volume down', 'тише звук'],
      description: 'Уменьшить громкость',
      category: 'settings',
      priority: 60,
      action: async () => {
        // This would control TTS volume
        console.log('Decreasing volume...');
        return 'Громкость уменьшена';
      }
    });

    // Learning-specific commands
    this.registerCommand({
      id: 'next_question',
      keywords: ['следующий вопрос', 'дальше вопрос', 'новый вопрос'],
      aliases: ['next', 'следующий'],
      description: 'Перейти к следующему вопросу',
      category: 'content',
      priority: 50,
      validator: (params) => params.context.currentPage.includes('/quiz') || params.context.currentPage.includes('/test'),
      action: async () => {
        // Simulate clicking next button
        const nextButton = document.querySelector('[data-action="next-question"]') as HTMLButtonElement;
        if (nextButton) {
          nextButton.click();
          return 'Переход к следующему вопросу';
        }
        return 'Кнопка "Далее" не найдена';
      }
    });

    this.registerCommand({
      id: 'show_answer',
      keywords: ['покажи ответ', 'ответ', 'подсказка'],
      aliases: ['hint', 'помоги'],
      description: 'Показать правильный ответ',
      category: 'content',
      priority: 45,
      validator: (params) => params.context.currentPage.includes('/quiz') || params.context.currentPage.includes('/test'),
      action: async () => {
        const showAnswerButton = document.querySelector('[data-action="show-answer"]') as HTMLButtonElement;
        if (showAnswerButton) {
          showAnswerButton.click();
          return 'Показан правильный ответ';
        }
        return 'Функция подсказки недоступна';
      }
    });
  }

  private async processTranscript(transcript: string, confidence: number): Promise<void> {
    const normalizedTranscript = transcript.toLowerCase().trim();

    // Check for wake words first
    const wakeWord = this.detectWakeWord(normalizedTranscript);
    if (wakeWord) {
      this.onWakeWordDetected?.(wakeWord);
      console.log(`🎤 Wake word detected: "${wakeWord}"`);
      return;
    }

    // Skip if confidence is too low
    if (confidence < 0.7) {
      console.log(`🔇 Low confidence transcript ignored: "${transcript}" (${confidence})`);
      return;
    }

    // Check for echo
    const echoResult = await echoDetectorV2.detectEcho(transcript);
    if (echoResult.isEcho) {
      console.log(`🔇 Echo detected, ignoring command: "${transcript}"`);
      return;
    }

    // Rate limiting
    const now = Date.now();
    if (now - this.lastCommandTime < this.commandCooldown) {
      console.log('⏰ Command rate limited');
      return;
    }

    // Find matching command
    const matchingCommand = this.findMatchingCommand(normalizedTranscript);
    if (!matchingCommand) {
      console.log(`❓ No matching command found for: "${transcript}"`);
      return;
    }

    // Extract parameters
    const params = this.extractParameters(normalizedTranscript, matchingCommand, confidence);

    // Validate command if validator exists
    if (matchingCommand.validator && !matchingCommand.validator(params)) {
      console.log(`❌ Command validation failed: ${matchingCommand.id}`);
      return;
    }

    // Execute command
    this.lastCommandTime = now;
    const result = await this.executeCommandInternal(matchingCommand, params);

    this.onCommandDetected?.(result);
    console.log(`✅ Command executed: ${matchingCommand.id}`);
  }

  private detectWakeWord(transcript: string): string | null {
    for (const wakeWord of this.wakeWords) {
      if (transcript.startsWith(wakeWord) || transcript.includes(` ${wakeWord} `)) {
        return wakeWord;
      }
    }
    return null;
  }

  private findMatchingCommand(transcript: string): VoiceCommand | null {
    let bestMatch: VoiceCommand | null = null;
    let bestScore = 0;

    for (const command of this.commands.values()) {
      const score = this.calculateCommandMatchScore(transcript, command);
      if (score > bestScore && score > 0.6) { // Minimum threshold
        bestMatch = command;
        bestScore = score;
      }
    }

    return bestMatch;
  }

  private calculateCommandMatchScore(transcript: string, command: VoiceCommand): number {
    let maxScore = 0;

    // Check all keywords and aliases
    const allTriggers = [...command.keywords, ...(command.aliases || [])];

    for (const trigger of allTriggers) {
      const score = this.calculateStringSimilarity(transcript, trigger);
      maxScore = Math.max(maxScore, score);
    }

    // Boost score based on priority
    const priorityBoost = command.priority / 100;
    return Math.min(maxScore + priorityBoost, 1.0);
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein distance based similarity
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private extractParameters(
    transcript: string,
    command: VoiceCommand,
    confidence: number
  ): VoiceCommandParams {
    const extractedParams: Record<string, any> = {};

    // Extract numbers
    const numberMatch = transcript.match(/\d+/);
    if (numberMatch) {
      extractedParams.number = parseInt(numberMatch[0]);
    }

    // Extract time references
    if (transcript.includes('секунд') || transcript.includes('сек')) {
      extractedParams.unit = 'seconds';
    } else if (transcript.includes('минут') || transcript.includes('мин')) {
      extractedParams.unit = 'minutes';
    }

    return {
      command: command.id,
      confidence,
      rawTranscript: transcript,
      extractedParams,
      context: {
        currentPage: window.location.pathname,
        timestamp: Date.now()
      }
    };
  }

  private async executeCommandInternal(
    command: VoiceCommand,
    params: VoiceCommandParams
  ): Promise<VoiceCommandResult> {
    const result: VoiceCommandResult = {
      command,
      params,
      executed: false,
      success: false
    };

    try {
      // Check if confirmation is required
      if (command.requiresConfirmation) {
        // In a real implementation, this would show a confirmation dialog
        console.log(`⚠️ Command "${command.id}" requires confirmation`);
        // For now, we'll assume confirmation is given
      }

      const response = await command.action(params);
      result.executed = true;
      result.success = true;
      result.response = response as string;

    } catch (error) {
      result.success = false;
      result.error = (error as Error).message;
      console.error(`❌ Command execution failed: ${command.id}`, error);
    }

    return result;
  }

  // Event handlers
  set onCommandDetected(handler: (result: VoiceCommandResult) => void) {
    this.onCommandDetected = handler;
  }

  set onWakeWordDetected(handler: (wakeWord: string) => void) {
    this.onWakeWordDetected = handler;
  }

  set onListeningStateChanged(handler: (isListening: boolean) => void) {
    this.onListeningStateChanged = handler;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopListening();
    this.commands.clear();
    console.log('🧹 Voice command processor destroyed');
  }
}

// Singleton instance
export const voiceCommandProcessor = new VoiceCommandProcessor();
