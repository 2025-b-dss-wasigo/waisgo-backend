import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({
    description: 'Correo institucional (epn.edu.ec)',
    example: 'juan.perez@epn.edu.ec',
  })
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  @Matches(/^[\w.+-]+@epn\.edu\.ec$/)
  email: string;

  @ApiProperty({
    description: 'Contraseña del usuario',
    example: 'Segura.123',
    minLength: 7,
    maxLength: 20,
  })
  @IsNotEmpty()
  @IsString()
  @Length(7, 20)
  @Transform(({ value }) => value?.trim())
  password: string;
}
