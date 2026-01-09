/**
 * DTO de entrada/salida para bookings.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Código OTP de 6 dígitos',
    example: '123456',
  })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: ErrorMessages.TRIP_OTP.OTP_FORMAT_INVALID })
  otp: string;
}
