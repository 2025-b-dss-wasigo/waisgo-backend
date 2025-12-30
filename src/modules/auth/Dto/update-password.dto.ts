import { IsString, Length, Matches, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

export class UpdatePasswordDto {
  @ApiProperty({
    description: 'Contraseña actual del usuario',
    example: 'MiContraseña.123',
  })
  @IsNotEmpty({
    message: ErrorMessages.VALIDATION.REQUIRED_FIELD('currentPassword'),
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
  @IsNotEmpty({
    message: ErrorMessages.VALIDATION.REQUIRED_FIELD('newPassword'),
  })
  @IsString()
  @Length(7, 20, { message: ErrorMessages.AUTH.PASSWORD_REQUIREMENTS })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[/*.@-_#]).+$/, {
    message: ErrorMessages.AUTH.PASSWORD_REQUIREMENTS,
  })
  newPassword: string;
}
