/**
 * Video Call Component
 * UI for WebRTC video calls
 */

import React, { useRef, useEffect, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff, Settings, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWebRTC } from '../hooks/useWebRTC';

interface VideoCallProps {
  callId: string;
  onHangup: () => void;
  onToggleMute?: (muted: boolean) => void;
  onToggleVideo?: (enabled: boolean) => void;
  className?: string;
}

export const VideoCall: React.FC<VideoCallProps> = ({
  callId,
  onHangup,
  onToggleMute,
  onToggleVideo,
  className = ''
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'poor'>('good');

  const {
    currentCall,
    localStream,
    remoteStreams,
    toggleMute,
    toggleVideo,
    getCallStats
  } = useWebRTC('current-user'); // TODO: Get actual user ID

  // Update call duration
  useEffect(() => {
    if (!currentCall?.startTime) return;

    const interval = setInterval(() => {
      const duration = Math.floor((Date.now() - currentCall.startTime) / 1000);
      setCallDuration(duration);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentCall?.startTime]);

  // Update connection quality
  useEffect(() => {
    const updateQuality = async () => {
      if (!callId) return;

      try {
        const stats = await getCallStats(callId);
        const packetLoss = stats.packetsLost / (stats.packetsReceived + stats.packetsSent) || 0;

        if (packetLoss < 0.01) {
          setConnectionQuality('good');
        } else if (packetLoss < 0.05) {
          setConnectionQuality('fair');
        } else {
          setConnectionQuality('poor');
        }
      } catch (error) {
        console.error('Error getting call stats:', error);
      }
    };

    const interval = setInterval(updateQuality, 5000);
    return () => clearInterval(interval);
  }, [callId, getCallStats]);

  // Handle local video stream
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Handle remote video streams
  useEffect(() => {
    if (remoteVideoRef.current && remoteStreams.size > 0) {
      const remoteStream = Array.from(remoteStreams.values())[0];
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStreams]);

  // Auto-hide controls
  useEffect(() => {
    const timeout = setTimeout(() => setShowControls(false), 3000);

    const resetTimeout = () => {
      setShowControls(true);
      clearTimeout(timeout);
      setTimeout(() => setShowControls(false), 3000);
    };

    document.addEventListener('mousemove', resetTimeout);
    document.addEventListener('keydown', resetTimeout);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousemove', resetTimeout);
      document.removeEventListener('keydown', resetTimeout);
    };
  }, []);

  const handleToggleMute = async () => {
    try {
      const newMutedState = !isMuted;
      await toggleMute(callId, newMutedState);
      setIsMuted(newMutedState);
      onToggleMute?.(newMutedState);
    } catch (error) {
      console.error('Error toggling mute:', error);
    }
  };

  const handleToggleVideo = async () => {
    try {
      const newVideoState = !isVideoEnabled;
      await toggleVideo(callId, newVideoState);
      setIsVideoEnabled(newVideoState);
      onToggleVideo?.(newVideoState);
    } catch (error) {
      console.error('Error toggling video:', error);
    }
  };

  const handleHangup = async () => {
    try {
      await onHangup();
    } catch (error) {
      console.error('Error hanging up:', error);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'good': return 'text-green-500';
      case 'fair': return 'text-yellow-500';
      case 'poor': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className={`relative w-full h-full bg-gray-900 rounded-lg overflow-hidden ${className}`}>
      {/* Main video area */}
      <div className="relative w-full h-full">
        {/* Remote video (full screen) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }} // Mirror for natural feel
        />

        {/* Local video (picture-in-picture) */}
        <div className="absolute top-4 right-4 w-48 h-36 bg-black rounded-lg overflow-hidden border-2 border-white shadow-lg">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted // Always mute local video to prevent echo
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          {!isVideoEnabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <VideoOff className="w-8 h-8 text-gray-400" />
            </div>
          )}
        </div>

        {/* Call info overlay */}
        <div className="absolute top-4 left-4 flex items-center space-x-2">
          <Badge variant="secondary" className="bg-black/50 text-white">
            {currentCall?.participants.find(p => p !== 'current-user') || 'Unknown'}
          </Badge>
          <Badge variant="outline" className={`${getQualityColor(connectionQuality)} border-current`}>
            {connectionQuality === 'good' ? 'Отличное' :
             connectionQuality === 'fair' ? 'Хорошее' : 'Плохое'} соединение
          </Badge>
        </div>

        {/* Call duration */}
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
          <Badge variant="secondary" className="bg-black/50 text-white">
            {formatDuration(callDuration)}
          </Badge>
        </div>

        {/* Controls overlay */}
        <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center justify-center space-x-4">
            {/* Mute/Unmute */}
            <Button
              variant={isMuted ? "destructive" : "secondary"}
              size="lg"
              onClick={handleToggleMute}
              className="rounded-full w-14 h-14"
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </Button>

            {/* Video On/Off */}
            <Button
              variant={!isVideoEnabled ? "destructive" : "secondary"}
              size="lg"
              onClick={handleToggleVideo}
              className="rounded-full w-14 h-14"
            >
              {!isVideoEnabled ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </Button>

            {/* Settings */}
            <Button
              variant="secondary"
              size="lg"
              className="rounded-full w-14 h-14"
            >
              <Settings className="w-6 h-6" />
            </Button>

            {/* Participants */}
            <Button
              variant="secondary"
              size="lg"
              className="rounded-full w-14 h-14"
            >
              <Users className="w-6 h-6" />
            </Button>

            {/* Hang up */}
            <Button
              variant="destructive"
              size="lg"
              onClick={handleHangup}
              className="rounded-full w-16 h-16 ml-4"
            >
              <PhoneOff className="w-8 h-8" />
            </Button>
          </div>
        </div>

        {/* Connection status indicator */}
        {connectionQuality === 'poor' && (
          <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2">
            <Badge variant="destructive" className="animate-pulse">
              Низкое качество соединения
            </Badge>
          </div>
        )}
      </div>

      {/* Loading state */}
      {!remoteStreams.size && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white text-lg">Подключение к собеседнику...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoCall;
