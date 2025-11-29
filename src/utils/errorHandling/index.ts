/**
 * Error Handling & Resilience Module
 * Exports for error management utilities
 */

// Circuit Breaker
export { CircuitBreaker } from './CircuitBreaker';
export type { CircuitBreakerConfig, CircuitState } from './CircuitBreaker';

// Retry Manager
export { RetryManager } from './RetryManager';
export type { RetryConfig, RetryAttempt } from './RetryManager';

// Feature Manager
export { FeatureManager, featureManager } from './FeatureManager';
export type { FeatureSupport, DegradationLevel, DeviceCapabilities, RecommendedSettings } from './FeatureManager';

// Error Boundary Component
export { ErrorBoundary, withErrorBoundary } from '../../components/ErrorBoundary';

// Common error types
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
  recoverable: boolean;
  userMessage?: string;
}

// Error factory functions
export const createError = (
  code: string,
  message: string,
  recoverable: boolean = true,
  details?: any,
  userMessage?: string
): AppError => ({
  code,
  message,
  details,
  timestamp: Date.now(),
  recoverable,
  userMessage
});

// Common error codes
export const ErrorCodes = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  API_ERROR: 'API_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  DEVICE_ERROR: 'DEVICE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

// Error message mapping
export const getUserFriendlyMessage = (error: AppError): string => {
  if (error.userMessage) return error.userMessage;

  const messages: Record<string, string> = {
    [ErrorCodes.NETWORK_ERROR]: 'Проблемы с подключением к интернету. Проверьте соединение и попробуйте снова.',
    [ErrorCodes.API_ERROR]: 'Сервис временно недоступен. Попробуйте позже.',
    [ErrorCodes.PERMISSION_DENIED]: 'Необходимы дополнительные разрешения. Проверьте настройки браузера.',
    [ErrorCodes.DEVICE_ERROR]: 'Проблемы с устройством. Проверьте камеру и микрофон.',
    [ErrorCodes.VALIDATION_ERROR]: 'Введены некорректные данные. Проверьте и исправьте.',
    [ErrorCodes.TIMEOUT_ERROR]: 'Операция занимает слишком много времени. Попробуйте снова.',
    [ErrorCodes.UNKNOWN_ERROR]: 'Произошла непредвиденная ошибка. Попробуйте перезагрузить страницу.'
  };

  return messages[error.code] || messages[ErrorCodes.UNKNOWN_ERROR];
};

// Global error handler
export const setupGlobalErrorHandling = () => {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);

    // Prevent default browser behavior
    event.preventDefault();

    // Report error
    const error = createError(
      ErrorCodes.UNKNOWN_ERROR,
      'Unhandled promise rejection',
      false,
      event.reason
    );

    // TODO: Send to monitoring service
  });

  // Handle global errors
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);

    const error = createError(
      ErrorCodes.UNKNOWN_ERROR,
      event.message,
      false,
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
      }
    );

    // TODO: Send to monitoring service
  });

  console.log('✅ Global error handling initialized');
};
