import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { EstadoRutaEnum } from './Enums';
import { EstadoConductorEnum } from '../drivers/Enums/estado-conductor.enum';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';
import * as publicIdUtil from '../common/utils/public-id.util';
import * as routeStopUtil from '../common/utils/route-stop.util';
import * as routeTimeUtil from '../common/utils/route-time.util';
import { EstadoPagoEnum } from '../payments/Enums';
import { CampusOrigenEnum } from './Enums/campus-origen.enum';

describe('RoutesService', () => {
  const routeRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const routeStopRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const driverRepository = {
    findOne: jest.fn(),
  };
  const vehicleRepository = {
    findOne: jest.fn(),
  };
  const profileRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const bookingRepository = {
    count: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
  };
  const paymentRepository = {
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
  };
  const paymentsService = {
    reversePayment: jest.fn(),
  };
  const auditService = {
    logEvent: jest.fn(),
  };

  const context: AuthContext = { ip: '127.0.0.1', userAgent: 'jest' };

  let service: RoutesService;

  beforeEach(() => {
    jest.clearAllMocks();
    profileRepository.save.mockResolvedValue({});
    service = new RoutesService(
      routeRepository as never,
      routeStopRepository as never,
      driverRepository as never,
      vehicleRepository as never,
      profileRepository as never,
      bookingRepository as never,
      paymentRepository as never,
      paymentsService as never,
      auditService as never,
    );
  });

  it('throws when driver does not exist in getMyRoutes', async () => {
    driverRepository.findOne.mockResolvedValue(null);

    await expect(service.getMyRoutes('user-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws when estado is invalid in getMyRoutes', async () => {
    driverRepository.findOne.mockResolvedValue({ id: 'driver-id' });

    await expect(service.getMyRoutes('user-id', 'INVALID')).rejects.toThrow(
      ErrorMessages.VALIDATION.INVALID_FORMAT('estado'),
    );
  });

  it('filters available routes by distance', async () => {
    routeRepository.find.mockResolvedValue([
      {
        id: 'route-1',
        stops: [{ lat: 0, lng: 0 }],
      },
      {
        id: 'route-2',
        stops: [{ lat: 10, lng: 10 }],
      },
    ]);

    const result = await service.getAvailableRoutes({
      lat: 0,
      lng: 0,
      radiusKm: 1,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data?.[0].id).toBe('route-1');
  });

  it('rejects route creation when no active vehicle', async () => {
    driverRepository.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    profileRepository.findOne.mockResolvedValue({
      isBloqueadoPorRating: false,
      ratingPromedio: 5,
    });
    vehicleRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createRoute(
        'user-id',
        {
          origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
          fecha: '2025-01-01',
          horaSalida: '10:00',
          destinoBase: 'Destino',
          asientosTotales: 2,
          precioPasajero: 1,
          stops: [{ lat: 0, lng: 0, direccion: 'A' }],
        },
        context,
      ),
    ).rejects.toThrow(ErrorMessages.ROUTES.NO_ACTIVE_VEHICLE);
  });

  it('creates a route when data is valid', async () => {
    driverRepository.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    profileRepository.findOne.mockResolvedValue({
      isBloqueadoPorRating: false,
      ratingPromedio: 5,
    });
    vehicleRepository.findOne.mockResolvedValue({
      id: 'vehicle-id',
      asientosDisponibles: 4,
    });

    routeStopRepository.create.mockImplementation((input) => ({ ...input }));
    routeRepository.create.mockImplementation((input) => ({ ...input }));
    routeRepository.save.mockResolvedValue({
      id: 'route-id',
      publicId: 'RTE_123',
    });

    const publicIdSpy = jest
      .spyOn(publicIdUtil, 'generatePublicId')
      .mockResolvedValueOnce('STP_1')
      .mockResolvedValueOnce('RTE_123');

    const response = await service.createRoute(
      'user-id',
      {
        origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
        fecha: '2025-01-01',
        horaSalida: '10:00',
        destinoBase: 'Destino',
        asientosTotales: 2,
        precioPasajero: 1,
        stops: [{ lat: 0, lng: 0, direccion: 'A' }],
      },
      context,
    );

    expect(response).toEqual({
      message: ErrorMessages.ROUTES.ROUTE_CREATED,
      routeId: 'RTE_123',
    });

    publicIdSpy.mockRestore();
  });

  it('throws when driver is not approved', async () => {
    driverRepository.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.PENDIENTE,
    });

    await expect(
      service.createRoute(
        'user-id',
        {
          origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
          fecha: '2025-01-01',
          horaSalida: '10:00',
          destinoBase: 'Destino',
          asientosTotales: 2,
          precioPasajero: 1,
          stops: [{ lat: 0, lng: 0, direccion: 'A' }],
        },
        context,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('getRouteById rejects access when user is not driver or passenger', async () => {
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.CANCELADA,
      driver: { userId: 'driver-user' },
    });
    bookingRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getRouteById('passenger-id', 'RTE_123'),
    ).rejects.toThrow(ErrorMessages.ROUTES.ROUTE_NOT_FOUND);
  });

  it('getRouteMap returns stops for active routes', async () => {
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.ACTIVA,
      driver: { userId: 'driver-user' },
    });
    bookingRepository.findOne.mockResolvedValue({ id: 'booking-id' });
    routeStopRepository.find.mockResolvedValue([{ id: 'stop-1', orden: 1 }]);

    const result = await service.getRouteMap('user-id', 'RTE_123');

    expect(result).toEqual({
      message: ErrorMessages.ROUTES.ROUTE_MAP,
      stops: [{ id: 'stop-1', orden: 1 }],
    });
  });

  it('adds a new route stop and updates ordering', async () => {
    driverRepository.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.ACTIVA,
      stops: [
        { id: 's1', orden: 1, lat: 0, lng: 0 },
        { id: 's2', orden: 2, lat: 1, lng: 1 },
      ],
    });
    routeStopRepository.create.mockImplementation((input) => ({ ...input }));

    const planSpy = jest
      .spyOn(routeStopUtil, 'planStopInsertion')
      .mockReturnValue({
        newOrder: 2,
        updates: [{ orden: 3, lat: 1, lng: 1 }],
      });
    const idSpy = jest
      .spyOn(publicIdUtil, 'generatePublicId')
      .mockResolvedValue('STP_123');

    const result = await service.addRouteStop(
      'user-id',
      'RTE_123',
      { lat: 1, lng: 2, direccion: 'Calle 1' },
      context,
    );

    expect(result).toEqual({ message: ErrorMessages.ROUTES.ROUTE_STOP_ADDED });
    expect(routeStopRepository.save).toHaveBeenCalledTimes(2);

    planSpy.mockRestore();
    idSpy.mockRestore();
  });

  it('cancels route and marks payments failed when refunds fail', async () => {
    driverRepository.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.ACTIVA,
      fecha: '2030-01-01',
      horaSalida: '10:00',
    });

    profileRepository.findOne.mockResolvedValue({
      ratingPromedio: 5,
      isBloqueadoPorRating: false,
    });

    const departureSpy = jest
      .spyOn(routeTimeUtil, 'getDepartureDate')
      .mockReturnValue(new Date(Date.now() + 30 * 60 * 1000));

    const payments = [
      { id: 'pay-1', status: EstadoPagoEnum.PAID, failureReason: null },
      { id: 'pay-2', status: EstadoPagoEnum.PENDING, failureReason: null },
    ];
    const paymentsQuery = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(payments),
    };
    paymentRepository.createQueryBuilder.mockReturnValue(paymentsQuery);
    paymentsService.reversePayment.mockRejectedValue(
      new Error('refund failed'),
    );
    paymentRepository.save.mockResolvedValue({});

    await service.cancelRoute('user-id', 'RTE_123', context);

    expect(payments[0].status).toBe(EstadoPagoEnum.FAILED);
    expect(payments[0].failureReason).toBe('Refund failed after route cancel');
    expect(payments[1].status).toBe(EstadoPagoEnum.FAILED);
    expect(payments[1].failureReason).toBe('Route cancelled');
    expect(profileRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ ratingPromedio: 4 }),
    );

    departureSpy.mockRestore();
  });

  it('finalizeRoute rejects when there are pending bookings', async () => {
    driverRepository.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.ACTIVA,
    });
    bookingRepository.find.mockResolvedValue([{ id: 'booking-1' }]);

    await expect(
      service.finalizeRoute('user-id', 'RTE_123', context),
    ).rejects.toThrow(ErrorMessages.ROUTES.ROUTE_NOT_FINISHED);
  });
});
