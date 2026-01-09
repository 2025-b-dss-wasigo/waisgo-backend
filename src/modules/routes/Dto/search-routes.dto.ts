/**
 * DTO de entrada/salida para routes.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, Min, Max, IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchRoutesDto {
  @ApiProperty({
    description: 'Latitud de la ubicación del pasajero (Quito: -0.18 a -0.35)',
    example: -0.2102,
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat: number;

  @ApiProperty({
    description:
      'Longitud de la ubicación del pasajero (Quito: -78.45 a -78.55)',
    example: -78.4896,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng: number;

  @ApiPropertyOptional({
    description: 'Radio de búsqueda en kilómetros (default: 1)',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10)
  @Type(() => Number)
  radiusKm?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por fecha específica',
    example: '2025-01-15',
  })
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
