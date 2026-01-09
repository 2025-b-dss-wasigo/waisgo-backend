/**
 * DTO de entrada/salida para ratings.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ErrorMessages } from '../../common/constants/error-messages.constant';
import {
  IsExternalIdentifier,
  IsUserIdentifier,
} from '../../common/validators/external-id.validator';

export class CreateRatingDto {
  @ApiProperty({
    description: 'ID de la ruta donde se realizó el viaje',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsExternalIdentifier({
    message: ErrorMessages.VALIDATION.INVALID_FORMAT('routeId'),
  })
  routeId: string;

  @ApiProperty({
    description: 'ID del usuario a calificar',
    example: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsUserIdentifier({
    message: ErrorMessages.VALIDATION.INVALID_FORMAT('toUserId'),
  })
  toUserId: string;

  @ApiProperty({
    description: 'Puntuación (1-5 estrellas)',
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1, { message: ErrorMessages.RATINGS.INVALID_RATING })
  @Max(5, { message: ErrorMessages.RATINGS.INVALID_RATING })
  score: number;

  @ApiPropertyOptional({
    description: 'Comentario opcional',
    example: 'Excelente conductor, muy puntual',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
