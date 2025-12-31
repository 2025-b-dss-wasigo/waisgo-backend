import { haversineDistance, planStopInsertion } from './route-stop.util';

describe('route-stop utils', () => {
  it('returns zero distance for identical coordinates', () => {
    expect(haversineDistance(0, 0, 0, 0)).toBe(0);
  });

  it('plans insertion when there are no stops', () => {
    const result = planStopInsertion([], 0, 0);
    expect(result).toEqual({ newOrder: 1, updates: [] });
  });

  it('plans insertion after a single stop', () => {
    const stops = [{ lat: 0, lng: 0, orden: 1 }];
    const result = planStopInsertion(stops, 1, 1);
    expect(result.newOrder).toBe(2);
    expect(result.updates).toEqual([]);
  });

  it('inserts between two stops and shifts order', () => {
    const stops = [
      { lat: 0, lng: 0, orden: 1 },
      { lat: 0, lng: 10, orden: 2 },
    ];
    const result = planStopInsertion(stops, 0, 5);
    expect(result.newOrder).toBe(2);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].orden).toBe(3);
  });
});
