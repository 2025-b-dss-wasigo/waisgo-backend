/**
 * Utilidades del modulo common.
 */

import { randomBytes } from 'node:crypto';
import type { FindOptionsWhere, Repository } from 'typeorm';

const PUBLIC_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PUBLIC_ID_LENGTH = 8;

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PUBLIC_ID_REGEX = /^[A-Z]{3}_[A-Z0-9]{8}$/i;

const allowUuidIdentifiers = (): boolean => {
  const raw = process.env.ALLOW_UUID_IDENTIFIERS;
  if (raw === undefined || raw === null) {
    return true;
  }
  const normalized = String(raw).toLowerCase();
  return normalized === 'true' || normalized === '1';
};

export const isUuid = (value: string): boolean => UUID_REGEX.test(value);
export const isPublicId = (value: string): boolean =>
  PUBLIC_ID_REGEX.test(value);

const buildRandomPart = (length = PUBLIC_ID_LENGTH): string => {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += PUBLIC_ID_ALPHABET[bytes[i] % PUBLIC_ID_ALPHABET.length];
  }
  return result;
};

export const isValidIdentifier = (value: string): boolean =>
  allowUuidIdentifiers()
    ? isUuid(value) || isPublicId(value)
    : isPublicId(value);

export const buildIdWhere = <T extends { id: string; publicId: string }>(
  identifier: string,
): FindOptionsWhere<T>[] => {
  const where: FindOptionsWhere<T>[] = [];
  if (allowUuidIdentifiers() && isUuid(identifier)) {
    where.push({ id: identifier } as FindOptionsWhere<T>);
  }
  where.push({ publicId: identifier } as FindOptionsWhere<T>);
  return where;
};

export const generatePublicId = async <T extends { publicId: string }>(
  repo: Repository<T>,
  prefix: string,
  attempts = 5,
): Promise<string> => {
  for (let i = 0; i < attempts; i += 1) {
    const candidate = `${prefix}_${buildRandomPart()}`;
    const exists = await repo.findOne({
      where: { publicId: candidate } as FindOptionsWhere<T>,
    });
    if (!exists) {
      return candidate;
    }
  }

  throw new Error('Unable to generate unique publicId');
};
