import { IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmOtpDto {
  @ApiProperty({
    description: 'Código OTP de 6 dígitos recibido por correo',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: 'El código debe ser una cadena de texto' })
  @Length(6, 6, { message: 'El código debe tener exactamente 6 dígitos' })
  @Transform(({ value }) => value?.trim())
  @Matches(/^\d{6}$/, { message: 'El código debe contener solo números' })
  code: string;
}
