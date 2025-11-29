/**
 * useWebRTC Hook
 * React hook for WebRTC functionality
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { WebRTCManager } from '../core/WebRTCManager';
import {
  CallSession,
  MediaConstraints,
  WebRTCStats,
  DeviceInfo,
  WebRTCError
} from '../types/webrtc.types';

interface UseWebRTCReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // Call state
  activeCalls: CallSession[];
  currentCall: CallSession | null;
  isInCall: boolean;

  // Media state
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  availableDevices: DeviceInfo[];

  // Call controls
  startCall: (peerId: string, constraints?: MediaConstraints) => Promise<string>;
  answerCall: (offer: any, fromPeerId: string) => Promise<void>;
  hangupCall: (callId: string) => Promise<void>;
  toggleMute: (callId: string, muted?: boolean) => Promise<void>;
  toggleVideo: (callId: string, enabled?: boolean) => Promise<void>;
  switchDevice: (callId: string, deviceId: string, kind: 'audio' | 'video') => Promise<void>;

  // Media controls
  refreshDevices: () => Promise<void>;

  // Stats
  getCallStats: (callId: string) => Promise<WebRTCStats>;

  // Cleanup
  destroy: () => void;
}

export function useWebRTC(
  clientId: string,
  signalingServerUrl?: string
): UseWebRTCReturn {
  // WebRTC Manager instance
  const webRTCManagerRef = useRef<WebRTCManager | null>(null);

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Call state
  const [activeCalls, setActiveCalls] = useState<CallSession[]>([]);
  const [currentCall, setCurrentCall] = useState<CallSession | null>(null);
  const [isInCall, setIsInCall] = useState(false);

  // Media state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [availableDevices, setAvailableDevices] = useState<DeviceInfo[]>([]);

  // Audio/Video toggle state
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  // Initialize WebRTC Manager
  useEffect(() => {
    const initializeWebRTC = async () => {
      try {
        setIsConnecting(true);
        setConnectionError(null);

        webRTCManagerRef.current = new WebRTCManager(clientId, signalingServerUrl);

        // Set up event listeners
        webRTCManagerRef.current.on('call-started', (data) => {
          setActiveCalls(prev => [...prev, data.callSession]);
          setCurrentCall(data.callSession);
          setIsInCall(true);
        });

        webRTCManagerRef.current.on('call-ended', (data) => {
          setActiveCalls(prev => prev.filter(call => call.id !== data.callId));
          if (currentCall?.id === data.callId) {
            setCurrentCall(null);
            setIsInCall(false);
            setLocalStream(null);
          }
        });

        webRTCManagerRef.current.on('remote-stream-added', (data) => {
          setRemoteStreams(prev => new Map(prev.set(data.peerId, data.stream)));
        });

        webRTCManagerRef.current.on('error', (data) => {
          console.error('WebRTC Error:', data.error);
          setConnectionError(data.error.message);
        });

        await webRTCManagerRef.current.initialize();
        setIsConnected(true);

        // Refresh available devices
        await refreshDevices();

      } catch (error) {
        console.error('Failed to initialize WebRTC:', error);
        setConnectionError(error instanceof Error ? error.message : 'Failed to initialize WebRTC');
      } finally {
        setIsConnecting(false);
      }
    };

    initializeWebRTC();

    // Cleanup on unmount
    return () => {
      if (webRTCManagerRef.current) {
        webRTCManagerRef.current.destroy();
        webRTCManagerRef.current = null;
      }
    };
  }, [clientId, signalingServerUrl]);

  // Refresh available devices
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await webRTCManagerRef.current?.mediaService?.enumerateDevices() || [];
      setAvailableDevices(devices);
    } catch (error) {
      console.error('Error refreshing devices:', error);
    }
  }, []);

  // Call control functions
  const startCall = useCallback(async (peerId: string, constraints?: MediaConstraints): Promise<string> => {
    if (!webRTCManagerRef.current) {
      throw new Error('WebRTC not initialized');
    }

    try {
      const callId = await webRTCManagerRef.current.startCall(peerId, constraints);
      return callId;
    } catch (error) {
      console.error('Error starting call:', error);
      throw error;
    }
  }, []);

  const answerCall = useCallback(async (offer: any, fromPeerId: string): Promise<void> => {
    if (!webRTCManagerRef.current) {
      throw new Error('WebRTC not initialized');
    }

    try {
      await webRTCManagerRef.current.answerCall(offer, fromPeerId);
    } catch (error) {
      console.error('Error answering call:', error);
      throw error;
    }
  }, []);

  const hangupCall = useCallback(async (callId: string): Promise<void> => {
    if (!webRTCManagerRef.current) {
      throw new Error('WebRTC not initialized');
    }

    try {
      await webRTCManagerRef.current.hangupCall(callId);
    } catch (error) {
      console.error('Error hanging up call:', error);
      throw error;
    }
  }, []);

  const toggleMute = useCallback(async (callId: string, muted?: boolean): Promise<void> => {
    if (!webRTCManagerRef.current) {
      throw new Error('WebRTC not initialized');
    }

    const newMutedState = muted !== undefined ? muted : !isMuted;

    try {
      await webRTCManagerRef.current.toggleMute(callId, newMutedState);
      setIsMuted(newMutedState);
    } catch (error) {
      console.error('Error toggling mute:', error);
      throw error;
    }
  }, [isMuted]);

  const toggleVideo = useCallback(async (callId: string, enabled?: boolean): Promise<void> => {
    if (!webRTCManagerRef.current) {
      throw new Error('WebRTC not initialized');
    }

    const newVideoState = enabled !== undefined ? enabled : !isVideoEnabled;

    try {
      await webRTCManagerRef.current.toggleVideo(callId, newVideoState);
      setIsVideoEnabled(newVideoState);
    } catch (error) {
      console.error('Error toggling video:', error);
      throw error;
    }
  }, [isVideoEnabled]);

  const switchDevice = useCallback(async (callId: string, deviceId: string, kind: 'audio' | 'video'): Promise<void> => {
    if (!webRTCManagerRef.current) {
      throw new Error('WebRTC not initialized');
    }

    try {
      await webRTCManagerRef.current.switchDevice(callId, deviceId, kind);
    } catch (error) {
      console.error('Error switching device:', error);
      throw error;
    }
  }, []);

  const getCallStats = useCallback(async (callId: string): Promise<WebRTCStats> => {
    if (!webRTCManagerRef.current) {
      throw new Error('WebRTC not initialized');
    }

    try {
      return await webRTCManagerRef.current.getCallStats(callId);
    } catch (error) {
      console.error('Error getting call stats:', error);
      throw error;
    }
  }, []);

  const destroy = useCallback(() => {
    if (webRTCManagerRef.current) {
      webRTCManagerRef.current.destroy();
      webRTCManagerRef.current = null;
    }

    setIsConnected(false);
    setActiveCalls([]);
    setCurrentCall(null);
    setIsInCall(false);
    setLocalStream(null);
    setRemoteStreams(new Map());
  }, []);

  // Update active calls when WebRTC manager state changes
  useEffect(() => {
    if (webRTCManagerRef.current) {
      const updateActiveCalls = () => {
        const calls = webRTCManagerRef.current?.getActiveCalls() || [];
        setActiveCalls(calls);
        setCurrentCall(calls.length > 0 ? calls[calls.length - 1] : null);
        setIsInCall(calls.length > 0);
      };

      // Set up periodic updates
      const interval = setInterval(updateActiveCalls, 1000);
      return () => clearInterval(interval);
    }
  }, [isConnected]);

  return {
    // Connection state
    isConnected,
    isConnecting,
    connectionError,

    // Call state
    activeCalls,
    currentCall,
    isInCall,

    // Media state
    localStream,
    remoteStreams,
    availableDevices,

    // Call controls
    startCall,
    answerCall,
    hangupCall,
    toggleMute,
    toggleVideo,
    switchDevice,

    // Media controls
    refreshDevices,

    // Stats
    getCallStats,

    // Cleanup
    destroy
  };
}
