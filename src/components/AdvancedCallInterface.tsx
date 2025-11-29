/**
 * Advanced Call Interface
 * Professional UI for multi-party calls with screen sharing and recording
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  Record,
  Square,
  UserPlus,
  Settings,
  MoreVertical,
  Volume2,
  VolumeX,
  Maximize,
  Minimize
} from 'lucide-react';
import { MultiPartyWebRTCManager, Participant, RecordingData } from '@/webrtc/core/MultiPartyWebRTCManager';
import { useWebRTC } from '@/webrtc/hooks/useWebRTC';
import { signalingService } from '@/webrtc/utils/signalingService';

interface AdvancedCallInterfaceProps {
  isVisible: boolean;
  onClose: () => void;
  className?: string;
}

interface ParticipantTileProps {
  participant: Participant;
  isLocal?: boolean;
  onToggleAudio?: () => void;
  onToggleVideo?: () => void;
  onToggleVolume?: () => void;
  isMuted?: boolean;
  volume?: number;
}

const ParticipantTile: React.FC<ParticipantTileProps> = ({
  participant,
  isLocal = false,
  onToggleAudio,
  onToggleVideo,
  onToggleVolume,
  isMuted = false,
  volume = 1
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const toggleFullscreen = () => {
    if (!videoRef.current) return;

    if (!isFullscreen) {
      videoRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className={`relative bg-gray-900 rounded-lg overflow-hidden transition-all duration-300 ${
      participant.isScreenSharing ? 'ring-2 ring-blue-500' : ''
    }`}>
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        muted={isLocal}
        playsInline
        className="w-full h-full object-cover"
        style={{ aspectRatio: participant.isScreenSharing ? '16/9' : '4/3' }}
      />

      {/* Participant Info Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Avatar className="w-8 h-8">
              <AvatarImage src="" />
              <AvatarFallback className="text-xs">
                {participant.displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-white text-sm font-medium">
                {participant.displayName}
                {isLocal && ' (Вы)'}
              </p>
              <div className="flex items-center space-x-1">
                {participant.isAudioEnabled ? (
                  <Volume2 className="w-3 h-3 text-green-400" />
                ) : (
                  <VolumeX className="w-3 h-3 text-red-400" />
                )}
                {participant.isVideoEnabled ? (
                  <Video className="w-3 h-3 text-green-400" />
                ) : (
                  <VideoOff className="w-3 h-3 text-red-400" />
                )}
                {participant.isScreenSharing && (
                  <Monitor className="w-3 h-3 text-blue-400" />
                )}
              </div>
            </div>
          </div>

          {/* Connection Status */}
          <Badge
            variant={
              participant.connectionState === 'connected' ? 'default' :
              participant.connectionState === 'connecting' ? 'secondary' :
              'destructive'
            }
            className="text-xs"
          >
            {participant.connectionState === 'connected' ? 'Подключен' :
             participant.connectionState === 'connecting' ? 'Подключение...' :
             'Ошибка'}
          </Badge>
        </div>
      </div>

      {/* Screen Share Indicator */}
      {participant.isScreenSharing && (
        <div className="absolute top-3 left-3 bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium">
          Демонстрация экрана
        </div>
      )}

      {/* Fullscreen Toggle */}
      {!isLocal && participant.stream && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 text-white"
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </Button>
      )}

      {/* Local Controls */}
      {isLocal && (
        <div className="absolute top-3 right-3 flex space-x-1">
          <Button
            variant="ghost"
            size="sm"
            className={`bg-black/50 hover:bg-black/70 ${
              participant.isAudioEnabled ? 'text-green-400' : 'text-red-400'
            }`}
            onClick={onToggleAudio}
          >
            {participant.isAudioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`bg-black/50 hover:bg-black/70 ${
              participant.isVideoEnabled ? 'text-green-400' : 'text-red-400'
            }`}
            onClick={onToggleVideo}
          >
            {participant.isVideoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </Button>
        </div>
      )}
    </div>
  );
};

