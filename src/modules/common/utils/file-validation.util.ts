/**
 * Utilidades del modulo common.
 */

const SIGNATURES: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/jpg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46, 0x2d]],
};

const matchesSignature = (buffer: Buffer, signature: number[]): boolean => {
  if (buffer.length < signature.length) {
    return false;
  }
  for (let i = 0; i < signature.length; i += 1) {
    if (buffer[i] !== signature[i]) {
      return false;
    }
  }
  return true;
};

export const hasValidFileSignature = (
  buffer: Buffer,
  mimeType: string,
): boolean => {
  const signatures = SIGNATURES[mimeType];
  if (!signatures || signatures.length === 0) {
    return false;
  }
  return signatures.some((signature) => matchesSignature(buffer, signature));
};
