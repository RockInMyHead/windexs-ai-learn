/**
 * Signaling Service
 * Handles WebRTC signaling via WebSocket
 */

import {
  SignalingService,
  SignalingMessage,
  WebRTCError,
  WebRTCErrorCodes
} from '../types/webrtc.types';

export class WebSocketSignalingService implements SignalingService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private messageHandlers: Set<(message: SignalingMessage) => void> = new Set();
  private connectionPromise: Promise<void> | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(
    private serverUrl: string,
    private clientId: string
  ) {}

  /**
   * Connect to signaling server
   */
  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        console.log(`🔌 Connecting to signaling server: ${this.serverUrl}`);

        this.ws = new WebSocket(`${this.serverUrl}?clientId=${this.clientId}`);

        this.ws.onopen = () => {
          console.log('✅ Connected to signaling server');
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: SignalingMessage = JSON.parse(event.data);
            console.log('📨 Received signaling message:', message.type, 'from:', message.from);

            // Notify all handlers
            this.messageHandlers.forEach(handler => {
              try {
                handler(message);
              } catch (error) {
                console.error('Error in message handler:', error);
              }
            });
          } catch (error) {
            console.error('Error parsing signaling message:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log(`🔌 Signaling connection closed: ${event.code} ${event.reason}`);

          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }

          this.connectionPromise = null;
        };

        this.ws.onerror = (error) => {
          console.error('❌ Signaling connection error:', error);
          reject(new WebRTCError({
            code: WebRTCErrorCodes.SIGNALING_ERROR,
            message: 'Failed to connect to signaling server',
            details: error,
            timestamp: Date.now(),
            recoverable: true
          }));
          this.connectionPromise = null;
        };

      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        reject(new WebRTCError({
          code: WebRTCErrorCodes.SIGNALING_ERROR,
          message: 'Failed to create signaling connection',
          details: error,
          timestamp: Date.now(),
          recoverable: true
        }));
        this.connectionPromise = null;
      }
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect from signaling server
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.connectionPromise = null;
    this.messageHandlers.clear();
    console.log('🔌 Disconnected from signaling server');
  }

  /**
   * Send signaling message
   */
  async send(message: SignalingMessage): Promise<void> {
    if (!this.isConnected()) {
      throw new WebRTCError({
        code: WebRTCErrorCodes.SIGNALING_ERROR,
        message: 'Not connected to signaling server',
        timestamp: Date.now(),
        recoverable: true
      });
    }

    try {
      const messageWithTimestamp = {
        ...message,
        timestamp: message.timestamp || Date.now(),
        from: this.clientId
      };

      this.ws!.send(JSON.stringify(messageWithTimestamp));
      console.log('📤 Sent signaling message:', message.type, 'to:', message.to);

    } catch (error) {
      console.error('Error sending signaling message:', error);
      throw new WebRTCError({
        code: WebRTCErrorCodes.SIGNALING_ERROR,
        message: 'Failed to send signaling message',
        details: error,
        timestamp: Date.now(),
        recoverable: true
      });
    }
  }

  /**
   * Register message handler
   */
  onMessage(handler: (message: SignalingMessage) => void): () => void {
    this.messageHandlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   */
  getConnectionState(): string {
    if (!this.ws) return 'disconnected';

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'closed';
      default: return 'unknown';
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
        // Exponential backoff
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Max 30 seconds
        this.scheduleReconnect();
      });
    }, this.reconnectDelay);
  }
}

// Mock signaling service for development/testing
export class MockSignalingService implements SignalingService {
  private connected = false;
  private messageHandlers: Set<(message: SignalingMessage) => void> = new Set();
  private mockPeers: Map<string, { connected: boolean }> = new Map();

  constructor(private clientId: string) {}

  async connect(): Promise<void> {
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 500));
    this.connected = true;
    console.log('✅ Mock signaling connected');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.messageHandlers.clear();
    console.log('🔌 Mock signaling disconnected');
  }

  async send(message: SignalingMessage): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    console.log('📤 Mock sent:', message.type, 'to:', message.to);

    // Simulate peer responses for testing
    if (message.type === 'offer' && message.to) {
      setTimeout(() => {
        const answerMessage: SignalingMessage = {
          type: 'answer',
          from: message.to,
          to: message.from,
          payload: { type: 'answer', sdp: 'mock-answer-sdp' },
          timestamp: Date.now()
        };
        this.messageHandlers.forEach(handler => handler(answerMessage));
      }, 1000);
    }
  }

  onMessage(handler: (message: SignalingMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  isConnected(): boolean {
    return this.connected;
  }
}
