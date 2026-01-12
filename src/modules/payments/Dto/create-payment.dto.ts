/**
 * DTO de entrada/salida para payments.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { MetodoPagoEnum } from '../Enums/metodo-pago.enum';
import { ErrorMessages } from '../../common/constants/error-messages.constant';
import { IsExternalIdentifier } from '../../common/validators/external-id.validator';

export class CreatePaymentDto {
  @ApiProperty({
    description: 'ID de la reserva asociada',
    example: 'BKG_ABCDEFGH',
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsExternalIdentifier({
    message: ErrorMessages.VALIDATION.INVALID_FORMAT('bookingId'),
  })
  bookingId: string;

  @ApiProperty({
    description: 'Método de pago',
    enum: MetodoPagoEnum,
    example: MetodoPagoEnum.PAYPAL,
  })
  @IsEnum(MetodoPagoEnum, {
    message: ErrorMessages.PAYMENTS.INVALID_PAYMENT_METHOD,
  })
  method: MetodoPagoEnum;
}
