/**
 * DTO para solicitar payout.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ErrorMessages } from '../../../common/constants/error-messages.constant';

export class RequestPayoutDto {
  @ApiProperty({
    description: 'Monto a retirar (minimo 5 USD)',
    example: 10,
  })
  @IsNumber()
  @Min(5, { message: ErrorMessages.PAYOUTS.PAYOUT_AMOUNT_TOO_LOW })
  @Type(() => Number)
  amount: number;
}
