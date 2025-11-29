/**
 * Multi-Party WebRTC Manager
 * Advanced WebRTC implementation supporting group calls, screen sharing, and recording
 */

import { signalingService } from '../utils/signalingService';
import { getLocalStream, getMediaDevices, stopMediaStream } from '../utils/mediaService';
import { SignalingMessage } from '../types/webrtc.types';

export interface Participant {
  id: string;
  displayName: string;
  stream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  joinedAt: Date;
  connectionState: RTCPeerConnectionState;
}

export interface CallSession {
  id: string;
  participants: Map<string, Participant>;
  startTime: Date;
  isRecording: boolean;
  recordingStartTime?: Date;
  screenShareParticipant?: string;
  maxParticipants: number;
}

export interface RecordingData {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  participants: string[];
  mediaRecorder?: MediaRecorder;
  recordedChunks: Blob[];
  blob?: Blob;
  url?: string;
}

export class MultiPartyWebRTCManager {
  private connections: Map<string, RTCPeerConnection> = new Map();
  private participants: Map<string, Participant> = new Map();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private currentSession: CallSession | null = null;
  private recordings: Map<string, RecordingData> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();

  // Event callbacks
  private onParticipantJoined?: (participant: Participant) => void;
  private onParticipantLeft?: (participantId: string) => void;
  private onParticipantUpdated?: (participant: Participant) => void;
  private onStreamReceived?: (participantId: string, stream: MediaStream) => void;
  private onRecordingStarted?: (sessionId: string) => void;
  private onRecordingStopped?: (recording: RecordingData) => void;

  constructor(
    private localUserId: string,
    private localDisplayName: string = 'You'
  ) {
    this.setupSignalingListeners();
  }

  /**
   * Initialize WebRTC with media access
   */
  async initialize(): Promise<void> {
    try {
      // Get local media stream
      this.localStream = await getLocalStream();

      // Add local participant
      this.addParticipant({
        id: this.localUserId,
        displayName: this.localDisplayName,
        stream: this.localStream,
        isAudioEnabled: true,
        isVideoEnabled: true,
        isScreenSharing: false,
        joinedAt: new Date(),
        connectionState: 'connected'
      });

      console.log('✅ Multi-party WebRTC initialized');

    } catch (error) {
      console.error('❌ Failed to initialize WebRTC:', error);
      throw error;
    }
  }

  /**
   * Start a new call session
   */
  async startCall(maxParticipants: number = 10): Promise<string> {
    if (this.currentSession) {
      throw new Error('Call session already active');
    }

    const sessionId = this.generateSessionId();

    this.currentSession = {
      id: sessionId,
      participants: new Map(),
      startTime: new Date(),
      isRecording: false,
      maxParticipants
    };

    // Add local participant to session
    this.currentSession.participants.set(this.localUserId, this.participants.get(this.localUserId)!);

    console.log(`📞 Started call session: ${sessionId}`);
    return sessionId;
  }

  /**
   * Join existing call session
   */
  async joinCall(sessionId: string): Promise<void> {
    if (this.currentSession) {
      throw new Error('Already in a call session');
    }

    this.currentSession = {
      id: sessionId,
      participants: new Map(),
      startTime: new Date(),
      isRecording: false,
      maxParticipants: 10
    };

    // Add local participant
    this.currentSession.participants.set(this.localUserId, this.participants.get(this.localUserId)!);

    // Request to join via signaling
    signalingService.sendMessage({
      type: 'join_call_request',
      sessionId,
      from: this.localUserId,
      to: 'server' // Assuming server handles session management
    });

    console.log(`📞 Joined call session: ${sessionId}`);
  }

