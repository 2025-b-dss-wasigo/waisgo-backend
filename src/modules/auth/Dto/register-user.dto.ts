import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

export class RegisterUserDto {
  @ApiProperty({
    description: 'Correo institucional (debe ser @epn.edu.ec)',
    example: 'juan.perez@epn.edu.ec',
  })
  @IsNotEmpty({ message: ErrorMessages.VALIDATION.REQUIRED_FIELD('email') })
  @IsEmail({}, { message: ErrorMessages.VALIDATION.INVALID_FORMAT('email') })
  @MaxLength(30, { message: ErrorMessages.VALIDATION.EMAIL_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @Matches(/^[\w.+-]+@epn\.edu\.ec$/, {
    message: ErrorMessages.AUTH.INVALID_EMAIL_DOMAIN,
  })
  email: string;

  @ApiProperty({
    description: 'Nombre del usuario (solo letras y espacios)',
    example: 'Juan',
    minLength: 3,
    maxLength: 15,
  })
  @IsNotEmpty({ message: ErrorMessages.VALIDATION.REQUIRED_FIELD('nombre') })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[A-Za-záéíóúÁÉÍÓÚñÑ ]+$/, {
    message: ErrorMessages.VALIDATION.NAME_LETTERS_ONLY,
  })
  @Length(3, 15, { message: ErrorMessages.VALIDATION.NAME_LENGTH })
  nombre: string;

  @ApiProperty({
    description: 'Apellido del usuario (solo letras y espacios)',
    example: 'Pérez',
    minLength: 3,
    maxLength: 15,
  })
  @IsNotEmpty({ message: ErrorMessages.VALIDATION.REQUIRED_FIELD('apellido') })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[A-Za-záéíóúÁÉÍÓÚñÑ ]+$/, {
    message: ErrorMessages.VALIDATION.LASTNAME_LETTERS_ONLY,
  })
  @Length(3, 15, { message: ErrorMessages.VALIDATION.LASTNAME_LENGTH })
  apellido: string;

  @ApiProperty({
    description: 'Número de celular ecuatoriano (formato: 09XXXXXXXX)',
    example: '0987654321',
  })
  @IsNotEmpty({ message: ErrorMessages.VALIDATION.REQUIRED_FIELD('celular') })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^09\d{8}$/, { message: ErrorMessages.VALIDATION.PHONE_FORMAT })
  celular: string;

  @ApiProperty({
    description:
      'Contraseña (mínimo 7 caracteres, debe incluir mayúsculas, minúsculas, números y caracteres especiales)',
    example: 'Segura.123',
    minLength: 7,
    maxLength: 20,
  })
  @IsNotEmpty({ message: ErrorMessages.VALIDATION.REQUIRED_FIELD('password') })
  @IsString()
  @Length(7, 20, { message: ErrorMessages.AUTH.PASSWORD_REQUIREMENTS })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message: ErrorMessages.AUTH.PASSWORD_REQUIREMENTS,
  })
  password: string;

  @ApiProperty({
    description: 'Confirmaci\u00f3n de contrase\u00f1a',
    example: 'Segura.123',
    minLength: 7,
    maxLength: 20,
  })
  @IsNotEmpty({
    message: ErrorMessages.VALIDATION.REQUIRED_FIELD('confirmPassword'),
  })
  @IsString()
  @Length(7, 20, { message: ErrorMessages.AUTH.PASSWORD_REQUIREMENTS })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[/*.@_#-])[A-Za-z\d/*.@_#-]+$/, {
    message: ErrorMessages.AUTH.PASSWORD_REQUIREMENTS,
  })
  confirmPassword: string;
}
