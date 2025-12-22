import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class RegisterUserDto {
  @IsNotEmpty()
  @IsEmail()
  @Matches(/^[\w.+-]+@epn\.edu\.ec$/)
  email: string;

  @IsNotEmpty()
  @Matches(/^[A-Za-záéíóúÁÉÍÓÚñÑ ]+$/)
  @Length(3, 15)
  nombre: string;

  @IsNotEmpty()
  @Matches(/^[A-Za-záéíóúÁÉÍÓÚñÑ ]+$/)
  @Length(3, 15)
  apellido: string;

  @IsNotEmpty()
  @Matches(/^09\d{8}$/)
  celular: string;

  @IsNotEmpty()
  @IsString()
  @Length(7, 20)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message:
      'La contraseña debe contener al menos una letra mayúscula, una minúscula, un número y un carácter especial.',
  })
  password: string;
}
