import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Patch,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Roles } from '../common/Decorators/roles.decorator';
import { RolUsuarioEnum } from '../auth/Enum/users-roles.enum';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
} from '@nestjs/swagger';
import { User } from '../common/Decorators/user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { UpdateProfileDto } from './Dto/update-profile.dto';
import { BusinessService } from './business.service';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Business')
@Controller('business')
export class BusinessController {
  private readonly uuidPipe = new ParseUUIDPipe({ version: '4' });

  constructor(private readonly businessService: BusinessService) {}

  private async validateUserId(userId: string): Promise<string> {
    return this.uuidPipe.transform(userId, { type: 'custom' });
  }

  @Roles(
    RolUsuarioEnum.PASAJERO,
    RolUsuarioEnum.ADMIN,
    RolUsuarioEnum.CONDUCTOR,
    RolUsuarioEnum.USER,
  )
  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Obtener perfil del usuario verificado' })
  @ApiResponse({
    status: 200,
    description: 'Perfil obtenido correctamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'Usuario no verificado.',
  })
  @ApiResponse({
    status: 401,
    description: 'Token no proporcionado o inválido.',
  })
  async getProfile(@User() user: JwtPayload) {
    const safeUserId = await this.validateUserId(user.id);
    return await this.businessService.getMyProfile(safeUserId);
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

  @Roles(RolUsuarioEnum.PASAJERO)
  @Patch('profile/photo')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Actualizar foto de perfil del usuario verificado' })
  @ApiResponse({
    status: 200,
    description: 'Foto de perfil actualizada correctamente.',
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
  @UseInterceptors(FileInterceptor('file'))
  async updateProfilePhoto(
    @User() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.businessService.updateProfilePhoto(user.id, file);
  }

  @Roles(
    RolUsuarioEnum.PASAJERO,
    RolUsuarioEnum.ADMIN,
    RolUsuarioEnum.CONDUCTOR,
    RolUsuarioEnum.USER,
  )
  @Delete('profile')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Eliminar cuenta del usuario verificado' })
  @ApiResponse({
    status: 204,
    description: 'Cuenta eliminada correctamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'Usuario no verificado.',
  })
  @ApiResponse({
    status: 401,
    description: 'Token no proporcionado o inválido.',
  })
  async deleteAccount(@User() user: JwtPayload) {
    const safeUserId = await this.validateUserId(user.id);
    return await this.businessService.softDeleteUser(safeUserId);
  }

  @Roles(
    RolUsuarioEnum.PASAJERO,
    RolUsuarioEnum.ADMIN,
    RolUsuarioEnum.CONDUCTOR,
    RolUsuarioEnum.USER,
  )
  @Get('profile/display-name')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Obtener nombre para mostrar del usuario' })
  @ApiResponse({
    status: 200,
    description: 'Nombre para mostrar obtenido correctamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'ID de usuario inválido.',
  })
  @ApiResponse({
    status: 401,
    description: 'Token no proporcionado o inválido.',
  })
  async getDisplayName(@User() user: JwtPayload) {
    const safeUserId = await this.validateUserId(user.id);
    return await this.businessService.getDisplayName(safeUserId);
  }
}
