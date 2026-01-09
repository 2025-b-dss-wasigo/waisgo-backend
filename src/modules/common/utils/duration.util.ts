/**
 * Utilidades del modulo common.
 */

export const parseDurationToSeconds = (
  value: string | number | undefined,
  fallbackSeconds: number,
): number => {
  if (value === undefined || value === null) {
    return fallbackSeconds;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  const raw = String(value).trim();
  if (!raw) {
    return fallbackSeconds;
  }

  if (/^\d+$/.test(raw)) {
    return Math.max(0, Number(raw));
  }

  const match = /^(\d+)(ms|s|m|h|d)$/i.exec(raw);
  if (!match) {
    return fallbackSeconds;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'ms':
      return Math.max(0, Math.floor(amount / 1000));
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 60 * 60 * 24;
    default:
      return fallbackSeconds;
  }
};
