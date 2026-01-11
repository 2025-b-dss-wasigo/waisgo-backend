/**
 * Utilidades para polilineas y distancias a ruta.
 */

type LatLng = {
  lat: number;
  lng: number;
};

const EARTH_RADIUS_METERS = 6371000;

const toRad = (deg: number): number => deg * (Math.PI / 180);

const haversineMeters = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

const projectPoint = (lat: number, lng: number, lat0Rad: number) => ({
  x: EARTH_RADIUS_METERS * toRad(lng) * Math.cos(lat0Rad),
  y: EARTH_RADIUS_METERS * toRad(lat),
});

const distancePointToSegmentMeters = (
  point: LatLng,
  start: LatLng,
  end: LatLng,
): number => {
  const lat0 = toRad((point.lat + start.lat + end.lat) / 3);
  const p = projectPoint(point.lat, point.lng, lat0);
  const a = projectPoint(start.lat, start.lng, lat0);
  const b = projectPoint(end.lat, end.lng, lat0);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq),
  );
  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;
  return Math.hypot(p.x - closestX, p.y - closestY);
};

export const decodePolyline = (encoded: string): LatLng[] => {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const points: LatLng[] = [];

  while (index < len) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
};

export const distancePointToPolylinePointsKm = (
  lat: number,
  lng: number,
  points: LatLng[],
): number => {
  if (points.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (points.length === 1) {
    return haversineMeters(lat, lng, points[0].lat, points[0].lng) / 1000;
  }

  const point = { lat, lng };
  let minMeters = Number.POSITIVE_INFINITY;

  for (let i = 0; i < points.length - 1; i += 1) {
    const segmentDistance = distancePointToSegmentMeters(
      point,
      points[i],
      points[i + 1],
    );
    if (segmentDistance < minMeters) {
      minMeters = segmentDistance;
    }
  }

  return minMeters / 1000;
};

export const distancePointToPolylineKm = (
  lat: number,
  lng: number,
  encoded: string,
): number => {
  if (!encoded) {
    return Number.POSITIVE_INFINITY;
  }
  const points = decodePolyline(encoded);
  return distancePointToPolylinePointsKm(lat, lng, points);
};
