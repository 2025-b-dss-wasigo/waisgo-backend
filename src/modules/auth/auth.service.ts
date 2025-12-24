import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { EncryptJWT } from 'jose';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';

import { User } from '../users/Models/users.entity';
import { EstadoVerificacionEnum } from '../users/Enums/estado-ver.enum';
import { AuditAction } from '../audit/Enums/audit-actions.enum';
import { AuditResult } from '../audit/Enums/audit-result.enum';

import { LoginDto } from './Dto/login.dto';
import { AuthContext } from '../common/types/auth-context.type';

import { AuditService } from './../audit/audit.service';
import { RedisService } from 'src/redis/redis.service';
import { MailService } from 'src/modules/mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');
  private readonly secretKey: Uint8Array;
  private readonly JWT_EXPIRES_IN: string;

  // Constantes de Seguridad
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly BLOCK_TIME_MINUTES = 15;

  // Constantes para Redis
  private readonly RESET_TTL_SECONDS = 30 * 60; // 30 minutos
  private readonly RESET_PREFIX = 'reset:token:';
  private readonly REVOKE_PREFIX = 'revoke:jti:';
  private readonly REVOKE_USER_PREFIX = 'revoke:user:';

  // NUEVAS CONSTANTES PARA LIMITE Y LINK ÚNICO
  private readonly RESET_LIMIT_PREFIX = 'reset:limit:';
  private readonly RESET_ACTIVE_PREFIX = 'reset:active:';
  private readonly MAX_RESET_ATTEMPTS = 3;
  private readonly RESET_LIMIT_TTL = 60 * 60;

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
  ) {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    this.JWT_EXPIRES_IN =
      this.configService.get<string>('JWT_EXPIRES_IN') || '8h';
    this.secretKey = new TextEncoder().encode(jwtSecret);
  }

  async login(dto: LoginDto, context?: AuthContext) {
    try {
      const email = dto.email.trim().toLowerCase();

      const user = await this.usersRepo.findOne({
        where: { email },
        relations: ['credential'],
      });

      if (!user || !user.credential) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      if (user.bloqueadoHasta && user.bloqueadoHasta > new Date()) {
        throw new UnauthorizedException(
          'Cuenta temporalmente bloqueada. Intente más tarde.',
        );
      }

      const passwordValid = await bcrypt.compare(
        dto.password,
        user.credential.passwordHash,
      );

      if (!passwordValid) {
        await this.auditService.logEvent({
          action: AuditAction.LOGIN_FAILED,
          userId: user.id,
          ipAddress: context?.ip,
          userAgent: context?.userAgent,
          result: AuditResult.FAILED,
        });
        await this.handleFailedAttempt(user);
        throw new UnauthorizedException('Credenciales inválidas');
      }

      await this.resetFailedAttempts(user);

      const token = await new EncryptJWT({
        role: user.rol,
        isVerified:
          user.estadoVerificacion === EstadoVerificacionEnum.VERIFICADO,
        alias: user.alias,
      })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setSubject(user.id)
        .setIssuer('wasigo-api')
        .setAudience('wasigo-app')
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime(this.JWT_EXPIRES_IN)
        .encrypt(this.secretKey);

      await this.auditService.logEvent({
        action: AuditAction.LOGIN_SUCCESS,
        userId: user.id,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
        result: AuditResult.SUCCESS,
      });

      return {
        token,
        expiresIn: 28800, // 8h en segundos
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;

      this.logger.error(`${error.name}: ${error.message}`);
      throw new InternalServerErrorException('Error inesperado en login');
    }
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const genericResponse = {
      message:
        'Si el correo existe, se enviará un enlace para restablecer la contraseña',
    };

    const user = await this.usersRepo.findOne({
      where: { email: email.toLowerCase().trim() },
    });

    if (
      !user ||
      user.estadoVerificacion !== EstadoVerificacionEnum.VERIFICADO
    ) {
      return genericResponse;
    }

    const limitKey = `${this.RESET_LIMIT_PREFIX}${user.id}`;
    const attempts = await this.redisService.get(limitKey);

    if (attempts && Number(attempts) >= this.MAX_RESET_ATTEMPTS) {
      throw new ForbiddenException(
        'Has excedido el límite de solicitudes. Intenta en 1 hora.',
      );
    }

    const activeTokenKey = `${this.RESET_ACTIVE_PREFIX}${user.id}`;
    const oldTokenUUID = await this.redisService.get(activeTokenKey);

    if (oldTokenUUID) {
      await this.redisService.del(`${this.RESET_PREFIX}${oldTokenUUID}`);
    }

    const token = randomUUID();
    const redisKey = `${this.RESET_PREFIX}${token}`;

    await this.redisService.set(redisKey, user.id, this.RESET_TTL_SECONDS);
    await this.redisService.set(activeTokenKey, token, this.RESET_TTL_SECONDS);

    await this.incrementResetAttempts(limitKey);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    await this.mailService.sendResetPasswordEmail({
      to: user.email,
      name: user.alias || user.nombre,
      resetUrl: resetUrl,
    });

    return genericResponse;
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const redisKey = `${this.RESET_PREFIX}${token}`;

    const userId = await this.redisService.get(redisKey);

    if (!userId) {
      throw new BadRequestException('El enlace es inválido o ha expirado');
    }

    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: ['credential'],
    });

    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    user.credential.passwordHash = await bcrypt.hash(newPassword, 12);
    await this.usersRepo.save(user);

    await this.redisService.del(redisKey);
    await this.redisService.del(`${this.RESET_ACTIVE_PREFIX}${user.id}`);

    const nowInSeconds = Math.floor(Date.now() / 1000);

    await this.redisService.set(
      `${this.REVOKE_USER_PREFIX}${user.id}`,
      nowInSeconds,
      28800,
    );

    return { message: 'Contraseña restablecida correctamente' };
  }

  async logout(jti: string, expSeconds: number): Promise<{ message: string }> {
    if (expSeconds > 0) {
      const redisKey = `${this.REVOKE_PREFIX}${jti}`;
      await this.redisService.set(redisKey, 'REVOKED', expSeconds);
    }

    return { message: 'Sesión cerrada correctamente' };
  }

  private async handleFailedAttempt(user: User) {
    const credential = user.credential;

    credential.failedAttempts += 1;
    credential.lastFailedAttempt = new Date();

    if (credential.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
      const bloqueadoHasta = new Date();
      bloqueadoHasta.setMinutes(
        bloqueadoHasta.getMinutes() + this.BLOCK_TIME_MINUTES,
      );

      user.bloqueadoHasta = bloqueadoHasta;

      credential.failedAttempts = 0;
    }

    await this.usersRepo.save(user);
  }

  private async resetFailedAttempts(user: User) {
    user.credential.failedAttempts = 0;
    user.credential.lastFailedAttempt = null;
    user.bloqueadoHasta = null;

    await this.usersRepo.save(user);
  }

  private async incrementResetAttempts(key: string) {
    const current = await this.redisService.get(key);
    let count = current ? Number(current) : 0;
    count++;

    await this.redisService.set(key, count, this.RESET_LIMIT_TTL);
  }
}