export const AdvancedCallInterface: React.FC<AdvancedCallInterfaceProps> = ({
  isVisible,
  onClose,
  className = ''
}) => {
  const [webRTCManager] = useState(() => new MultiPartyWebRTCManager('local-user', 'Вы'));
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [recordings, setRecordings] = useState<Map<string, RecordingData>>(new Map());
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteUserId, setInviteUserId] = useState('');

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Initialize WebRTC manager
  useEffect(() => {
    if (isVisible) {
      webRTCManager.initialize().catch(console.error);

      // Setup event handlers
      webRTCManager.onParticipantJoined = (participant) => {
        setParticipants(prev => new Map(prev.set(participant.id, participant)));
      };

      webRTCManager.onParticipantLeft = (participantId) => {
        setParticipants(prev => {
          const newMap = new Map(prev);
          newMap.delete(participantId);
          return newMap;
        });
      };

      webRTCManager.onParticipantUpdated = (participant) => {
        setParticipants(prev => new Map(prev.set(participant.id, participant)));
      };

      webRTCManager.onRecordingStarted = (sessionId) => {
        setIsRecording(true);
        setRecordingTime(0);
      };

      webRTCManager.onRecordingStopped = (recording) => {
        setIsRecording(false);
        setRecordings(prev => new Map(prev.set(recording.sessionId, recording)));
      };
    }

    return () => {
      if (!isVisible) {
        webRTCManager.destroy();
      }
    };
  }, [isVisible, webRTCManager]);

  const handleStartCall = useCallback(async () => {
    try {
      const sessionId = await webRTCManager.startCall();
      setCurrentSession(webRTCManager.getCurrentSession());
      console.log('Started call:', sessionId);
    } catch (error) {
      console.error('Failed to start call:', error);
    }
  }, [webRTCManager]);

  const handleJoinCall = useCallback(async (sessionId: string) => {
    try {
      await webRTCManager.joinCall(sessionId);
      setCurrentSession(webRTCManager.getCurrentSession());
      console.log('Joined call:', sessionId);
    } catch (error) {
      console.error('Failed to join call:', error);
    }
  }, [webRTCManager]);

  const handleInviteParticipant = useCallback(async () => {
    if (!inviteUserId.trim()) return;

    try {
      await webRTCManager.inviteParticipant(inviteUserId.trim());
      setInviteUserId('');
      setInviteDialogOpen(false);
    } catch (error) {
      console.error('Failed to invite participant:', error);
    }
  }, [webRTCManager, inviteUserId]);

  const handleToggleScreenShare = useCallback(async () => {
    try {
      if (webRTCManager.isScreenSharing()) {
        webRTCManager.stopScreenShare();
        setIsScreenSharing(false);
      } else {
        await webRTCManager.startScreenShare();
        setIsScreenSharing(true);
      }
    } catch (error) {
      console.error('Failed to toggle screen share:', error);
    }
  }, [webRTCManager]);

  const handleToggleRecording = useCallback(async () => {
    try {
      if (webRTCManager.isRecording()) {
        await webRTCManager.stopRecording();
      } else {
        await webRTCManager.startRecording();
      }
    } catch (error) {
      console.error('Failed to toggle recording:', error);
    }
  }, [webRTCManager]);

  const handleLeaveCall = useCallback(async () => {
    await webRTCManager.leaveCall();
    setCurrentSession(null);
    setParticipants(new Map());
    setIsRecording(false);
    setRecordingTime(0);
    setIsScreenSharing(false);
    onClose();
  }, [webRTCManager, onClose]);

  const formatRecordingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isVisible) return null;

  const participantArray = Array.from(participants.values());
  const localParticipant = participantArray.find(p => p.id === 'local-user');

  return (
    <div className={`fixed inset-0 bg-black/90 z-50 flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-800">
        <div className="flex items-center space-x-4">
          <h2 className="text-white text-xl font-semibold">
            {currentSession ? `Звонок - ${participantArray.length} участников` : 'Готов к звонку'}
          </h2>

          {isRecording && (
            <div className="flex items-center space-x-2 bg-red-600 text-white px-3 py-1 rounded-full">
              <Record className="w-4 h-4 animate-pulse" />
              <span className="text-sm font-medium">
                Запись: {formatRecordingTime(recordingTime)}
              </span>
            </div>
          )}

          {isScreenSharing && (
            <Badge variant="secondary" className="bg-blue-600 text-white">
              <Monitor className="w-3 h-3 mr-1" />
              Демонстрация экрана
            </Badge>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {currentSession && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInviteDialogOpen(true)}
                className="text-white border-gray-600 hover:bg-gray-700"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Пригласить
              </Button>

              <Button
                variant={isScreenSharing ? "destructive" : "outline"}
                size="sm"
                onClick={handleToggleScreenShare}
                className="text-white border-gray-600 hover:bg-gray-700"
              >
                {isScreenSharing ? <MonitorOff className="w-4 h-4 mr-2" /> : <Monitor className="w-4 h-4 mr-2" />}
                Экран
              </Button>

              <Button
                variant={isRecording ? "destructive" : "outline"}
                size="sm"
                onClick={handleToggleRecording}
                className="text-white border-gray-600 hover:bg-gray-700"
              >
                {isRecording ? <Square className="w-4 h-4 mr-2" /> : <Record className="w-4 h-4 mr-2" />}
                {isRecording ? 'Стоп' : 'Запись'}
              </Button>
            </>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={handleLeaveCall}
          >
            <PhoneOff className="w-4 h-4 mr-2" />
            {currentSession ? 'Покинуть' : 'Закрыть'}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Participants Grid */}
        <div className="flex-1 p-4">
          {participantArray.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <Card className="w-96">
                <CardContent className="p-8 text-center">
                  <Phone className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-semibold mb-2">Готов к звонку</h3>
                  <p className="text-gray-600 mb-6">
                    Начните новый звонок или присоединитесь к существующему
                  </p>
                  <div className="space-y-3">
                    <Button onClick={handleStartCall} className="w-full">
                      <Phone className="w-4 h-4 mr-2" />
                      Начать звонок
                    </Button>
                    <Button variant="outline" onClick={() => {
                      const sessionId = prompt('Введите ID звонка:');
                      if (sessionId) handleJoinCall(sessionId);
                    }} className="w-full">
                      Присоединиться к звонку
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className={`grid gap-4 h-full ${
              participantArray.length === 1 ? 'grid-cols-1' :
              participantArray.length === 2 ? 'grid-cols-2' :
              participantArray.length <= 4 ? 'grid-cols-2' :
              'grid-cols-3'
            }`}>
              {participantArray.map((participant) => (
                <ParticipantTile
                  key={participant.id}
                  participant={participant}
                  isLocal={participant.id === 'local-user'}
                  onToggleAudio={() => webRTCManager.toggleAudio(participant.id)}
                  onToggleVideo={() => webRTCManager.toggleVideo(participant.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        {currentSession && participantArray.length > 1 && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
            {/* Participants List */}
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-white font-semibold mb-3">
                Участники ({participantArray.length})
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {participantArray.map((participant) => (
                  <div key={participant.id} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                    <div className="flex items-center space-x-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="text-xs">
                          {participant.displayName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-white text-sm font-medium">
                          {participant.displayName}
                        </p>
                        <p className="text-gray-400 text-xs">
                          {participant.id === 'local-user' ? 'Вы' : 'Участник'}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      {participant.isAudioEnabled ? (
                        <Mic className="w-4 h-4 text-green-400" />
                      ) : (
                        <MicOff className="w-4 h-4 text-red-400" />
                      )}
                      {participant.isVideoEnabled ? (
                        <Video className="w-4 h-4 text-green-400" />
                      ) : (
                        <VideoOff className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recordings */}
            {recordings.size > 0 && (
              <div className="p-4 border-b border-gray-700">
                <h3 className="text-white font-semibold mb-3">Записи</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {Array.from(recordings.values()).map((recording) => (
                    <div key={recording.sessionId} className="p-2 bg-gray-700 rounded">
                      <p className="text-white text-sm">
                        Запись {new Date(recording.startTime).toLocaleTimeString()}
                      </p>
                      <div className="flex space-x-2 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => {
                            if (recording.url) {
                              const a = document.createElement('a');
                              a.href = recording.url;
                              a.download = `call-recording-${recording.sessionId}.webm`;
                              a.click();
                            }
                          }}
                        >
                          Скачать
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => {
                            if (recording.url) {
                              window.open(recording.url, '_blank');
                            }
                          }}
                        >
                          Просмотр
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Invite Dialog */}
      {inviteDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-96">
            <CardHeader>
              <CardTitle>Пригласить участника</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  ID пользователя
                </label>
                <input
                  type="text"
                  value={inviteUserId}
                  onChange={(e) => setInviteUserId(e.target.value)}
                  placeholder="user123"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex space-x-2">
                <Button onClick={handleInviteParticipant} className="flex-1">
                  Пригласить
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setInviteDialogOpen(false)}
                  className="flex-1"
                >
                  Отмена
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AdvancedCallInterface;
