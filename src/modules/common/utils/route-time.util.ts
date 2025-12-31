type RouteSchedule = {
  fecha?: string | null;
  horaSalida?: string | null;
};

export const getDepartureDate = (
  route?: RouteSchedule | null,
): Date | null => {
  if (!route?.fecha || !route?.horaSalida) {
    return null;
  }
  const time =
    route.horaSalida.length === 5
      ? `${route.horaSalida}:00`
      : route.horaSalida;
  const departure = new Date(`${route.fecha}T${time}`);
  if (Number.isNaN(departure.getTime())) {
    return null;
  }
  return departure;
};
