/**
 * DTO de entrada/salida para payments.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CapturePaypalDto {
  @ApiProperty({
    description: 'ID de la orden de PayPal para capturar',
    example: '5O190127TN364715T',
  })
  @IsString()
  @IsNotEmpty()
  paypalOrderId: string;
}
