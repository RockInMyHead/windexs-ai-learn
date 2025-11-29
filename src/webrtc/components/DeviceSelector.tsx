/**
 * Device Selector Component
 * UI for selecting audio/video devices
 */

import React, { useState, useEffect } from 'react';
import { Mic, Video, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DeviceInfo } from '../types/webrtc.types';

interface DeviceSelectorProps {
  availableDevices: DeviceInfo[];
  onDeviceChange: (deviceId: string, kind: 'audio' | 'video') => void;
  currentAudioDevice?: string;
  currentVideoDevice?: string;
  callId?: string;
  disabled?: boolean;
}

export const DeviceSelector: React.FC<DeviceSelectorProps> = ({
  availableDevices,
  onDeviceChange,
  currentAudioDevice,
  currentVideoDevice,
  callId,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const audioDevices = availableDevices.filter(device => device.kind === 'audioinput');
  const videoDevices = availableDevices.filter(device => device.kind === 'videoinput');

  const handleAudioChange = (deviceId: string) => {
    if (callId) {
      onDeviceChange(deviceId, 'audio');
    }
  };

  const handleVideoChange = (deviceId: string) => {
    if (callId) {
      onDeviceChange(deviceId, 'video');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="flex items-center space-x-2"
        >
          <Settings className="w-4 h-4" />
          <span>Устройства</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Выбор устройств</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Audio Device Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center space-x-2">
              <Mic className="w-4 h-4" />
              <span>Микрофон</span>
            </label>
            <Select
              value={currentAudioDevice}
              onValueChange={handleAudioChange}
              disabled={disabled || !callId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите микрофон" />
              </SelectTrigger>
              <SelectContent>
                {audioDevices.map(device => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </SelectItem>
                ))}
                {audioDevices.length === 0 && (
                  <SelectItem value="" disabled>
                    Микрофоны не найдены
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Video Device Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center space-x-2">
              <Video className="w-4 h-4" />
              <span>Камера</span>
            </label>
            <Select
              value={currentVideoDevice}
              onValueChange={handleVideoChange}
              disabled={disabled || !callId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите камеру" />
              </SelectTrigger>
              <SelectContent>
                {videoDevices.map(device => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </SelectItem>
                ))}
                {videoDevices.length === 0 && (
                  <SelectItem value="" disabled>
                    Камеры не найдены
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Device Test Section */}
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Тест устройств</h4>
            <div className="text-xs text-gray-600 space-y-1">
              <p>• Выберите устройство для тестирования</p>
              <p>• Проверьте качество звука/видео</p>
              <p>• Убедитесь в отсутствии эха</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeviceSelector;
