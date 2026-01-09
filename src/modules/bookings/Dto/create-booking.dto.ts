/**
 * DTO de entrada/salida para bookings.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { MetodoPagoEnum } from '../../payments/Enums/metodo-pago.enum';
import { ErrorMessages } from '../../common/constants/error-messages.constant';
import { IsExternalIdentifier } from '../../common/validators/external-id.validator';

export class CreateBookingDto {
  @ApiProperty({
    description: 'ID de la ruta a reservar',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsExternalIdentifier({
    message: ErrorMessages.VALIDATION.INVALID_FORMAT('routeId'),
  })
  routeId: string;

  @ApiProperty({
    description: 'Método de pago seleccionado',
    enum: MetodoPagoEnum,
    example: MetodoPagoEnum.PAYPAL,
  })
  @IsEnum(MetodoPagoEnum)
  metodoPago: MetodoPagoEnum;

  @ApiPropertyOptional({
    description:
      'Latitud del punto de recogida (si aplica stop intermedio) - Quito',
    example: -0.2102,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  pickupLat?: number;

  @ApiPropertyOptional({
    description:
      'Longitud del punto de recogida (si aplica stop intermedio) - Quito',
    example: -78.4896,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  pickupLng?: number;

  @ApiPropertyOptional({
    description: 'Dirección del punto de recogida',
    example: 'Av. 10 de Agosto 123, Quito',
  })
  @IsOptional()
  pickupDireccion?: string;
}
