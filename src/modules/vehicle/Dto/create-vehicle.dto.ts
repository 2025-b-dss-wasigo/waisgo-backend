import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsInt,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

export class CreateVehicleDto {
  @ApiProperty({
    description: 'Marca del vehículo',
    example: 'Toyota',
    minLength: 2,
    maxLength: 15,
  })
  @IsString()
  @IsNotEmpty({ message: 'La marca es requerida' })
  @MinLength(2, { message: ErrorMessages.DRIVER.VEHICLE_BRAND_LENGTH })
  @MaxLength(15, { message: ErrorMessages.DRIVER.VEHICLE_BRAND_LENGTH })
  marca: string;

  @ApiProperty({
    description: 'Modelo del vehículo',
    example: 'Corolla',
    minLength: 2,
    maxLength: 15,
  })
  @IsString()
  @IsNotEmpty({ message: 'El modelo es requerido' })
  @MinLength(2, { message: ErrorMessages.DRIVER.VEHICLE_MODEL_LENGTH })
  @MaxLength(15, { message: ErrorMessages.DRIVER.VEHICLE_MODEL_LENGTH })
  modelo: string;

  @ApiProperty({
    description: 'Color del vehículo',
    example: 'Blanco',
    minLength: 3,
    maxLength: 10,
  })
  @IsString()
  @IsNotEmpty({ message: 'El color es requerido' })
  @MinLength(3, { message: ErrorMessages.DRIVER.VEHICLE_COLOR_LENGTH })
  @MaxLength(10, { message: ErrorMessages.DRIVER.VEHICLE_COLOR_LENGTH })
  color: string;

  @ApiProperty({
    description: 'Placa del vehículo (3 letras + 4 números)',
    example: 'ABC1234',
  })
  @IsString()
  @IsNotEmpty({ message: 'La placa es requerida' })
  @Matches(/^[A-Z]{3}\d{4}$/, {
    message: ErrorMessages.DRIVER.PLATE_FORMAT,
  })
  placa: string;

  @ApiProperty({
    description: 'Número de asientos disponibles',
    example: 4,
    minimum: 1,
    maximum: 6,
  })
  @IsInt({ message: 'Los asientos deben ser un número entero' })
  @Min(1, { message: ErrorMessages.DRIVER.SEATS_RANGE })
  @Max(6, { message: ErrorMessages.DRIVER.SEATS_RANGE })
  asientosDisponibles: number;
}
