/**
 * DTO para actualizar fecha/hora de salida de una ruta.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

export class UpdateRouteScheduleDto {
  @ApiPropertyOptional({
    description: 'Nueva fecha de la ruta (YYYY-MM-DD)',
    example: '2026-01-20',
  })
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @ApiPropertyOptional({
    description: 'Nueva hora de salida (HH:mm)',
    example: '14:30',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: ErrorMessages.VALIDATION.INVALID_FORMAT('horaSalida'),
  })
  horaSalida?: string;
}
