/**
 * DTO de entrada/salida para admin.
 */

import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

export class RejectDriverDto {
  @ApiProperty({
    description: 'Motivo del rechazo',
    example: 'Documentos ilegibles o incompletos',
    minLength: 10,
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty({ message: ErrorMessages.ADMIN.REJECTION_REASON_REQUIRED })
  @MinLength(10, { message: ErrorMessages.ADMIN.REJECTION_REASON_MIN_LENGTH })
  @MaxLength(500, { message: ErrorMessages.ADMIN.REJECTION_REASON_MAX_LENGTH })
  motivo: string;
}
