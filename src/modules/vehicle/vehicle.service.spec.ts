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
import * as publicIdUtil from '../common/utils/public-id.util';

describe('VehicleService', () => {
  const vehicleRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const driverRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const auditService = {
    logEvent: jest.fn(),
  };
  const businessService = {
    updateAlias: jest.fn(),
  };

  const context: AuthContext = { ip: '127.0.0.1', userAgent: 'jest' };

  let service: VehicleService;

  beforeEach(() => {
    jest.clearAllMocks();
    driverRepo.save.mockResolvedValue({});
    businessService.updateAlias.mockResolvedValue(undefined);
    service = new VehicleService(
      vehicleRepo as never,
      driverRepo as never,
      auditService as never,
      businessService as never,
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

  it('creates a vehicle when data is valid', async () => {
    driverRepo.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    vehicleRepo.findOne.mockResolvedValue(null);
    vehicleRepo.create.mockImplementation((input) => ({ ...input }));
    vehicleRepo.save.mockResolvedValue({ id: 'vehicle-id' });

    const idSpy = jest
      .spyOn(publicIdUtil, 'generatePublicId')
      .mockResolvedValue('VEH_123');

    const response = await service.create(
      'user-id',
      {
        marca: 'Marca',
        modelo: 'Modelo',
        color: 'Color',
        placa: 'abc1234',
        asientosDisponibles: 4,
      },
      context,
    );

    expect(response.message).toBe(ErrorMessages.DRIVER.VEHICLE_CREATED);
    expect(vehicleRepo.save).toHaveBeenCalled();

    idSpy.mockRestore();
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

  it('updates a vehicle with valid data', async () => {
    driverRepo.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    const vehicle = {
      id: 'vehicle-id',
      marca: 'M',
      modelo: 'X',
      color: 'Blue',
      asientosDisponibles: 2,
    };
    vehicleRepo.findOne.mockResolvedValue(vehicle);
    vehicleRepo.save.mockResolvedValue(vehicle);

    const response = await service.update(
      'user-id',
      'VEH_123',
      { color: 'Red', asientosDisponibles: 4 },
      context,
    );

    expect(response.message).toBe(ErrorMessages.DRIVER.VEHICLE_UPDATED);
    expect(vehicle.color).toBe('Red');
    expect(vehicle.asientosDisponibles).toBe(4);
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

  it('reactivates a vehicle when within window', async () => {
    driverRepo.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    const vehicle = {
      id: 'vehicle-id',
      isActivo: false,
      updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    };
    vehicleRepo.findOne.mockResolvedValue(vehicle);
    vehicleRepo.save.mockResolvedValue(vehicle);

    const response = await service.reactivate('user-id', 'VEH_123', context);

    expect(response.message).toBe(ErrorMessages.DRIVER.VEHICLE_REACTIVATED);
    expect(vehicle.isActivo).toBe(true);
  });

  it('returns vehicle by id', async () => {
    vehicleRepo.findOne.mockResolvedValue({ id: 'vehicle-id' });

    const result = await service.getById('VEH_123');

    expect(result).toEqual({ id: 'vehicle-id' });
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
