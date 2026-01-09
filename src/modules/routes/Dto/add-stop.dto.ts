/**
 * DTO de entrada/salida para routes.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min, Max, MaxLength } from 'class-validator';

export class AddStopDto {
  @ApiProperty({
    description: 'Latitud del nuevo punto (Quito: -0.18 a -0.35)',
    example: -0.2102,
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({
    description: 'Longitud del nuevo punto (Quito: -78.45 a -78.55)',
    example: -78.4896,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiProperty({
    description: 'Dirección del punto',
    example: 'Av. 6 de Diciembre y Orellana, Quito',
  })
  @IsString()
  @MaxLength(255)
  direccion: string;
}
