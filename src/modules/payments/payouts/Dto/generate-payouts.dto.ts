/**
 * DTO de entrada/salida para payments.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { ErrorMessages } from '../../../common/constants/error-messages.constant';

export class GeneratePayoutsDto {
  @ApiProperty({
    description: 'Periodo para generar payouts (formato YYYY-MM)',
    example: '2025-01',
  })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: ErrorMessages.PAYOUTS.INVALID_PERIOD,
  })
  period: string;
}
