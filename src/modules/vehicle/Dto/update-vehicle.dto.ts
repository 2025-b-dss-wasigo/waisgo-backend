import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

/**
 * DTO para actualizar vehículo.
 * NO permite cambiar placa ni reactivar (eso tiene endpoints específicos).
 */
export class UpdateVehicleDto {
  @ApiPropertyOptional({
    description: 'Marca del vehículo',
    example: 'Toyota',
    minLength: 2,
    maxLength: 15,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: ErrorMessages.DRIVER.VEHICLE_BRAND_LENGTH })
  @MaxLength(15, { message: ErrorMessages.DRIVER.VEHICLE_BRAND_LENGTH })
  marca?: string;

  @ApiPropertyOptional({
    description: 'Modelo del vehículo',
    example: 'Corolla',
    minLength: 2,
    maxLength: 15,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: ErrorMessages.DRIVER.VEHICLE_MODEL_LENGTH })
  @MaxLength(15, { message: ErrorMessages.DRIVER.VEHICLE_MODEL_LENGTH })
  modelo?: string;

  @ApiPropertyOptional({
    description: 'Color del vehículo',
    example: 'Blanco',
    minLength: 3,
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: ErrorMessages.DRIVER.VEHICLE_COLOR_LENGTH })
  @MaxLength(10, { message: ErrorMessages.DRIVER.VEHICLE_COLOR_LENGTH })
  color?: string;

  @ApiPropertyOptional({
    description: 'Número de asientos disponibles',
    example: 4,
    minimum: 1,
    maximum: 6,
  })
  @IsOptional()
  @IsInt()
  @Min(1, { message: ErrorMessages.DRIVER.SEATS_RANGE })
  @Max(6, { message: ErrorMessages.DRIVER.SEATS_RANGE })
  asientosDisponibles?: number;
}
