/**
 * Utilidades del modulo common.
 */

import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../types';
import { ErrorMessages } from '../constants/error-messages.constant';
import { isValidIdentifier } from './public-id.util';
import { getClientIp } from './request-ip.util';

export const buildAuthContext = (req: Request): AuthContext => {
  const ip = getClientIp(req);

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
