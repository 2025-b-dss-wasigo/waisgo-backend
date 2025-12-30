import { IsString, Length, Matches, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

export class ConfirmOtpDto {
  @ApiProperty({
    description: 'Código OTP de 6 dígitos recibido por correo',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsNotEmpty({ message: ErrorMessages.VALIDATION.REQUIRED_FIELD('code') })
  @IsString({ message: 'El código debe ser una cadena de texto' })
  @Length(6, 6, { message: ErrorMessages.VERIFICATION.CODE_FORMAT_INVALID })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^\d{6}$/, {
    message: ErrorMessages.VERIFICATION.CODE_FORMAT_INVALID,
  })
  code: string;
}
