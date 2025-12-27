import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { EncryptJWT } from 'jose';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ErrorMessages } from '../common/constants/error-messages.constant';

import { EstadoVerificacionEnum } from './Enum/estado-ver.enum';
import { AuditAction } from '../audit/Enums/audit-actions.enum';
import { AuditResult } from '../audit/Enums/audit-result.enum';

import { LoginDto } from './Dto/login.dto';
import { AuthContext } from '../common/types/auth-context.type';

import { AuditService } from './../audit/audit.service';
import { RedisService } from 'src/redis/redis.service';
import { MailService } from 'src/modules/mail/mail.service';
import { AuthUser } from './Models/auth-user.entity';
import { BusinessService } from '../business/business.service';
import { RegisterUserDto } from './Dto/register-user.dto';
import { RolUsuarioEnum } from './Enum/users-roles.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secretKey: Uint8Array;
  private readonly JWT_EXPIRES_IN: string;

  // Constantes de Seguridad (cargadas desde ConfigService)
  private readonly MAX_FAILED_ATTEMPTS: number;
  private readonly BLOCK_TIME_MINUTES: number;

  // Constantes para Redis
  private readonly RESET_TTL_SECONDS: number;
  private readonly RESET_PREFIX = 'reset:token:';
  private readonly REVOKE_PREFIX = 'revoke:jti:';
  private readonly REVOKE_USER_PREFIX = 'revoke:user:';

  // NUEVAS CONSTANTES PARA LIMITE Y LINK ÚNICO
  private readonly RESET_LIMIT_PREFIX = 'reset:limit:';
  private readonly RESET_ACTIVE_PREFIX = 'reset:active:';
  private readonly MAX_RESET_ATTEMPTS: number;
  private readonly RESET_LIMIT_TTL = 60 * 60;

  constructor(
    @InjectRepository(AuthUser)
    private readonly authUserRepo: Repository<AuthUser>,
    private readonly dataSource: DataSource,
    private readonly businessService: BusinessService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
  ) {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    this.JWT_EXPIRES_IN =
      this.configService.get<string>('JWT_EXPIRES_IN') || '8h';
    this.secretKey = new TextEncoder().encode(jwtSecret);

    // Cargar constantes de seguridad desde variables de entorno
    this.MAX_FAILED_ATTEMPTS = this.configService.get<number>(
      'MAX_FAILED_ATTEMPTS',
      5,
    );
    this.BLOCK_TIME_MINUTES = this.configService.get<number>(
      'BLOCK_TIME_MINUTES',
      15,
    );
    this.RESET_TTL_SECONDS =
      this.configService.get<number>('RESET_TOKEN_EXPIRY_MINUTES', 30) * 60;
    this.MAX_RESET_ATTEMPTS = this.configService.get<number>(
      'MAX_RESET_ATTEMPTS',
      3,
    );
  }

  async register(dto: RegisterUserDto, context?: AuthContext) {
    const { password, nombre, apellido, celular, email } = dto;
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await this.authUserRepo.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new BadRequestException(ErrorMessages.AUTH.EMAIL_ALREADY_EXISTS);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userId = randomUUID();

      const authUser = this.authUserRepo.create({
        id: userId,
        email: normalizedEmail,
        rol: RolUsuarioEnum.USER,
        estadoVerificacion: EstadoVerificacionEnum.NO_VERIFICADO,
        credential: {
          passwordHash: await bcrypt.hash(password, 12),
        },
      });

      await queryRunner.manager.save(authUser);

      await this.businessService.createFromAuthWithManager(
        queryRunner.manager,
        userId,
        {
          email,
          nombre,
          apellido,
          celular,
        },
      );

      await queryRunner.commitTransaction();

      // Auditar registro exitoso
      await this.auditService.logEvent({
        action: AuditAction.REGISTER,
        userId,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
        result: AuditResult.SUCCESS,
        metadata: { email: normalizedEmail },
      });

      this.logger.log(`User registered: ${userId}`);

      return {
        success: true,
        userId,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Registration failed', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async login(dto: LoginDto, context?: AuthContext) {
    try {
      const email = dto.email.trim().toLowerCase();

      const user = await this.authUserRepo.findOne({
        where: { email },
        relations: ['credential'],
      });

      if (!user || !user.credential) {
        this.logger.warn(`Intento de login fallido para email: ${email}`);
        throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_CREDENTIALS);
      }

      if (user.bloqueadoHasta && user.bloqueadoHasta > new Date()) {
        const remainingMinutes = Math.ceil(
          (user.bloqueadoHasta.getTime() - Date.now()) / 60000,
        );
        throw new UnauthorizedException(
          ErrorMessages.AUTH.ACCOUNT_BLOCKED(remainingMinutes),
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
        throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_CREDENTIALS);
      }

      await this.resetFailedAttempts(user);

      const token = await new EncryptJWT({
        role: user.rol,
        isVerified:
          user.estadoVerificacion === EstadoVerificacionEnum.VERIFICADO,
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

      this.logger.error(
        `${error instanceof Error ? error.name : 'Error'}: ${error instanceof Error ? error.message : 'Error desconocido'}`,
      );
      throw new InternalServerErrorException('Error inesperado en login');
    }
  }

  async forgotPassword(
    email: string,
    context?: AuthContext,
  ): Promise<{ message: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const isDev = this.configService.get<string>('NODE_ENV') !== 'production';

    const user = await this.authUserRepo.findOne({
      where: { email: normalizedEmail },
    });

    // Auditar solicitud de reset (siempre, exista o no el usuario)
    await this.auditService.logEvent({
      action: AuditAction.PASSWORD_RESET_REQUEST,
      userId: user?.id,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      result: user ? AuditResult.SUCCESS : AuditResult.FAILED,
      metadata: { email: normalizedEmail, userExists: !!user },
    });

    // En producción: mensaje genérico para prevenir enumeración de usuarios
    // En desarrollo: mensajes específicos para debugging
    if (!user) {
      this.logger.warn(
        `Solicitud de reset para email no registrado: ${normalizedEmail}`,
      );
      if (isDev) {
        throw new NotFoundException(ErrorMessages.AUTH.EMAIL_NOT_FOUND);
      }
      return { message: ErrorMessages.AUTH.RESET_EMAIL_SENT };
    }

    if (user.estadoVerificacion !== EstadoVerificacionEnum.VERIFICADO) {
      this.logger.warn(
        `Solicitud de reset para usuario no verificado: ${normalizedEmail}`,
      );
      if (isDev) {
        throw new BadRequestException(ErrorMessages.USER.NOT_VERIFIED);
      }
      return { message: ErrorMessages.AUTH.RESET_EMAIL_SENT };
    }

    const limitKey = `${this.RESET_LIMIT_PREFIX}${user.id}`;
    const attempts = await this.redisService.get(limitKey);

    if (attempts && Number(attempts) >= this.MAX_RESET_ATTEMPTS) {
      throw new ForbiddenException(ErrorMessages.AUTH.RESET_LIMIT_EXCEEDED);
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

    const displayName = await this.businessService.getDisplayName(user.id);

    await this.mailService.sendResetPasswordEmail({
      to: user.email,
      name: displayName,
      resetUrl,
    });

    return { message: ErrorMessages.AUTH.RESET_EMAIL_SENT };
  }

  async resetPassword(
    token: string,
    newPassword: string,
    context?: AuthContext,
  ): Promise<{ message: string }> {
    const sanitizedToken = token.trim();

    // Validar formato UUID del token
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sanitizedToken)) {
      throw new BadRequestException(ErrorMessages.AUTH.RESET_TOKEN_INVALID);
    }

    const redisKey = `${this.RESET_PREFIX}${sanitizedToken}`;
    const userId = await this.redisService.get(redisKey);

    if (!userId) {
      throw new BadRequestException(ErrorMessages.AUTH.RESET_TOKEN_INVALID);
    }

    const user = await this.authUserRepo.findOne({
      where: { id: userId },
      relations: ['credential'],
    });

    if (!user) {
      throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
    }

    user.credential.passwordHash = await bcrypt.hash(newPassword, 12);
    await this.authUserRepo.save(user);

    await this.redisService.del(redisKey);
    await this.redisService.del(`${this.RESET_ACTIVE_PREFIX}${user.id}`);

    const nowInSeconds = Math.floor(Date.now() / 1000);

    await this.redisService.set(
      `${this.REVOKE_USER_PREFIX}${user.id}`,
      nowInSeconds,
      28800,
    );

    // Auditar reset completado
    await this.auditService.logEvent({
      action: AuditAction.PASSWORD_RESET_COMPLETE,
      userId: user.id,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      result: AuditResult.SUCCESS,
    });

    return { message: ErrorMessages.AUTH.PASSWORD_RESET_SUCCESS };
  }

  async logout(
    jti: string,
    expSeconds: number,
    userId?: string,
    context?: AuthContext,
  ): Promise<{ message: string }> {
    if (expSeconds > 0) {
      const redisKey = `${this.REVOKE_PREFIX}${jti}`;
      await this.redisService.set(redisKey, 'REVOKED', expSeconds);
    }

    // Auditar logout
    if (userId) {
      await this.auditService.logEvent({
        action: AuditAction.LOGOUT,
        userId,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
        result: AuditResult.SUCCESS,
      });
    }

    return { message: ErrorMessages.AUTH.LOGOUT_SUCCESS };
  }

  async changePassword(
    userId: string,
    currentPass: string,
    newPass: string,
    context?: AuthContext,
  ) {
    const user = await this.authUserRepo.findOne({
      where: { id: userId },
      relations: ['credential'],
    });

    if (!user) {
      throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
    }

    if (user.estadoVerificacion !== EstadoVerificacionEnum.VERIFICADO) {
      throw new BadRequestException(ErrorMessages.USER.NOT_VERIFIED);
    }

    const valid = await bcrypt.compare(
      currentPass,
      user.credential.passwordHash,
    );

    if (!valid) {
      // Auditar intento fallido
      await this.auditService.logEvent({
        action: AuditAction.PASSWORD_CHANGE_FAILED,
        userId,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
        result: AuditResult.FAILED,
        metadata: { reason: 'invalid_current_password' },
      });
      throw new BadRequestException(
        ErrorMessages.AUTH.INVALID_CURRENT_PASSWORD,
      );
    }

    if (await bcrypt.compare(newPass, user.credential.passwordHash)) {
      throw new BadRequestException(ErrorMessages.AUTH.PASSWORD_SAME_AS_OLD);
    }

    user.credential.passwordHash = await bcrypt.hash(newPass, 12);
    await this.authUserRepo.save(user);

    // Auditar cambio exitoso
    await this.auditService.logEvent({
      action: AuditAction.PASSWORD_CHANGE,
      userId,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      result: AuditResult.SUCCESS,
    });

    return { message: ErrorMessages.AUTH.PASSWORD_CHANGE_SUCCESS };
  }

  private async handleFailedAttempt(user: AuthUser) {
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

    await this.authUserRepo.save(user);
  }

  private async resetFailedAttempts(user: AuthUser) {
    user.credential.failedAttempts = 0;
    user.credential.lastFailedAttempt = null;
    user.bloqueadoHasta = null;

    await this.authUserRepo.save(user);
  }

  private async incrementResetAttempts(key: string) {
    const current = await this.redisService.get(key);
    let count = current ? Number(current) : 0;
    count++;

    await this.redisService.set(key, count, this.RESET_LIMIT_TTL);
  }

  async findForVerification(userId: string) {
    const user = await this.authUserRepo.findOne({
      where: { id: userId },
      select: ['id', 'email', 'estadoVerificacion'],
    });

    if (!user) {
      throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
    }

    return user;
  }

  async verifyUser(userId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(AuthUser, {
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
      }

      if (user.estadoVerificacion === EstadoVerificacionEnum.VERIFICADO) {
        await queryRunner.rollbackTransaction();
        return; // Usuario ya verificado, no hacer nada
      }

      user.estadoVerificacion = EstadoVerificacionEnum.VERIFICADO;
      user.rol = RolUsuarioEnum.PASAJERO;

      await queryRunner.manager.save(user);
      await queryRunner.commitTransaction();

      this.logger.log(`User ${userId} verified successfully`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
