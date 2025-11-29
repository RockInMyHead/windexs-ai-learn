/**
 * WebRTC Types and Interfaces
 * Comprehensive type definitions for WebRTC functionality
 */

export interface PeerConnectionConfig {
  peerId: string;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  signalingState: RTCSignalingState;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-request' | 'call-accepted' | 'call-rejected' | 'hangup';
  from: string;
  to: string;
  payload?: any;
  timestamp: number;
  sessionId?: string;
}

export interface MediaConstraints {
  audio: boolean | MediaTrackConstraints;
  video: boolean | MediaTrackConstraints;
}

export interface WebRTCError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
  recoverable: boolean;
}

export interface CallSession {
  id: string;
  participants: string[];
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'connecting' | 'connected' | 'disconnected' | 'failed';
  initiator: string;
  mediaConstraints: MediaConstraints;
}

export interface DeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
  groupId?: string;
}

export interface WebRTCStats {
  timestamp: number;
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
  packetsLost: number;
  roundTripTime?: number;
  jitter?: number;
  audioLevel?: number;
  frameRate?: number;
  resolution?: {
    width: number;
    height: number;
  };
}

export type WebRTCEvent =
  | 'connection-state-change'
  | 'ice-connection-state-change'
  | 'signaling-state-change'
  | 'track-added'
  | 'track-removed'
  | 'data-channel-open'
  | 'data-channel-close'
  | 'error'
  | 'stats-update';

export interface WebRTCEventHandler {
  event: WebRTCEvent;
  handler: (data: any) => void;
}

export interface SignalingService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: SignalingMessage): Promise<void>;
  onMessage(handler: (message: SignalingMessage) => void): () => void;
  isConnected(): boolean;
}

export interface MediaService {
  getUserMedia(constraints: MediaConstraints): Promise<MediaStream>;
  enumerateDevices(): Promise<DeviceInfo[]>;
  getSupportedConstraints(): MediaTrackSupportedConstraints;
  stopStream(stream: MediaStream): void;
  createScreenShare(): Promise<MediaStream>;
}

export interface PeerConnectionService {
  createPeerConnection(config: RTCConfiguration): RTCPeerConnection;
  addTrack(track: MediaStreamTrack, stream: MediaStream): RTCRtpSender;
  removeTrack(sender: RTCRtpSender): void;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  close(): void;
  getStats(): Promise<RTCStatsReport>;
}

export interface WebRTCCallManager {
  startCall(peerId: string, constraints?: MediaConstraints): Promise<string>;
  answerCall(offer: RTCSessionDescriptionInit, fromPeerId: string): Promise<void>;
  hangupCall(callId: string): Promise<void>;
  toggleMute(callId: string, muted: boolean): Promise<void>;
  toggleVideo(callId: string, enabled: boolean): Promise<void>;
  switchDevice(callId: string, deviceId: string, kind: 'audio' | 'video'): Promise<void>;
  getActiveCalls(): CallSession[];
  getCallStats(callId: string): Promise<WebRTCStats>;
}

// Error codes
export const WebRTCErrorCodes = {
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  SIGNALING_ERROR: 'SIGNALING_ERROR',
  ICE_FAILED: 'ICE_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  BROWSER_NOT_SUPPORTED: 'BROWSER_NOT_SUPPORTED',
  MEDIA_ACCESS_DENIED: 'MEDIA_ACCESS_DENIED',
  TRACK_ERROR: 'TRACK_ERROR',
  TIMEOUT: 'TIMEOUT'
} as const;

export type WebRTCErrorCode = typeof WebRTCErrorCodes[keyof typeof WebRTCErrorCodes];

// Default configurations
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
      'stun:stun4.l.google.com:19302'
    ]
  },
  {
    urls: 'turn:turn.bistri.com:80',
    username: 'homeo',
    credential: 'homeo'
  }
];

export const DEFAULT_MEDIA_CONSTRAINTS: MediaConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 44100,
    channelCount: 1
  },
  video: {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 60 }
  }
};

export const DEFAULT_RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: DEFAULT_ICE_SERVERS,
  iceTransportPolicy: 'all',
  bundlePolicy: 'balanced',
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: 10
};
