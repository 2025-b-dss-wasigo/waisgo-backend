import {
  IsOptional,
  IsString,
  Length,
  Matches,
  IsEmail,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Nuevo nombre del usuario (solo letras y espacios)',
    example: 'Juan Carlos',
    minLength: 3,
    maxLength: 15,
  })
  @IsOptional()
  @IsString()
  @Length(3, 15, { message: ErrorMessages.VALIDATION.NAME_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/, {
    message: ErrorMessages.VALIDATION.NAME_LETTERS_ONLY,
  })
  nombre?: string;

  @ApiPropertyOptional({
    description: 'Nuevo apellido del usuario (solo letras y espacios)',
    example: 'Pérez García',
    minLength: 3,
    maxLength: 15,
  })
  @IsOptional()
  @IsString()
  @Length(3, 15, { message: ErrorMessages.VALIDATION.LASTNAME_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/, {
    message: ErrorMessages.VALIDATION.LASTNAME_LETTERS_ONLY,
  })
  apellido?: string;

  @ApiPropertyOptional({
    description: 'Nuevo número de celular ecuatoriano (formato: 09XXXXXXXX)',
    example: '0987654321',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^09\d{8}$/, {
    message: ErrorMessages.VALIDATION.PHONE_FORMAT,
  })
  celular?: string;

  @ApiPropertyOptional({
    description: 'Correo institucional (solo se puede cambiar antes de verificar)',
    example: 'nuevo.usuario@epn.edu.ec',
    maxLength: 30,
  })
  @IsOptional()
  @IsEmail({}, { message: ErrorMessages.VALIDATION.INVALID_FORMAT('email') })
  @MaxLength(30, { message: ErrorMessages.VALIDATION.EMAIL_MAX_LENGTH })
  @Matches(/^[\w.+-]+@epn\.edu\.ec$/, {
    message: ErrorMessages.AUTH.INVALID_EMAIL_DOMAIN,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email?: string;
}
