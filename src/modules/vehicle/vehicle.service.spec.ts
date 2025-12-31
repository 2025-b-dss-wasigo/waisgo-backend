import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { VehicleService } from './vehicle.service';
import { EstadoConductorEnum } from '../drivers/Enums/estado-conductor.enum';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';

describe('VehicleService', () => {
  const vehicleRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const driverRepo = {
    findOne: jest.fn(),
  };
  const auditService = {
    logEvent: jest.fn(),
  };

  const context: AuthContext = { ip: '127.0.0.1', userAgent: 'jest' };

  let service: VehicleService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VehicleService(
      vehicleRepo as never,
      driverRepo as never,
      auditService as never,
    );
  });

  it('throws when user is not a driver', async () => {
    driverRepo.findOne.mockResolvedValue(null);

    await expect(
      service.create(
        'user-id',
        {
          marca: 'Marca',
          modelo: 'Modelo',
          color: 'Color',
          placa: 'abc1234',
          asientosDisponibles: 4,
        },
        context,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws when plate already exists', async () => {
    driverRepo.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    vehicleRepo.findOne.mockResolvedValue({ id: 'vehicle-id' });

    await expect(
      service.create(
        'user-id',
        {
          marca: 'Marca',
          modelo: 'Modelo',
          color: 'Color',
          placa: 'abc1234',
          asientosDisponibles: 4,
        },
        context,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('returns empty list when driver does not exist', async () => {
    driverRepo.findOne.mockResolvedValue(null);

    const result = await service.getMyVehicles('user-id');

    expect(result).toEqual([]);
  });

  it('throws when update vehicle not found', async () => {
    driverRepo.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    vehicleRepo.findOne.mockResolvedValue(null);

    await expect(
      service.update(
        'user-id',
        'VEH_123',
        { color: 'Rojo' },
        context,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws when reactivating an already active vehicle', async () => {
    driverRepo.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    vehicleRepo.findOne.mockResolvedValue({
      id: 'vehicle-id',
      isActivo: true,
    });

    await expect(
      service.reactivate('user-id', 'VEH_123', context),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when reactivation window expired', async () => {
    driverRepo.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    vehicleRepo.findOne.mockResolvedValue({
      id: 'vehicle-id',
      isActivo: false,
      updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    });

    await expect(
      service.reactivate('user-id', 'VEH_123', context),
    ).rejects.toThrow(
      ErrorMessages.DRIVER.VEHICLE_REACTIVATION_EXPIRED,
    );
  });

  it('disables a vehicle', async () => {
    driverRepo.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    const vehicle = { id: 'vehicle-id', isActivo: true };
    vehicleRepo.findOne.mockResolvedValue(vehicle);
    vehicleRepo.save.mockResolvedValue(vehicle);

    const response = await service.disable('user-id', 'VEH_123', context);

    expect(response).toEqual({
      message: ErrorMessages.DRIVER.VEHICLE_DISABLED,
    });
    expect(vehicle.isActivo).toBe(false);
  });
});
