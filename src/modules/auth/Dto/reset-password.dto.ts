import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Token recibido por correo (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsNotEmpty({ message: ErrorMessages.VALIDATION.REQUIRED_FIELD('token') })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  token: string;

  @ApiProperty({
    description:
      'Nueva contraseña (Min 7 chars, Mayús, Minús, Num, Carácter Esp.)',
    example: 'WasiGo.2025#',
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
