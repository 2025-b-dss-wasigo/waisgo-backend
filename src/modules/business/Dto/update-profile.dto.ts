import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Nuevo nombre del usuario (solo letras y espacios)',
    example: 'Juan Carlos',
    minLength: 3,
    maxLength: 15,
  })
  @IsOptional()
  @IsString()
  @Length(3, 15)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/, {
    message: 'El nombre solo puede contener letras',
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
  @Length(3, 15)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/, {
    message: 'El apellido solo puede contener letras',
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
    message: 'Celular inválido',
  })
  celular?: string;
}
