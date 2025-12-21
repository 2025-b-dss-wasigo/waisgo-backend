import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  @IsEmail()
  @Matches(/^[\w.+-]+@epn\.edu\.ec$/)
  email: string;

  @IsNotEmpty()
  @IsString()
  @Length(7, 20)
  password: string;
}
