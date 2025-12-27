import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterUserDto {
  @ApiProperty({
    description: 'Correo institucional (debe ser @epn.edu.ec)',
    example: 'juan.perez@epn.edu.ec',
  })
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @Matches(/^[\w.+-]+@epn\.edu\.ec$/)
  email: string;

  @ApiProperty({
    description: 'Nombre del usuario (solo letras y espacios)',
    example: 'Juan',
    minLength: 3,
    maxLength: 15,
  })
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[A-Za-záéíóúÁÉÍÓÚñÑ ]+$/)
  @Length(3, 15)
  nombre: string;

  @ApiProperty({
    description: 'Apellido del usuario (solo letras y espacios)',
    example: 'Pérez',
    minLength: 3,
    maxLength: 15,
  })
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[A-Za-záéíóúÁÉÍÓÚñÑ ]+$/)
  @Length(3, 15)
  apellido: string;

  @ApiProperty({
    description: 'Número de celular ecuatoriano (formato: 09XXXXXXXX)',
    example: '0987654321',
  })
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^09\d{8}$/)
  celular: string;

  @ApiProperty({
    description:
      'Contraseña (mínimo 7 caracteres, debe incluir mayúsculas, minúsculas, números y caracteres especiales)',
    example: 'Segura.123',
    minLength: 7,
    maxLength: 20,
  })
  @IsNotEmpty()
  @IsString()
  @Length(7, 20)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message:
      'La contraseña debe contener al menos una letra mayúscula, una minúscula, un número y un carácter especial.',
  })
  password: string;
}
