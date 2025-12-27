import { IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePasswordDto {
  @ApiProperty({
    description: 'Contraseña actual del usuario',
    example: 'MiContraseña.123',
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  currentPassword: string;

  @ApiProperty({
    description:
      'Nueva contraseña (mínimo 7 caracteres, debe incluir mayúsculas, minúsculas, números y caracteres especiales)',
    example: 'NuevaSegura.456',
    minLength: 7,
    maxLength: 20,
  })
  @IsString()
  @Length(7, 20)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[/*.@-_#]).+$/, {
    message:
      'La contraseña debe tener mayúsculas, minúsculas, números y caracteres especiales',
  })
  newPassword: string;
}
