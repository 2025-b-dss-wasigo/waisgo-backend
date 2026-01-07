import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Token de actualización',
    example: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0...',
  })
  @IsNotEmpty({
    message: ErrorMessages.VALIDATION.REQUIRED_FIELD('refreshToken'),
  })
  @IsString({
    message: ErrorMessages.VALIDATION.INVALID_FORMAT('refreshToken'),
  })
  refreshToken: string;
}
