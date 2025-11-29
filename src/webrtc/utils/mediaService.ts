/**
 * Media Service
 * Handles media device access, permissions, and stream management
 */

import {
  MediaService,
  DeviceInfo,
  MediaConstraints,
  WebRTCError,
  WebRTCErrorCodes,
  DEFAULT_MEDIA_CONSTRAINTS
} from '../types/webrtc.types';

export class WebRTCMediaService implements MediaService {
  private activeStreams: Set<MediaStream> = new Set();

  /**
   * Get user media with enhanced error handling
   */
  async getUserMedia(constraints: MediaConstraints = DEFAULT_MEDIA_CONSTRAINTS): Promise<MediaStream> {
    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new WebRTCError({
          code: WebRTCErrorCodes.BROWSER_NOT_SUPPORTED,
          message: 'getUserMedia is not supported in this browser',
          timestamp: Date.now(),
          recoverable: false
        });
      }

      // Request permissions and get media stream
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Store reference to active stream for cleanup
      this.activeStreams.add(stream);

      // Add ended event listeners for cleanup
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.log(`Media track ended: ${track.kind} (${track.label})`);
        });
      });

      console.log('✅ Media access granted:', {
        audio: stream.getAudioTracks().length > 0,
        video: stream.getVideoTracks().length > 0,
        tracks: stream.getTracks().map(t => ({ kind: t.kind, label: t.label, enabled: t.enabled }))
      });

      return stream;

    } catch (error: any) {
      console.error('❌ Media access error:', error);

      // Handle specific error types
      let errorCode = WebRTCErrorCodes.MEDIA_ACCESS_DENIED;
      let recoverable = false;

      if (error.name === 'NotAllowedError') {
        errorCode = WebRTCErrorCodes.PERMISSION_DENIED;
        recoverable = true;
      } else if (error.name === 'NotFoundError') {
        errorCode = WebRTCErrorCodes.DEVICE_NOT_FOUND;
        recoverable = true;
      } else if (error.name === 'NotReadableError') {
        errorCode = WebRTCErrorCodes.DEVICE_NOT_FOUND;
        recoverable = true;
      } else if (error.name === 'OverconstrainedError') {
        errorCode = WebRTCErrorCodes.DEVICE_NOT_FOUND;
        recoverable = true;
      }

      throw new WebRTCError({
        code: errorCode,
        message: this.getErrorMessage(errorCode),
        details: error,
        timestamp: Date.now(),
        recoverable
      });
    }
  }

  /**
   * Enumerate available media devices
   */
  async enumerateDevices(): Promise<DeviceInfo[]> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('enumerateDevices not supported');
        return [];
      }

      const devices = await navigator.mediaDevices.enumerateDevices();

      return devices.map(device => ({
        deviceId: device.deviceId,
        label: device.label || `${device.kind} (${device.deviceId.slice(0, 8)}...)`,
        kind: device.kind as 'audioinput' | 'audiooutput' | 'videoinput',
        groupId: device.groupId
      }));

    } catch (error) {
      console.error('Error enumerating devices:', error);
      return [];
    }
  }

  /**
   * Get supported media constraints
   */
  getSupportedConstraints(): MediaTrackSupportedConstraints {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getSupportedConstraints) {
      return {};
    }

    return navigator.mediaDevices.getSupportedConstraints();
  }

  /**
   * Stop media stream and clean up resources
   */
  stopStream(stream: MediaStream): void {
    try {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log(`🛑 Stopped media track: ${track.kind} (${track.label})`);
      });

      this.activeStreams.delete(stream);
    } catch (error) {
      console.error('Error stopping media stream:', error);
    }
  }

  /**
   * Create screen share stream
   */
  async createScreenShare(): Promise<MediaStream> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new WebRTCError({
          code: WebRTCErrorCodes.BROWSER_NOT_SUPPORTED,
          message: 'Screen sharing is not supported in this browser',
          timestamp: Date.now(),
          recoverable: false
        });
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false // Screen sharing typically doesn't include system audio
      });

      this.activeStreams.add(stream);

      console.log('✅ Screen sharing started');
      return stream;

    } catch (error: any) {
      console.error('❌ Screen sharing error:', error);

      let errorCode = WebRTCErrorCodes.MEDIA_ACCESS_DENIED;
      let recoverable = true;

      if (error.name === 'NotAllowedError') {
        errorCode = WebRTCErrorCodes.PERMISSION_DENIED;
      }

      throw new WebRTCError({
        code: errorCode,
        message: this.getErrorMessage(errorCode),
        details: error,
        timestamp: Date.now(),
        recoverable
      });
    }
  }

  /**
   * Clean up all active streams
   */
  cleanup(): void {
    this.activeStreams.forEach(stream => {
      this.stopStream(stream);
    });
    this.activeStreams.clear();
  }

  /**
   * Get user-friendly error message
   */
  private getErrorMessage(code: string): string {
    const messages = {
      [WebRTCErrorCodes.PERMISSION_DENIED]: 'Разрешение на доступ к камере/микрофону отклонено. Пожалуйста, предоставьте разрешение и попробуйте снова.',
      [WebRTCErrorCodes.DEVICE_NOT_FOUND]: 'Камера или микрофон не найдены. Проверьте подключение устройств.',
      [WebRTCErrorCodes.MEDIA_ACCESS_DENIED]: 'Не удалось получить доступ к медиа-устройствам.',
      [WebRTCErrorCodes.BROWSER_NOT_SUPPORTED]: 'Ваш браузер не поддерживает требуемые медиа-функции.',
      [WebRTCErrorCodes.NETWORK_ERROR]: 'Сетевая ошибка при доступе к медиа-устройствам.'
    };

    return messages[code] || 'Произошла неизвестная ошибка при доступе к медиа-устройствам.';
  }
}

// Singleton instance
export const mediaService = new WebRTCMediaService();
