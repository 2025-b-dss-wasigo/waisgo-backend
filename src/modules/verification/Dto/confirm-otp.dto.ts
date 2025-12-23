import { IsString, Length, Matches } from 'class-validator';

export class ConfirmOtpDto {
  @IsString({ message: 'El código debe ser una cadena de texto' })
  @Length(6, 6, { message: 'El código debe tener exactamente 6 dígitos' })
  @Matches(/^\d{6}$/, { message: 'El código debe contener solo números' })
  code: string;
}
