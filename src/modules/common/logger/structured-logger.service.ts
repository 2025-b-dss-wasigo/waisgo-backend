/**
 * Servicio de negocio del modulo common.
 */

import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import {
  SecurityEvent,
  SecurityEventLevel,
  SecurityEventType,
  SecurityEventResult,
} from './interfaces/security-event.interface';

/**
 * Servicio de logging estructurado con formato JSON
 * Compatible con ELK Stack, Grafana Loki, CloudWatch, etc.
 */
@Injectable()
export class StructuredLogger implements NestLoggerService {
  private readonly isProduction: boolean;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  /**
   * Loguear evento de seguridad estructurado
   */
  logSecurityEvent(event: SecurityEvent): void {
    const logEntry = this.formatSecurityEvent(event);

    // En producción, siempre JSON
    // En desarrollo, formato legible si no es crítico
    if (this.isProduction || event.level === SecurityEventLevel.CRITICAL) {
      console.log(JSON.stringify(logEntry));
    } else {
      this.prettyPrint(logEntry);
    }
  }

  /**
   * Loguear evento exitoso
   */
  logSuccess(
    eventType: SecurityEventType,
    action: string,
    userId?: string,
    resource?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.logSecurityEvent({
      timestamp: new Date().toISOString(),
      level: SecurityEventLevel.INFO,
      event_type: eventType,
      user_id: userId,
      action,
      resource,
      result: SecurityEventResult.SUCCESS,
      message: `${action} completed successfully`,
      metadata,
    });
  }

  /**
   * Loguear fallo de operación
   */
  logFailure(
    eventType: SecurityEventType,
    action: string,
    message: string,
    userId?: string,
    resource?: string,
    errorCode?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.logSecurityEvent({
      timestamp: new Date().toISOString(),
      level: SecurityEventLevel.WARN,
      event_type: eventType,
      user_id: userId,
      action,
      resource,
      result: SecurityEventResult.FAILURE,
      message,
      error_code: errorCode,
      metadata,
    });
  }

  /**
   * Loguear acceso denegado
   */
  logDenied(
    eventType: SecurityEventType,
    action: string,
    message: string,
    userId?: string,
    resource?: string,
    ipAddress?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.logSecurityEvent({
      timestamp: new Date().toISOString(),
      level: SecurityEventLevel.ERROR,
      event_type: eventType,
      user_id: userId,
      ip_address: ipAddress,
      action,
      resource,
      result: SecurityEventResult.DENIED,
      message,
      metadata,
    });
  }

  /**
   * Loguear evento crítico de seguridad
   */
  logCritical(
    eventType: SecurityEventType,
    action: string,
    message: string,
    userId?: string,
    ipAddress?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.logSecurityEvent({
      timestamp: new Date().toISOString(),
      level: SecurityEventLevel.CRITICAL,
      event_type: eventType,
      user_id: userId,
      ip_address: ipAddress,
      action,
      resource: undefined,
      result: SecurityEventResult.DENIED,
      message,
      metadata,
    });
  }

  /**
   * Implementación NestJS LoggerService para compatibilidad
   */
  log(message: string, context?: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      context,
      message,
    };
    console.log(JSON.stringify(logEntry));
  }

  error(message: string, trace?: string, context?: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      context,
      message,
      trace: this.isProduction ? undefined : trace,
    };
    console.error(JSON.stringify(logEntry));
  }

  warn(message: string, context?: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      context,
      message,
    };
    console.warn(JSON.stringify(logEntry));
  }

  debug(message: string, context?: string): void {
    if (!this.isProduction) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        context,
        message,
      };
      console.debug(JSON.stringify(logEntry));
    }
  }

  verbose(message: string, context?: string): void {
    if (!this.isProduction) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'VERBOSE',
        context,
        message,
      };
      console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Formatear evento de seguridad
   */
  private formatSecurityEvent(event: SecurityEvent): SecurityEvent {
    // Sanitizar datos sensibles
    const sanitized = { ...event };

    // Remover stack trace en producción
    if (this.isProduction) {
      delete sanitized.error_stack;
    }

    // Asegurar que metadata no contenga contraseñas
    if (sanitized.metadata) {
      const cleaned = { ...sanitized.metadata };
      ['password', 'token', 'secret', 'key'].forEach((key) => {
        if (key in cleaned) {
          cleaned[key] = '***REDACTED***';
        }
      });
      sanitized.metadata = cleaned;
    }

    return sanitized;
  }

  /**
   * Imprimir formato legible para desarrollo
   */
  private prettyPrint(event: SecurityEvent): void {
    const color = this.getLevelColor(event.level);
    const emoji = this.getLevelEmoji(event.level);

    console.log(`${color}${emoji} [${event.level}] ${event.event_type}\x1b[0m`);
    console.log(`  Action: ${event.action}`);
    console.log(`  Result: ${event.result}`);
    if (event.user_id) console.log(`  User: ${event.user_id}`);
    if (event.resource) console.log(`  Resource: ${event.resource}`);
    console.log(`  Message: ${event.message}`);
    if (event.metadata) {
      console.log(`  Metadata:`, event.metadata);
    }
  }

  private getLevelColor(level: SecurityEventLevel): string {
    switch (level) {
      case SecurityEventLevel.INFO:
        return '\x1b[32m'; // Verde
      case SecurityEventLevel.WARN:
        return '\x1b[33m'; // Amarillo
      case SecurityEventLevel.ERROR:
        return '\x1b[31m'; // Rojo
      case SecurityEventLevel.CRITICAL:
        return '\x1b[35m'; // Magenta
      default:
        return '\x1b[0m';
    }
  }

  private getLevelEmoji(level: SecurityEventLevel): string {
    switch (level) {
      case SecurityEventLevel.INFO:
        return '✓';
      case SecurityEventLevel.WARN:
        return '⚠';
      case SecurityEventLevel.ERROR:
        return '✗';
      case SecurityEventLevel.CRITICAL:
        return '🚨';
      default:
        return '•';
    }
  }
}
