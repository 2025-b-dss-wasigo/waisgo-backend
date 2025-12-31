import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { EstadoRutaEnum } from './Enums';
import { EstadoConductorEnum } from '../drivers/Enums/estado-conductor.enum';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';
import * as publicIdUtil from '../common/utils/public-id.util';

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

    await expect(
      service.getMyRoutes('user-id', 'INVALID'),
    ).rejects.toThrow(
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
          origen: 'CAMPUS_PRINCIPAL',
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
        origen: 'CAMPUS_PRINCIPAL',
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
          origen: 'CAMPUS_PRINCIPAL',
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
});
