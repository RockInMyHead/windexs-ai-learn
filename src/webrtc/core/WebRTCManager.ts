/**
 * WebRTC Manager
 * Main orchestrator for WebRTC functionality
 */

import {
  WebRTCCallManager,
  CallSession,
  MediaConstraints,
  SignalingMessage,
  WebRTCError,
  WebRTCErrorCodes,
  WebRTCStats,
  DEFAULT_RTC_CONFIGURATION,
  DEFAULT_MEDIA_CONSTRAINTS
} from '../types/webrtc.types';
import { WebRTCMediaService } from '../utils/mediaService';
import { WebSocketSignalingService } from '../utils/signalingService';

export class WebRTCManager implements WebRTCCallManager {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private activeCalls: Map<string, CallSession> = new Map();
  private localStreams: Map<string, MediaStream> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private signalingService: WebSocketSignalingService;
  private mediaService: WebRTCMediaService;
  private eventListeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor(
    private clientId: string,
    signalingServerUrl: string = 'ws://localhost:8080'
  ) {
    this.signalingService = new WebSocketSignalingService(signalingServerUrl, clientId);
    this.mediaService = new WebRTCMediaService;

    this.setupSignalingHandlers();
  }

  /**
   * Initialize WebRTC manager
   */
  async initialize(): Promise<void> {
    try {
      await this.signalingService.connect();
      console.log('🎯 WebRTC Manager initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize WebRTC Manager:', error);
      throw error;
    }
  }

  /**
   * Start a call with peer
   */
  async startCall(peerId: string, constraints: MediaConstraints = DEFAULT_MEDIA_CONSTRAINTS): Promise<string> {
    const callId = this.generateCallId();

    try {
      console.log(`📞 Starting call ${callId} with peer: ${peerId}`);

      // Create call session
      const callSession: CallSession = {
        id: callId,
        participants: [this.clientId, peerId],
        startTime: Date.now(),
        status: 'connecting',
        initiator: this.clientId,
        mediaConstraints: constraints
      };

      this.activeCalls.set(callId, callSession);

      // Get local media stream
      const localStream = await this.mediaService.getUserMedia(constraints);
      this.localStreams.set(callId, localStream);

      // Create peer connection
      const peerConnection = this.createPeerConnection(peerId);
      this.peerConnections.set(peerId, peerConnection);

      // Add local tracks to peer connection
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });

      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      await this.signalingService.send({
        type: 'offer',
        from: this.clientId,
        to: peerId,
        payload: offer,
        timestamp: Date.now(),
        sessionId: callId
      });

      // Update call status
      callSession.status = 'connecting';
      this.emit('call-started', { callId, peerId, callSession });

