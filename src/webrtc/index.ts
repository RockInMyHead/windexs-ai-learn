/**
 * WebRTC Module Exports
 * Main entry point for WebRTC functionality
 */

// Core
export { WebRTCManager } from './core/WebRTCManager';

// Hooks
export { useWebRTC } from './hooks/useWebRTC';

// Components
export { default as VideoCall } from './components/VideoCall';
export { default as DeviceSelector } from './components/DeviceSelector';

// Services
export { WebRTCMediaService, mediaService } from './utils/mediaService';
export { WebSocketSignalingService, MockSignalingService } from './utils/signalingService';

// Types
export type * from './types/webrtc.types';
