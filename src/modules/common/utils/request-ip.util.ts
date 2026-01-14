/**
 * IP resolution helper shared across the backend.
 */

import type { Request } from 'express';

export function getClientIp(req?: Request | null): string {
  if (!req) {
    return 'unknown';
  }

  const xff = req.headers['x-forwarded-for'];

  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }

  return req.ip || 'unknown';
}
