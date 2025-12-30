import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

export class LoginDto {
  @ApiProperty({
    description: 'Correo institucional (epn.edu.ec)',
    example: 'juan.perez@epn.edu.ec',
  })
  @IsNotEmpty({ message: ErrorMessages.VALIDATION.REQUIRED_FIELD('email') })
  @IsEmail({}, { message: ErrorMessages.VALIDATION.INVALID_FORMAT('email') })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @Matches(/^[\w.+-]+@epn\.edu\.ec$/, {
    message: ErrorMessages.AUTH.INVALID_EMAIL_DOMAIN,
  })
  email: string;

  @ApiProperty({
    description: 'Contraseña del usuario',
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
  password: string;
}
