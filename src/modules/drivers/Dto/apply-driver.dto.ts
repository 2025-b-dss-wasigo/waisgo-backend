/**
 * DTO de entrada/salida para drivers.
 */

import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

export class ApplyDriverDto {
  @ApiProperty({
    description: 'Email de PayPal para recibir pagos',
    example: 'driver@paypal.com',
    maxLength: 254,
  })
  @IsEmail({}, { message: ErrorMessages.DRIVER.INVALID_PAYPAL })
  @IsNotEmpty({
    message: ErrorMessages.VALIDATION.REQUIRED_FIELD('paypalEmail'),
  })
  @MaxLength(254, { message: ErrorMessages.DRIVER.PAYPAL_EMAIL_MAX_LENGTH })
  paypalEmail: string;
}
