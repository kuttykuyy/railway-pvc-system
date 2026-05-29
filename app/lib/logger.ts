/**
 * Centralized logging utility for the Railway PVC System
 * Provides consistent, environment-aware logging across the application
 * 
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.debug('Debug info', { data });
 *   logger.info('Operation successful');
 *   logger.warn('Warning message');
 *   logger.error('Error occurred', error);
 * 
 * Configuration:
 *   Set NODE_ENV=production to disable logging
 *   Set LOG_LEVEL=debug|info|warn|error to control output level
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
}

class Logger {
  private config: LoggerConfig;
  
  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    this.config = {
      // Enable logging in development or if explicitly enabled
      enabled: isDevelopment || process.env.ENABLE_LOGGING === 'true',
      level: (process.env.LOG_LEVEL as LogLevel) || (isProduction ? 'error' : 'info')
    };
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex >= currentLevelIndex;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    return `${prefix} ${message}`;
  }

  /**
   * Log debug information (development only)
   */
  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug') && data !== undefined) {
      // eslint-disable-next-line no-console
      console.debug(this.formatMessage('debug', message), data);
    } else if (this.shouldLog('debug')) {
      // eslint-disable-next-line no-console
      console.debug(this.formatMessage('debug', message));
    }
  }

  /**
   * Log informational message
   */
  info(message: string, data?: unknown): void {
    if (this.shouldLog('info') && data !== undefined) {
      // eslint-disable-next-line no-console
      console.info(this.formatMessage('info', message), data);
    } else if (this.shouldLog('info')) {
      // eslint-disable-next-line no-console
      console.info(this.formatMessage('info', message));
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn') && data !== undefined) {
      // eslint-disable-next-line no-console
      console.warn(this.formatMessage('warn', message), data);
    } else if (this.shouldLog('warn')) {
      // eslint-disable-next-line no-console
      console.warn(this.formatMessage('warn', message));
    }
  }

  /**
   * Log error message
   */
  error(message: string, error?: unknown): void {
    if (this.shouldLog('error')) {
      if (error) {
        // eslint-disable-next-line no-console
        console.error(this.formatMessage('error', message), error);
      } else {
        // eslint-disable-next-line no-console
        console.error(this.formatMessage('error', message));
      }
    }
  }

  /**
   * Log with context (useful for debugging complex flows)
   */
  withContext(context: string) {
    return {
      debug: (message: string, data?: unknown) => this.debug(`[${context}] ${message}`, data),
      info: (message: string, data?: unknown) => this.info(`[${context}] ${message}`, data),
      warn: (message: string, data?: unknown) => this.warn(`[${context}] ${message}`, data),
      error: (message: string, error?: unknown) => this.error(`[${context}] ${message}`, error)
    };
  }
}

// Export singleton instance
export const logger = new Logger();

// Export type for use in other files
export type { LogLevel };
