import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { Roles, User } from '../common/Decorators';
import type { JwtPayload } from '../common/types';
import { buildAuthContext } from '../common/utils/request-context.util';
import { RolUsuarioEnum } from '../auth/Enum';
import { DriversService } from './drivers.service';
import { ApplyDriverDto } from './Dto';
import { TipoDocumentoEnum } from './Enums';

@ApiTags('Drivers')
@ApiBearerAuth('access-token')
@Controller('drivers')
export class DriversController {
  private readonly uuidPipe = new ParseUUIDPipe({ version: '4' });

  constructor(private readonly driversService: DriversService) {}

  private async validateUserId(userId: string): Promise<string> {
    return this.uuidPipe.transform(userId, { type: 'custom' });
  }

  @Roles(RolUsuarioEnum.PASAJERO)
  @Post('apply')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enviar solicitud para ser conductor' })
  @ApiResponse({ status: 201, description: 'Solicitud enviada correctamente' })
  @ApiResponse({
    status: 400,
    description: 'Ya tienes una solicitud pendiente',
  })
  @ApiResponse({ status: 409, description: 'Ya eres conductor' })
  async applyAsDriver(
    @User() user: JwtPayload,
    @Body() dto: ApplyDriverDto,
    @Req() req: Request,
  ) {
    const safeUserId = await this.validateUserId(user.id);
    const context = buildAuthContext(req);
    return this.driversService.applyAsDriver(
      safeUserId,
      dto.paypalEmail,
      context,
    );
  }

  @Roles(RolUsuarioEnum.PASAJERO, RolUsuarioEnum.CONDUCTOR)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener estado de mi solicitud como conductor' })
  @ApiResponse({ status: 200, description: 'Estado de la solicitud' })
  async getMyDriverRequest(@User() user: JwtPayload) {
    const safeUserId = await this.validateUserId(user.id);
    return this.driversService.getMyDriverStatus(safeUserId);
  }

  @Roles(RolUsuarioEnum.PASAJERO, RolUsuarioEnum.CONDUCTOR)
  @Post('documents/:tipo')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Subir documento del conductor' })
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
  @ApiResponse({ status: 200, description: 'Documento subido correctamente' })
  @ApiResponse({ status: 400, description: 'Archivo inválido o muy grande' })
  @ApiResponse({
    status: 404,
    description: 'No tienes solicitud de conductor',
  })
  async uploadDocument(
    @User() user: JwtPayload,
    @Param('tipo', new ParseEnumPipe(TipoDocumentoEnum))
    tipo: TipoDocumentoEnum,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    const safeUserId = await this.validateUserId(user.id);
    const context = buildAuthContext(req);
    return this.driversService.uploadDocument(safeUserId, tipo, file, context);
  }
}