  /**
   * Invite participant to current session
   */
  async inviteParticipant(participantId: string, displayName?: string): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active call session');
    }

    if (this.currentSession.participants.size >= this.currentSession.maxParticipants) {
      throw new Error('Maximum participants reached');
    }

    // Create peer connection for new participant
    const peerConnection = this.createPeerConnection(participantId);

    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.localStream!);
      });
    }

    // Create offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Send offer via signaling
    signalingService.sendMessage({
      type: 'call_invite',
      sessionId: this.currentSession.id,
      offer: offer as RTCSessionDescriptionInit,
      from: this.localUserId,
      to: participantId,
      displayName: displayName || `User ${participantId.slice(0, 8)}`
    });

    console.log(`📨 Invited participant: ${participantId}`);
  }

  /**
   * Accept call invitation
   */
  async acceptInvitation(
    sessionId: string,
    fromId: string,
    offer: RTCSessionDescriptionInit,
    displayName?: string
  ): Promise<void> {
    // Join session if not already joined
    if (!this.currentSession || this.currentSession.id !== sessionId) {
      await this.joinCall(sessionId);
    }

    // Create peer connection
    const peerConnection = this.createPeerConnection(fromId);

    // Set remote description
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    // Add local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.localStream!);
      });
    }

    // Create answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Send answer
    signalingService.sendMessage({
      type: 'call_accept',
      sessionId,
      answer: answer as RTCSessionDescriptionInit,
      from: this.localUserId,
      to: fromId,
      displayName: this.localDisplayName
    });

    // Add participant
    this.addParticipant({
      id: fromId,
      displayName: displayName || `User ${fromId.slice(0, 8)}`,
      stream: null,
      isAudioEnabled: true,
      isVideoEnabled: true,
      isScreenSharing: false,
      joinedAt: new Date(),
      connectionState: 'connecting'
    });

    console.log(`✅ Accepted call invitation from: ${fromId}`);
  }

  /**
   * Start screen sharing
   */
  async startScreenShare(): Promise<void> {
    try {
      // Stop existing screen share
      if (this.screenStream) {
        this.stopScreenShare();
      }

      // Get screen sharing stream
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          mediaSource: 'screen',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      // Update local participant
      const localParticipant = this.participants.get(this.localUserId);
      if (localParticipant) {
        localParticipant.isScreenSharing = true;
        this.onParticipantUpdated?.(localParticipant);
      }

      // Update session
      if (this.currentSession) {
        this.currentSession.screenShareParticipant = this.localUserId;
      }

      // Add screen share track to all connections
      this.connections.forEach((connection, participantId) => {
        this.screenStream!.getTracks().forEach(track => {
          const sender = connection.getSenders().find(s => s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
          } else {
            connection.addTrack(track, this.screenStream!);
          }
        });
      });

      // Handle screen share end
      this.screenStream.getVideoTracks()[0].addEventListener('ended', () => {
        this.stopScreenShare();
      });

      console.log('🖥️ Screen sharing started');

    } catch (error) {
      console.error('❌ Failed to start screen sharing:', error);
      throw error;
    }
  }

  /**
   * Stop screen sharing
   */
  stopScreenShare(): void {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }

    // Update local participant
    const localParticipant = this.participants.get(this.localUserId);
    if (localParticipant) {
      localParticipant.isScreenSharing = false;
      this.onParticipantUpdated?.(localParticipant);
    }

    // Update session
    if (this.currentSession) {
      this.currentSession.screenShareParticipant = undefined;
    }

    // Restore camera tracks
    if (this.localStream) {
      this.connections.forEach((connection, participantId) => {
        this.localStream!.getTracks().forEach(track => {
          const sender = connection.getSenders().find(s => s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
          }
        });
      });
    }

    console.log('🖥️ Screen sharing stopped');
  }

  /**
   * Start recording current session
   */
  async startRecording(): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active call session');
    }

    if (this.currentSession.isRecording) {
      throw new Error('Recording already in progress');
    }

    try {
      // Create combined stream from all participants
      const combinedStream = this.createCombinedStream();

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp9,opus'
      });

      const recordingId = this.generateRecordingId();
      const recordingData: RecordingData = {
        sessionId: this.currentSession.id,
        startTime: new Date(),
        participants: Array.from(this.currentSession.participants.keys()),
        mediaRecorder,
        recordedChunks: []
      };

      // Handle recorded data
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingData.recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        recordingData.endTime = new Date();
        recordingData.blob = new Blob(recordingData.recordedChunks, {
          type: 'video/webm'
        });
        recordingData.url = URL.createObjectURL(recordingData.blob);
        this.recordings.set(recordingId, recordingData);
        this.onRecordingStopped?.(recordingData);
        console.log(`🎥 Recording saved: ${recordingId}`);
      };

      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      recordingData.mediaRecorder = mediaRecorder;

      this.recordings.set(recordingId, recordingData);
      this.currentSession.isRecording = true;
      this.currentSession.recordingStartTime = recordingData.startTime;

      this.onRecordingStarted?.(recordingId);
      console.log(`🎥 Recording started: ${recordingId}`);

      return recordingId;

    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      throw error;
    }
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<RecordingData | null> {
    if (!this.currentSession?.isRecording) {
      return null;
    }

    // Find active recording
    const activeRecording = Array.from(this.recordings.values())
      .find(r => r.sessionId === this.currentSession!.id && !r.endTime);

    if (activeRecording?.mediaRecorder) {
      activeRecording.mediaRecorder.stop();
      this.currentSession.isRecording = false;
      this.currentSession.recordingStartTime = undefined;
      console.log('🎥 Recording stopped');
      return activeRecording;
    }

    return null;
  }

  /**
   * Leave current call
   */
  async leaveCall(): Promise<void> {
    if (!this.currentSession) return;

    // Stop recording if active
    await this.stopRecording();

    // Stop screen sharing
    this.stopScreenShare();

    // Close all connections
    this.connections.forEach((connection, participantId) => {
      connection.close();
    });
    this.connections.clear();

    // Clear data channels
    this.dataChannels.clear();

    // Remove all participants except local
    for (const [participantId] of this.participants) {
      if (participantId !== this.localUserId) {
        this.removeParticipant(participantId);
      }
    }

    // Send leave message
    signalingService.sendMessage({
      type: 'leave_call',
      sessionId: this.currentSession.id,
      from: this.localUserId,
      to: 'all'
    });

    console.log(`📞 Left call session: ${this.currentSession.id}`);
    this.currentSession = null;
  }

  /**
   * Toggle audio for participant
   */
  toggleAudio(participantId: string): void {
    const participant = this.participants.get(participantId);
    if (!participant) return;

    participant.isAudioEnabled = !participant.isAudioEnabled;

    if (participantId === this.localUserId && this.localStream) {
      // Toggle local audio tracks
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = participant.isAudioEnabled;
      });
    }

    this.onParticipantUpdated?.(participant);
    this.broadcastParticipantUpdate(participant);
  }

  /**
   * Toggle video for participant
   */
  toggleVideo(participantId: string): void {
    const participant = this.participants.get(participantId);
    if (!participant) return;

    participant.isVideoEnabled = !participant.isVideoEnabled;

    if (participantId === this.localUserId && this.localStream) {
      // Toggle local video tracks
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = participant.isVideoEnabled;
      });
    }

    this.onParticipantUpdated?.(participant);
    this.broadcastParticipantUpdate(participant);
  }

  /**
   * Send data message to participant
   */
  sendDataMessage(participantId: string, message: any): void {
    const dataChannel = this.dataChannels.get(participantId);
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast data message to all participants
   */
  broadcastDataMessage(message: any): void {
    this.dataChannels.forEach(dataChannel => {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(message));
      }
    });
  }

  // Getters
  getCurrentSession(): CallSession | null {
    return this.currentSession;
  }

  getParticipants(): Map<string, Participant> {
    return this.participants;
  }

  getParticipant(participantId: string): Participant | undefined {
    return this.participants.get(participantId);
  }

  getRecordings(): Map<string, RecordingData> {
    return this.recordings;
  }

  isScreenSharing(): boolean {
    return this.screenStream !== null;
  }

  isRecording(): boolean {
    return this.currentSession?.isRecording || false;
  }

  // Event handlers
  set onParticipantJoined(handler: (participant: Participant) => void) {
    this.onParticipantJoined = handler;
  }

  set onParticipantLeft(handler: (participantId: string) => void) {
    this.onParticipantLeft = handler;
  }

  set onParticipantUpdated(handler: (participant: Participant) => void) {
    this.onParticipantUpdated = handler;
  }

  set onStreamReceived(handler: (participantId: string, stream: MediaStream) => void) {
    this.onStreamReceived = handler;
  }

  set onRecordingStarted(handler: (sessionId: string) => void) {
    this.onRecordingStarted = handler;
  }

  set onRecordingStopped(handler: (recording: RecordingData) => void) {
    this.onRecordingStopped = handler;
  }

  // Private methods

  private createPeerConnection(participantId: string): RTCPeerConnection {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Store connection
    this.connections.set(participantId, peerConnection);

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.currentSession) {
        signalingService.sendMessage({
          type: 'ice_candidate',
          sessionId: this.currentSession.id,
          candidate: event.candidate,
          from: this.localUserId,
          to: participantId
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const participant = this.participants.get(participantId);
      if (participant) {
        participant.connectionState = peerConnection.connectionState;
        this.onParticipantUpdated?.(participant);
      }

      console.log(`🔗 Connection state for ${participantId}: ${peerConnection.connectionState}`);
    };

    // Handle incoming streams
    peerConnection.ontrack = (event) => {
      console.log(`📡 Received stream from ${participantId}`);
      this.onStreamReceived?.(participantId, event.streams[0]);
    };

    // Create data channel
    const dataChannel = peerConnection.createDataChannel('chat', {
      ordered: true,
      maxPacketLifeTime: 3000
    });

    this.setupDataChannel(dataChannel, participantId);

    // Handle incoming data channels
    peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, participantId);
    };

    return peerConnection;
  }

  private setupDataChannel(dataChannel: RTCDataChannel, participantId: string): void {
    this.dataChannels.set(participantId, dataChannel);

    dataChannel.onopen = () => {
      console.log(`💬 Data channel opened for ${participantId}`);
    };

    dataChannel.onclose = () => {
      console.log(`💬 Data channel closed for ${participantId}`);
      this.dataChannels.delete(participantId);
    };

    dataChannel.onerror = (error) => {
      console.error(`💬 Data channel error for ${participantId}:`, error);
    };

    dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log(`💬 Message from ${participantId}:`, message);
        // Handle incoming messages here
      } catch (error) {
        console.warn(`Failed to parse data channel message from ${participantId}:`, error);
      }
    };
  }

  private addParticipant(participant: Participant): void {
    this.participants.set(participant.id, participant);

    if (this.currentSession) {
      this.currentSession.participants.set(participant.id, participant);
    }

    this.onParticipantJoined?.(participant);
    console.log(`👤 Participant joined: ${participant.displayName} (${participant.id})`);
  }

  private removeParticipant(participantId: string): void {
    // Close connection
    const connection = this.connections.get(participantId);
    if (connection) {
      connection.close();
      this.connections.delete(participantId);
    }

    // Stop stream
    const participant = this.participants.get(participantId);
    if (participant?.stream) {
      stopMediaStream(participant.stream);
    }

    // Remove from collections
    this.participants.delete(participantId);
    this.dataChannels.delete(participantId);

    if (this.currentSession) {
      this.currentSession.participants.delete(participantId);
    }

    this.onParticipantLeft?.(participantId);
    console.log(`👤 Participant left: ${participantId}`);
  }

  private createCombinedStream(): MediaStream {
    const combinedStream = new MediaStream();

    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        combinedStream.addTrack(track);
      });
    }

    // Add screen share tracks if active
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => {
        combinedStream.addTrack(track);
      });
    }

    // Add tracks from other participants (simplified - in practice you'd need to mix audio)
    this.participants.forEach((participant, participantId) => {
      if (participantId !== this.localUserId && participant.stream) {
        // For simplicity, we'll only record the most active participant's video
        // In a real implementation, you'd create a canvas to composite multiple videos
        const videoTrack = participant.stream.getVideoTracks()[0];
        if (videoTrack && combinedStream.getVideoTracks().length === 0) {
          combinedStream.addTrack(videoTrack);
        }
      }
    });

    return combinedStream;
  }

  private broadcastParticipantUpdate(participant: Participant): void {
    this.sendDataMessage(participant.id, {
      type: 'participant_update',
      participant: {
        id: participant.id,
        isAudioEnabled: participant.isAudioEnabled,
        isVideoEnabled: participant.isVideoEnabled,
        isScreenSharing: participant.isScreenSharing
      }
    });
  }

  private setupSignalingListeners(): void {
    signalingService.onMessage((message: SignalingMessage) => {
      this.handleSignalingMessage(message);
    });
  }

  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    switch (message.type) {
      case 'call_invite':
        if (message.to === this.localUserId) {
          // Handle incoming call invitation
          console.log(`📨 Received call invitation from ${message.from}`);
          // In a real app, you'd show a UI to accept/reject
        }
        break;

      case 'call_accept':
        if (message.to === this.localUserId && this.currentSession) {
          const connection = this.connections.get(message.from);
          if (connection) {
            await connection.setRemoteDescription(new RTCSessionDescription(message.answer));

            // Add participant
            this.addParticipant({
              id: message.from,
              displayName: message.displayName || `User ${message.from.slice(0, 8)}`,
              stream: null,
              isAudioEnabled: true,
              isVideoEnabled: true,
              isScreenSharing: false,
              joinedAt: new Date(),
              connectionState: 'connected'
            });
          }
        }
        break;

      case 'ice_candidate':
        if (message.to === this.localUserId) {
          const connection = this.connections.get(message.from);
          if (connection && message.candidate) {
            try {
              await connection.addIceCandidate(new RTCIceCandidate(message.candidate));
            } catch (error) {
              console.warn('Failed to add ICE candidate:', error);
            }
          }
        }
        break;

      case 'leave_call':
        if (message.sessionId === this.currentSession?.id) {
          this.removeParticipant(message.from);
        }
        break;
    }
  }

  private generateSessionId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRecordingId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.leaveCall();
    stopMediaStream(this.localStream);
    this.participants.clear();
    this.recordings.clear();
    console.log('🧹 Multi-party WebRTC manager destroyed');
  }
}
