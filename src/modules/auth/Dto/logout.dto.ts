/**
 * DTO de entrada/salida para auth.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Token de actualización para revocar (opcional)',
    example: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0...',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
