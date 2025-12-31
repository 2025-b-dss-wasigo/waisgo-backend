import { getDepartureDate } from './route-time.util';

describe('route-time utils', () => {
  it('returns null when route is missing', () => {
    expect(getDepartureDate()).toBeNull();
  });

  it('returns null when schedule is incomplete', () => {
    expect(getDepartureDate({ fecha: '2025-01-02' })).toBeNull();
    expect(getDepartureDate({ horaSalida: '08:30' })).toBeNull();
  });

  it('returns null for invalid date', () => {
    expect(
      getDepartureDate({ fecha: 'invalid', horaSalida: '08:30' }),
    ).toBeNull();
  });

  it('builds a date when hour is in HH:MM format', () => {
    const result = getDepartureDate({
      fecha: '2025-01-02',
      horaSalida: '08:30',
    });
    const expected = new Date('2025-01-02T08:30:00');
    expect(result?.getTime()).toBe(expected.getTime());
  });

  it('keeps seconds when hour includes them', () => {
    const result = getDepartureDate({
      fecha: '2025-01-02',
      horaSalida: '08:30:15',
    });
    const expected = new Date('2025-01-02T08:30:15');
    expect(result?.getTime()).toBe(expected.getTime());
  });
});
