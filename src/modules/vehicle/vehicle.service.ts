import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Vehicle } from '../drivers/Models/vehicle.entity';
import { Driver } from '../drivers/Models/driver.entity';
import { EstadoConductorEnum } from '../drivers/Enums/estado-conductor.enum';
import { CreateVehicleDto, UpdateVehicleDto } from './Dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResult } from '../audit/Enums';
import type { AuthContext } from '../common/types';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import { buildIdWhere, generatePublicId } from '../common/utils/public-id.util';
import { BusinessService } from '../business/business.service';

@Injectable()
export class VehicleService {
  private readonly logger = new Logger(VehicleService.name);
  private readonly REACTIVATION_WINDOW_DAYS = 30;

  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    private readonly auditService: AuditService,
    private readonly businessService: BusinessService,
  ) {}

  /**
   * Verifica que el usuario es un conductor aprobado y retorna el driver
   */
  private async getApprovedDriver(userId: string): Promise<Driver> {
    const driver = await this.driverRepo.findOne({
      where: { userId },
    });

    if (!driver) {
      throw new ForbiddenException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

    if (driver.estado !== EstadoConductorEnum.APROBADO) {
      throw new ForbiddenException(ErrorMessages.DRIVER.DRIVER_NOT_APPROVED);
    }

    return driver;
  }

  /**
   * Verifica que el usuario es un conductor (aprobado o pendiente) y retorna el driver.
   * Usado para operaciones que no requieren estado aprobado, como disable.
   */
  private async getActiveDriver(userId: string): Promise<Driver> {
    const driver = await this.driverRepo.findOne({
      where: { userId },
    });

    if (!driver) {
      throw new ForbiddenException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

    const activeStates = [
      EstadoConductorEnum.APROBADO,
      EstadoConductorEnum.PENDIENTE,
    ];
    if (!activeStates.includes(driver.estado)) {
      throw new ForbiddenException(ErrorMessages.DRIVER.DRIVER_NOT_APPROVED);
    }

    return driver;
  }

  /**
   * Crea un nuevo vehículo
   */
  async create(
    userId: string,
    dto: CreateVehicleDto,
    context: AuthContext,
  ): Promise<{ message: string; vehicle: Vehicle }> {
    const driver = await this.getApprovedDriver(userId);

    const normalizedPlaca = dto.placa.toUpperCase();
    const existingPlaca = await this.vehicleRepo.findOne({
      where: { placa: normalizedPlaca },
    });

    if (existingPlaca) {
      throw new ConflictException(ErrorMessages.DRIVER.PLATE_ALREADY_EXISTS);
    }

    const vehicle = this.vehicleRepo.create({
      publicId: await generatePublicId(this.vehicleRepo, 'VEH'),
      driverId: driver.id,
      marca: dto.marca.trim(),
      modelo: dto.modelo.trim(),
      color: dto.color.trim(),
      placa: normalizedPlaca,
      asientosDisponibles: dto.asientosDisponibles,
      isActivo: true,
    });

    const savedVehicle = await this.vehicleRepo.save(vehicle);

    await this.auditService.logEvent({
      action: AuditAction.DRIVER_VEHICLE_UPDATE,
      userId,
      result: AuditResult.SUCCESS,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      metadata: { vehicleId: savedVehicle.id, action: 'create' },
    });

    this.logger.log(
      `Vehicle created: ${savedVehicle.id} for driver ${driver.id}`,
    );

    return {
      message: ErrorMessages.DRIVER.VEHICLE_CREATED,
      vehicle: savedVehicle,
    };
  }

  /**
   * Obtiene los vehículos del conductor
   */
  async getMyVehicles(userId: string): Promise<Vehicle[]> {
    const driver = await this.driverRepo.findOne({
      where: { userId },
    });

    if (!driver) {
      return [];
    }

    return this.vehicleRepo.find({
      where: { driverId: driver.id },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Actualiza un vehículo (solo marca, modelo, color, asientos)
   * Para cambiar placa o reactivar, usar los endpoints específicos.
   */
  async update(
    userId: string,
    vehicleId: string,
    dto: UpdateVehicleDto,
    context: AuthContext,
  ): Promise<{ message: string; vehicle: Vehicle }> {
    const driver = await this.getApprovedDriver(userId);

    const vehicle = await this.vehicleRepo.findOne({
      where: buildIdWhere<Vehicle>(vehicleId).map((where) => ({
        ...where,
        driverId: driver.id,
      })),
    });

    if (!vehicle) {
      throw new NotFoundException(ErrorMessages.DRIVER.VEHICLE_NOT_FOUND);
    }

    if (dto.marca) vehicle.marca = dto.marca.trim();
    if (dto.modelo) vehicle.modelo = dto.modelo.trim();
    if (dto.color) vehicle.color = dto.color.trim();
    if (dto.asientosDisponibles !== undefined) {
      vehicle.asientosDisponibles = dto.asientosDisponibles;
    }

    const updatedVehicle = await this.vehicleRepo.save(vehicle);

    if (driver.estado === EstadoConductorEnum.APROBADO) {
      driver.estado = EstadoConductorEnum.PENDIENTE;
      driver.fechaAprobacion = null;
      await this.driverRepo.save(driver);
      await this.businessService.updateAlias(userId, 'Pasajero');
    }

    await this.auditService.logEvent({
      action: AuditAction.DRIVER_VEHICLE_UPDATE,
      userId,
      result: AuditResult.SUCCESS,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      metadata: {
        vehicleId: updatedVehicle.id,
        action: 'update',
        changes: dto,
      },
    });

    this.logger.log(`Vehicle updated: ${vehicleId}`);

    return {
      message: ErrorMessages.DRIVER.VEHICLE_UPDATED,
      vehicle: updatedVehicle,
    };
  }

  /**
   * Valida si el vehículo puede ser reactivado (dentro de 30 días)
   */
  private async validateReactivation(vehicle: Vehicle): Promise<void> {
    const daysSinceUpdate = Math.floor(
      (Date.now() - vehicle.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceUpdate > this.REACTIVATION_WINDOW_DAYS) {
      throw new BadRequestException(
        ErrorMessages.DRIVER.VEHICLE_REACTIVATION_EXPIRED,
      );
    }
  }

  /**
   * Desactiva un vehículo
   */
  async disable(
    userId: string,
    vehicleId: string,
    context: AuthContext,
  ): Promise<{ message: string }> {
    const driver = await this.getActiveDriver(userId);

    const vehicle = await this.vehicleRepo.findOne({
      where: buildIdWhere<Vehicle>(vehicleId).map((where) => ({
        ...where,
        driverId: driver.id,
      })),
    });

    if (!vehicle) {
      throw new NotFoundException(ErrorMessages.DRIVER.VEHICLE_NOT_FOUND);
    }

    vehicle.isActivo = false;
    await this.vehicleRepo.save(vehicle);

    await this.auditService.logEvent({
      action: AuditAction.DRIVER_VEHICLE_UPDATE,
      userId,
      result: AuditResult.SUCCESS,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      metadata: { vehicleId, action: 'disable' },
    });

    this.logger.log(`Vehicle disabled: ${vehicleId}`);

    return {
      message: ErrorMessages.DRIVER.VEHICLE_DISABLED,
    };
  }

  /**
   * Reactiva un vehículo (endpoint específico)
   */
  async reactivate(
    userId: string,
    vehicleId: string,
    context: AuthContext,
  ): Promise<{ message: string; vehicle: Vehicle }> {
    const driver = await this.getActiveDriver(userId);

    const vehicle = await this.vehicleRepo.findOne({
      where: buildIdWhere<Vehicle>(vehicleId).map((where) => ({
        ...where,
        driverId: driver.id,
      })),
    });

    if (!vehicle) {
      throw new NotFoundException(ErrorMessages.DRIVER.VEHICLE_NOT_FOUND);
    }

    if (vehicle.isActivo) {
      throw new BadRequestException(
        ErrorMessages.DRIVER.VEHICLE_ALREADY_ACTIVE,
      );
    }

    await this.validateReactivation(vehicle);

    vehicle.isActivo = true;
    const savedVehicle = await this.vehicleRepo.save(vehicle);

    await this.auditService.logEvent({
      action: AuditAction.DRIVER_VEHICLE_UPDATE,
      userId,
      result: AuditResult.SUCCESS,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      metadata: { vehicleId, action: 'reactivate' },
    });

    this.logger.log(`Vehicle reactivated: ${vehicleId}`);

    return {
      message: ErrorMessages.DRIVER.VEHICLE_REACTIVATED,
      vehicle: savedVehicle,
    };
  }

  /**
   * Obtiene un vehículo por ID
   */
  async getById(vehicleId: string): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findOne({
      where: buildIdWhere<Vehicle>(vehicleId),
      relations: ['driver'],
    });

    if (!vehicle) {
      throw new NotFoundException(ErrorMessages.DRIVER.VEHICLE_NOT_FOUND);
    }

    return vehicle;
  }
}
