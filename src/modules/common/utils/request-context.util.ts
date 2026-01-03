import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../types';
import { ErrorMessages } from '../constants/error-messages.constant';
import { isValidIdentifier } from './public-id.util';

export const buildAuthContext = (req: Request): AuthContext => {
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '';
  const ip =
    forwardedIp || req.ip || req.socket?.remoteAddress || 'unknown';

  return {
    ip,
    userAgent: req.headers['user-agent'] || 'unknown',
  };
};

export const validateIdentifier = (value: string, field = 'id'): string => {
  if (!isValidIdentifier(value)) {
    throw new BadRequestException(
      ErrorMessages.VALIDATION.INVALID_FORMAT(field),
    );
  }
  return value;
};
