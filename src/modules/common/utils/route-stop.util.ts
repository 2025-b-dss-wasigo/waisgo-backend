type StopLike = {
  lat: number | string;
  lng: number | string;
  orden: number;
};

const toRad = (deg: number): number => deg * (Math.PI / 180);

export const haversineDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const planStopInsertion = <T extends StopLike>(
  stops: T[],
  lat: number,
  lng: number,
): { newOrder: number; updates: T[] } => {
  let insertIndex = stops.length;

  if (stops.length > 1) {
    let bestExtraDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < stops.length - 1; i += 1) {
      const current = stops[i];
      const next = stops[i + 1];
      const extra =
        haversineDistance(
          Number(current.lat),
          Number(current.lng),
          lat,
          lng,
        ) +
        haversineDistance(
          lat,
          lng,
          Number(next.lat),
          Number(next.lng),
        ) -
        haversineDistance(
          Number(current.lat),
          Number(current.lng),
          Number(next.lat),
          Number(next.lng),
        );

      if (extra < bestExtraDistance) {
        bestExtraDistance = extra;
        insertIndex = i + 1;
      }
    }
  }

  if (stops.length === 1) {
    insertIndex = 1;
  }

  const newOrder = insertIndex + 1;
  const updates = stops
    .filter((stop) => stop.orden >= newOrder)
    .map((stop) => ({ ...stop, orden: stop.orden + 1 }));

  return { newOrder, updates };
};
