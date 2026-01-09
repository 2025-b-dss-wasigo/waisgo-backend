/**
 * Archivo de soporte del modulo.
 */

import { registerDecorator, ValidationOptions } from 'class-validator';
import { isUuid, isValidIdentifier } from '../utils/public-id.util';

export function IsExternalIdentifier(
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'IsExternalIdentifier',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isValidIdentifier(value);
        },
      },
    });
  };
}

export function IsUserIdentifier(
  validationOptions?: ValidationOptions,
  maxAliasLength = 25,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'IsUserIdentifier',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') {
            return false;
          }
          if (isValidIdentifier(value)) {
            return true;
          }
          if (isUuid(value)) {
            return false;
          }
          const trimmed = value.trim();
          return trimmed.length > 0 && trimmed.length <= maxAliasLength;
        },
      },
    });
  };
}
