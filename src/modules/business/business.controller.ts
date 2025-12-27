import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { Roles } from '../common/Decorators/roles.decorator';
import { RolUsuarioEnum } from '../auth/Enum/users-roles.enum';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '../common/Decorators/user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { UpdateProfileDto } from './Dto/update-profile.dto';
import { BusinessService } from './business.service';

@ApiTags('Business')
@Controller('business')
export class BusinessController {
  private readonly uuidPipe = new ParseUUIDPipe({ version: '4' });

  constructor(private readonly businessService: BusinessService) {}

  private async validateUserId(userId: string): Promise<string> {
    return this.uuidPipe.transform(userId, { type: 'custom' });
  }

  @Roles(RolUsuarioEnum.PASAJERO)
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Actualizar perfil del usuario verificado' })
  @ApiResponse({
    status: 200,
    description: 'Perfil actualizado correctamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'Usuario no verificado o datos inválidos.',
  })
  @ApiResponse({
    status: 401,
    description: 'Token no proporcionado o inválido.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado. Solo usuarios con rol PASAJERO.',
  })
  async updateProfile(@User() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    const safeUserId = await this.validateUserId(user.id);
    return await this.businessService.updateProfile(safeUserId, dto);
  }
}