      console.log(`✅ Call ${callId} initiated with peer: ${peerId}`);
      return callId;

    } catch (error) {
      console.error(`❌ Failed to start call with ${peerId}:`, error);

      // Cleanup on failure
      this.cleanupCall(callId);

      throw new WebRTCError({
        code: WebRTCErrorCodes.CONNECTION_FAILED,
        message: `Failed to start call with ${peerId}`,
        details: error,
        timestamp: Date.now(),
        recoverable: true
      });
    }
  }

  /**
   * Answer incoming call
   */
  async answerCall(offer: RTCSessionDescriptionInit, fromPeerId: string): Promise<void> {
    try {
      console.log(`📞 Answering call from peer: ${fromPeerId}`);

      // Find call session or create new one
      let callSession = Array.from(this.activeCalls.values())
        .find(call => call.participants.includes(fromPeerId));

      if (!callSession) {
        callSession = {
          id: this.generateCallId(),
          participants: [this.clientId, fromPeerId],
          startTime: Date.now(),
          status: 'connecting',
          initiator: fromPeerId,
          mediaConstraints: DEFAULT_MEDIA_CONSTRAINTS
        };
        this.activeCalls.set(callSession.id, callSession);
      }

      // Get local media stream
      const localStream = await this.mediaService.getUserMedia(callSession.mediaConstraints);
      this.localStreams.set(callSession.id, localStream);

      // Create peer connection
      const peerConnection = this.createPeerConnection(fromPeerId);
      this.peerConnections.set(fromPeerId, peerConnection);

      // Add local tracks
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });

      // Set remote description (offer)
      await peerConnection.setRemoteDescription(offer);

      // Create and send answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      await this.signalingService.send({
        type: 'answer',
        from: this.clientId,
        to: fromPeerId,
        payload: answer,
        timestamp: Date.now(),
        sessionId: callSession.id
      });

      console.log(`✅ Call answered from peer: ${fromPeerId}`);

    } catch (error) {
      console.error(`❌ Failed to answer call from ${fromPeerId}:`, error);
      throw new WebRTCError({
        code: WebRTCErrorCodes.CONNECTION_FAILED,
        message: `Failed to answer call from ${fromPeerId}`,
        details: error,
        timestamp: Date.now(),
        recoverable: true
      });
    }
  }

  /**
   * Hang up call
   */
  async hangupCall(callId: string): Promise<void> {
    try {
      console.log(`📞 Hanging up call: ${callId}`);

      const callSession = this.activeCalls.get(callId);
      if (callSession) {
        // Notify peer
        const peerId = callSession.participants.find(p => p !== this.clientId);
        if (peerId) {
          await this.signalingService.send({
            type: 'hangup',
            from: this.clientId,
            to: peerId,
            timestamp: Date.now(),
            sessionId: callId
          });
        }

        // Update call session
        callSession.endTime = Date.now();
        callSession.duration = callSession.endTime - callSession.startTime;
        callSession.status = 'disconnected';

        this.emit('call-ended', { callId, callSession });
      }

      // Cleanup
      this.cleanupCall(callId);

      console.log(`✅ Call ${callId} ended`);

    } catch (error) {
      console.error(`❌ Failed to hang up call ${callId}:`, error);
      throw error;
    }
  }

  /**
   * Toggle mute for call
   */
  async toggleMute(callId: string, muted: boolean): Promise<void> {
    const localStream = this.localStreams.get(callId);
    if (!localStream) {
      throw new Error(`Call ${callId} not found`);
    }

    localStream.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });

    this.emit('mute-toggled', { callId, muted });
    console.log(`🎤 ${muted ? 'Muted' : 'Unmuted'} call ${callId}`);
  }

  /**
   * Toggle video for call
   */
  async toggleVideo(callId: string, enabled: boolean): Promise<void> {
    const localStream = this.localStreams.get(callId);
    if (!localStream) {
      throw new Error(`Call ${callId} not found`);
    }

    localStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    });

    this.emit('video-toggled', { callId, enabled });
    console.log(`📹 ${enabled ? 'Enabled' : 'Disabled'} video for call ${callId}`);
  }

  /**
   * Switch media device
   */
  async switchDevice(callId: string, deviceId: string, kind: 'audio' | 'video'): Promise<void> {
    const callSession = this.activeCalls.get(callId);
    if (!callSession) {
      throw new Error(`Call ${callId} not found`);
    }

    // Get new constraints with specific device
    const newConstraints = { ...callSession.mediaConstraints };
    if (kind === 'audio') {
      newConstraints.audio = { deviceId: { exact: deviceId } };
    } else {
      newConstraints.video = { deviceId: { exact: deviceId } };
    }

    // Get new stream
    const newStream = await this.mediaService.getUserMedia(newConstraints);

    // Replace tracks in peer connections
    const peerConnections = Array.from(this.peerConnections.values());
    for (const pc of peerConnections) {
      const sender = pc.getSenders().find(s => s.track?.kind === kind);
      if (sender) {
        const newTrack = kind === 'audio'
          ? newStream.getAudioTracks()[0]
          : newStream.getVideoTracks()[0];

        if (newTrack) {
          await sender.replaceTrack(newTrack);
        }
      }
    }

    // Update local stream
    const oldStream = this.localStreams.get(callId);
    if (oldStream) {
      this.mediaService.stopStream(oldStream);
    }
    this.localStreams.set(callId, newStream);

    this.emit('device-switched', { callId, deviceId, kind });
    console.log(`🔄 Switched ${kind} device for call ${callId}`);
  }

  /**
   * Get active calls
   */
  getActiveCalls(): CallSession[] {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Get call statistics
   */
  async getCallStats(callId: string): Promise<WebRTCStats> {
    const callSession = this.activeCalls.get(callId);
    if (!callSession) {
      throw new Error(`Call ${callId} not found`);
    }

    // Collect stats from all peer connections
    const stats: WebRTCStats = {
      timestamp: Date.now(),
      bytesReceived: 0,
      bytesSent: 0,
      packetsReceived: 0,
      packetsSent: 0,
      packetsLost: 0
    };

    for (const pc of this.peerConnections.values()) {
      try {
        const report = await pc.getStats();
        report.forEach(stat => {
          if (stat.type === 'inbound-rtp') {
            stats.bytesReceived += stat.bytesReceived || 0;
            stats.packetsReceived += stat.packetsReceived || 0;
            stats.packetsLost += stat.packetsLost || 0;
          } else if (stat.type === 'outbound-rtp') {
            stats.bytesSent += stat.bytesSent || 0;
            stats.packetsSent += stat.packetsSent || 0;
          }
        });
      } catch (error) {
        console.warn('Error getting stats:', error);
      }
    }

    return stats;
  }

  /**
   * Event system
   */
  on(event: string, handler: (data: any) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }

    this.eventListeners.get(event)!.add(handler);

    return () => {
      const handlers = this.eventListeners.get(event);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    // Hang up all calls
    for (const callId of this.activeCalls.keys()) {
      this.hangupCall(callId).catch(console.error);
    }

    // Close all peer connections
    for (const pc of this.peerConnections.values()) {
      pc.close();
    }

    // Stop all streams
    for (const stream of this.localStreams.values()) {
      this.mediaService.stopStream(stream);
    }

    // Disconnect signaling
    this.signalingService.disconnect().catch(console.error);

    // Clear all collections
    this.peerConnections.clear();
    this.activeCalls.clear();
    this.localStreams.clear();
    this.remoteStreams.clear();
    this.eventListeners.clear();

    console.log('🧹 WebRTC Manager destroyed');
  }

  // Private methods

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIGURATION);

    // ICE candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingService.send({
          type: 'ice-candidate',
          from: this.clientId,
          to: peerId,
          payload: event.candidate,
          timestamp: Date.now()
        }).catch(error => console.error('Error sending ICE candidate:', error));
      }
    };

    // Connection state change
    pc.onconnectionstatechange = () => {
      console.log(`🔗 Peer ${peerId} connection state: ${pc.connectionState}`);
      this.emit('connection-state-changed', { peerId, state: pc.connectionState });
    };

    // ICE connection state change
    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 Peer ${peerId} ICE state: ${pc.iceConnectionState}`);
    };

    // Track handler (remote media)
    pc.ontrack = (event) => {
      console.log(`🎥 Received track from ${peerId}:`, event.track.kind);
      this.remoteStreams.set(peerId, event.streams[0]);
      this.emit('remote-stream-added', { peerId, stream: event.streams[0] });
    };

    return pc;
  }

  private setupSignalingHandlers(): void {
    this.signalingService.onMessage(async (message) => {
      try {
        switch (message.type) {
          case 'offer':
            console.log(`📨 Received offer from ${message.from}`);
            await this.handleOffer(message);
            break;

          case 'answer':
            console.log(`📨 Received answer from ${message.from}`);
            await this.handleAnswer(message);
            break;

          case 'ice-candidate':
            console.log(`📨 Received ICE candidate from ${message.from}`);
            await this.handleIceCandidate(message);
            break;

          case 'hangup':
            console.log(`📨 Received hangup from ${message.from}`);
            await this.handleHangup(message);
            break;
        }
      } catch (error) {
        console.error('Error handling signaling message:', error);
        this.emit('error', { message, error });
      }
    });
  }

  private async handleOffer(message: SignalingMessage): Promise<void> {
    const offer = message.payload as RTCSessionDescriptionInit;
    await this.answerCall(offer, message.from);
  }

  private async handleAnswer(message: SignalingMessage): Promise<void> {
    const pc = this.peerConnections.get(message.from);
    if (pc) {
      const answer = message.payload as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(answer);
      console.log(`✅ Remote description set for peer ${message.from}`);
    }
  }

  private async handleIceCandidate(message: SignalingMessage): Promise<void> {
    const pc = this.peerConnections.get(message.from);
    if (pc) {
      const candidate = message.payload as RTCIceCandidateInit;
      await pc.addIceCandidate(candidate);
      console.log(`✅ ICE candidate added for peer ${message.from}`);
    }
  }

  private async handleHangup(message: SignalingMessage): Promise<void> {
    const callSession = Array.from(this.activeCalls.values())
      .find(call => call.participants.includes(message.from));

    if (callSession) {
      await this.hangupCall(callSession.id);
    }
  }

  private cleanupCall(callId: string): void {
    // Close peer connections
    for (const [peerId, pc] of this.peerConnections) {
      pc.close();
    }
    this.peerConnections.clear();

    // Stop streams
    const localStream = this.localStreams.get(callId);
    if (localStream) {
      this.mediaService.stopStream(localStream);
      this.localStreams.delete(callId);
    }

    // Remove remote streams
    this.remoteStreams.clear();

    // Remove call session
    this.activeCalls.delete(callId);
  }

  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }
}
