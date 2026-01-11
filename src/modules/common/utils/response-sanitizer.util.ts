/**
 * Utilidades del modulo common.
 */

import { isPublicId, isUuid } from './public-id.util';

const RELATION_KEY_MAP: Record<string, string> = {
  routeId: 'route',
  driverId: 'driver',
  passengerId: 'passenger',
  bookingId: 'booking',
  payoutId: 'payout',
  paymentId: 'payment',
  vehicleId: 'vehicle',
  documentId: 'document',
  stopId: 'stop',
  pickupStopId: 'pickupStop',
  userId: 'user',
  fromUserId: 'fromUser',
  toUserId: 'toUser',
};

const ALLOWED_UUID_KEYS = new Set([
  'paypalOrderId',
  'paypalCaptureId',
  'paypalBatchId',
]);

const USER_REFERENCE_KEYS = new Set([
  'userId',
  'passengerId',
  'fromUserId',
  'toUserId',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  if (value instanceof Date) {
    return false;
  }
  if (Buffer.isBuffer(value)) {
    return false;
  }
  return true;
};

const getExternalIdFromRelation = (
  relation: Record<string, unknown>,
  preferAlias: boolean,
): string | undefined => {
  const alias = relation.alias;
  if (preferAlias && typeof alias === 'string' && alias.trim().length > 0) {
    return alias;
  }

  const publicId = relation.publicId;
  if (typeof publicId === 'string' && publicId.trim().length > 0) {
    return publicId;
  }

  if (!preferAlias && typeof alias === 'string' && alias.trim().length > 0) {
    return alias;
  }

  const id = relation.id;
  if (typeof id === 'string' && !isUuid(id)) {
    return id;
  }

  return undefined;
};

type SanitizedField = {
  skip?: boolean;
  value?: unknown;
} | null;

const handleIdField = (
  key: string,
  value: unknown,
  hasPublicId: boolean,
  seen: WeakSet<object>,
): SanitizedField => {
  if (key !== 'id') {
    return null;
  }
  if (hasPublicId) {
    return { skip: true };
  }
  if (typeof value === 'string' && isUuid(value)) {
    return { skip: true };
  }
  return { value: sanitizeResponseData(value, seen) };
};

const handlePublicIdField = (key: string, value: unknown): SanitizedField => {
  if (key !== 'publicId') {
    return null;
  }
  return { value };
};

const handleRelationField = (
  key: string,
  value: unknown,
  obj: Record<string, unknown>,
): SanitizedField => {
  const relationKey = RELATION_KEY_MAP[key];
  if (!relationKey) {
    return null;
  }

  if (typeof value === 'string' && isUuid(value)) {
    const relationValue = obj[relationKey];
    if (isPlainObject(relationValue)) {
      const externalId = getExternalIdFromRelation(
        relationValue,
        USER_REFERENCE_KEYS.has(key),
      );
      if (externalId) {
        return { value: externalId };
      }
    }

    if (key.endsWith('Id') && !ALLOWED_UUID_KEYS.has(key)) {
      return { skip: true };
    }
  }

  if (typeof value === 'string' && isPublicId(value)) {
    return { value };
  }

  return null;
};

const resolveField = (
  key: string,
  value: unknown,
  obj: Record<string, unknown>,
  hasPublicId: boolean,
  seen: WeakSet<object>,
): SanitizedField =>
  handleIdField(key, value, hasPublicId, seen) ??
  handlePublicIdField(key, value) ??
  handleRelationField(key, value, obj);

const sanitizePlainObject = (
  obj: Record<string, unknown>,
  seen: WeakSet<object>,
): Record<string, unknown> => {
  const hasPublicId = typeof obj.publicId === 'string';
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const resolved = resolveField(key, value, obj, hasPublicId, seen);
    if (!resolved) {
      sanitized[key] = sanitizeResponseData(value, seen);
      continue;
    }
    if (!resolved.skip) {
      sanitized[key] = resolved.value;
    }
  }

  return sanitized;
};

export function sanitizeResponseData(
  input: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeResponseData(item, seen));
  }

  if (!isPlainObject(input)) {
    return input;
  }

  if (seen.has(input)) {
    return undefined;
  }
  seen.add(input);

  return sanitizePlainObject(input, seen);
}
