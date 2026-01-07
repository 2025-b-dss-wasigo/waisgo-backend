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
import { EncryptJWT, jwtDecrypt } from 'jose';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import { StructuredLogger, SecurityEventType } from '../common/logger';

import { EstadoVerificacionEnum, RolUsuarioEnum } from './Enum';
import { AuditAction, AuditResult } from '../audit/Enums';
import { parseDurationToSeconds } from '../common/utils/duration.util';

import { LoginDto, RegisterUserDto } from './Dto';
import { AuthContext } from '../common/types';

import { AuditService } from './../audit/audit.service';
import { RedisService } from 'src/redis/redis.service';
import { MailService } from 'src/modules/mail/mail.service';
import { AuthUser } from './Models/auth-user.entity';
import { BusinessService } from '../business/business.service';
import { IdentityResolverService, IdentityHashService } from '../identity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secretKey: Uint8Array;
  private readonly JWT_EXPIRES_IN: string;
  private readonly JWT_REFRESH_EXPIRES_IN: string;

  // Constantes de Seguridad (cargadas desde ConfigService)
  private readonly MAX_FAILED_ATTEMPTS: number;
  private readonly BLOCK_TIME_MINUTES: number;

  // Constantes para Redis
  private readonly RESET_TTL_SECONDS: number;
  private readonly RESET_PREFIX = 'reset:token:';
  private readonly REVOKE_PREFIX = 'revoke:jti:';
  private readonly REFRESH_PREFIX = 'refresh:';

  // NUEVAS CONSTANTES PARA LIMITE Y LINK ÚNICO
  private readonly RESET_LIMIT_PREFIX = 'reset:limit:';
  private readonly RESET_ACTIVE_PREFIX = 'reset:active:';
  private readonly MAX_RESET_ATTEMPTS: number;
  private readonly RESET_LIMIT_TTL = 60 * 60;
  private readonly DEFAULT_REVOKE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 días

  constructor(
    @InjectRepository(AuthUser)
    private readonly authUserRepo: Repository<AuthUser>,
    private readonly dataSource: DataSource,
    private readonly businessService: BusinessService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
    private readonly structuredLogger: StructuredLogger,
    private readonly identityResolver: IdentityResolverService,
    private readonly identityHash: IdentityHashService,
  ) {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    this.JWT_EXPIRES_IN =
      this.configService.get<string>('JWT_EXPIRES_IN') || '15m';
    this.JWT_REFRESH_EXPIRES_IN =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';
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
    const { password, confirmPassword, nombre, apellido, celular, email } = dto;
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
      if (password !== confirmPassword) {
        throw new BadRequestException(
          ErrorMessages.AUTH.PASSWORDS_DO_NOT_MATCH,
        );
      }

      const authUserId = randomUUID();
      const createdAt = new Date();

      // 1. Crear usuario en auth
      const authUser = this.authUserRepo.create({
        id: authUserId,
        email: normalizedEmail,
        rol: RolUsuarioEnum.USER,
        estadoVerificacion: EstadoVerificacionEnum.NO_VERIFICADO,
        credential: {
          passwordHash: await bcrypt.hash(password, 12),
        },
      });

      await queryRunner.manager.save(authUser);

      // 2. Crear usuario en business (con su propio UUID, desacoplado)
      const businessIdentity =
        await this.businessService.createFromAuthWithManager(
          queryRunner.manager,
          {
            nombre,
            apellido,
            celular,
          },
        );

      // 3. Crear mapeo de identidad encriptado
      await this.identityResolver.createMappingWithManager(
        queryRunner.manager,
        authUserId,
        businessIdentity.businessUserId,
        { email: normalizedEmail, createdAt },
      );

      await queryRunner.commitTransaction();

      // Auditar con hash determinístico (no UUID)
      const deterministicHash = this.identityHash.generateDeterministicHash({
        email: normalizedEmail,
        createdAt,
      });

      await this.auditService.logEvent({
        action: AuditAction.REGISTER,
        userId: deterministicHash,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
        result: AuditResult.SUCCESS,
        metadata: { publicId: businessIdentity.publicId },
      });

      this.structuredLogger.logSuccess(
        SecurityEventType.REGISTER,
        'User registration',
        deterministicHash,
        `user:${businessIdentity.publicId}`,
        { alias: businessIdentity.alias },
      );

      this.logger.log(`User registered: ${businessIdentity.publicId}`);

      return {
        success: true,
        message: ErrorMessages.AUTH.ACCOUNT_CREATE,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.structuredLogger.logFailure(
        SecurityEventType.REGISTER,
        'User registration',
        error instanceof Error ? error.message : 'Unknown error',
        undefined,
        undefined,
        error instanceof Error ? error.name : 'ERROR',
      );
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

      if (!user?.credential) {
        this.structuredLogger.logFailure(
          SecurityEventType.LOGIN_FAILURE,
          'User login',
          'Invalid credentials',
          undefined,
          `user:${email}`,
          'INVALID_CREDENTIALS',
          { ip: context?.ip },
        );
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

      // Obtener hash determinístico para auditoría
      const deterministicHash =
        await this.identityResolver.getDeterministicHash(user.id);

      if (!passwordValid) {
        await this.auditService.logEvent({
          action: AuditAction.LOGIN_FAILED,
          userId: deterministicHash ?? user.id,
          ipAddress: context?.ip,
          userAgent: context?.userAgent,
          result: AuditResult.FAILED,
        });
        await this.handleFailedAttempt(user);
        throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_CREDENTIALS);
      }

      await this.resetFailedAttempts(user);

      // Resolver businessUserId desde authUserId
      const businessUserId = await this.identityResolver.resolveBusinessUserId(
        user.id,
      );

      // Obtener datos de business para el token
      const businessUser = await this.businessService.findById(businessUserId);

      if (!businessUser) {
        throw new InternalServerErrorException(
          ErrorMessages.SYSTEM.BUSINESS_USER_NOT_FOUND,
        );
      }

      // Generar par de tokens (access + refresh)
      const tokens = await this.generateTokenPair(
        businessUserId,
        user.rol,
        user.estadoVerificacion === EstadoVerificacionEnum.VERIFICADO,
        businessUser.alias,
        businessUser.publicId,
      );

      await this.auditService.logEvent({
        action: AuditAction.LOGIN_SUCCESS,
        userId: deterministicHash ?? businessUserId,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
        result: AuditResult.SUCCESS,
      });

      this.structuredLogger.logSuccess(
        SecurityEventType.LOGIN_SUCCESS,
        'User login',
        deterministicHash ?? businessUserId,
        `user:${businessUser.publicId}`,
        { role: user.rol, ip: context?.ip },
      );

      return {
        role: user.rol,
        ...tokens,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;

      this.logger.error(
        `${error instanceof Error ? error.name : 'Error'}: ${error instanceof Error ? error.message : 'Error desconocido'}`,
      );
      throw new InternalServerErrorException(
        ErrorMessages.SYSTEM.INTERNAL_ERROR,
      );
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

    // Resolver businessUserId para revocar sesiones (tokens usan businessUserId)
    const businessUserId = await this.identityResolver.resolveBusinessUserId(
      user.id,
    );

    await this.redisService.revokeUserSessions(
      businessUserId,
      this.getSessionRevokeTtlSeconds(),
    );

    // Auditar reset completado
    await this.auditService.logEvent({
      action: AuditAction.PASSWORD_RESET_COMPLETE,
      userId: businessUserId,
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
    refreshToken?: string,
  ): Promise<{ message: string }> {
    // Revocar access token
    if (expSeconds > 0) {
      const redisKey = `${this.REVOKE_PREFIX}${jti}`;
      await this.redisService.set(redisKey, 'REVOKED', expSeconds);
    }

    // Revocar refresh token si se proporciona
    if (refreshToken) {
      await this.revokeRefreshToken(refreshToken);
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
    businessUserId: string,
    currentPass: string,
    newPass: string,
    context?: AuthContext,
  ) {
    // Resolver authUserId desde businessUserId
    const authUserId =
      await this.identityResolver.resolveAuthUserId(businessUserId);
    if (!authUserId) {
      throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
    }

    const user = await this.authUserRepo.findOne({
      where: { id: authUserId },
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
        userId: businessUserId,
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
    await this.redisService.revokeUserSessions(
      businessUserId,
      this.getSessionRevokeTtlSeconds(),
    );

    // Auditar cambio exitoso
    await this.auditService.logEvent({
      action: AuditAction.PASSWORD_CHANGE,
      userId: businessUserId,
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

  private getSessionRevokeTtlSeconds(): number {
    // Usar la duración del refresh token para revocación de sesiones
    // ya que necesitamos bloquear tokens hasta que todos expiren
    return parseDurationToSeconds(
      this.JWT_REFRESH_EXPIRES_IN,
      this.DEFAULT_REVOKE_TTL_SECONDS,
    );
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

  /**
   * Obtiene los correos de todos los administradores activos
   */
  async getAdminEmails(): Promise<string[]> {
    const admins = await this.authUserRepo.find({
      where: {
        rol: RolUsuarioEnum.ADMIN,
        estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      },
      select: ['email'],
    });

    return admins.map((admin) => admin.email);
  }

  /**
   * Genera un par de tokens (access + refresh)
   */
  private async generateTokenPair(
    businessUserId: string,
    role: RolUsuarioEnum,
    isVerified: boolean,
    alias: string,
    publicId: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }> {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();

    // Access Token (corta duración: 15 minutos)
    const accessToken = await new EncryptJWT({
      role,
      isVerified,
      alias,
      publicId,
      type: 'access',
    })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setSubject(businessUserId)
      .setIssuer('wasigo-api')
      .setAudience('wasigo-app')
      .setJti(accessJti)
      .setIssuedAt()
      .setExpirationTime(this.JWT_EXPIRES_IN)
      .encrypt(this.secretKey);

    // Refresh Token (larga duración: 7 días)
    const refreshToken = await new EncryptJWT({
      type: 'refresh',
      accessJti, // Vinculado al access token original
    })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setSubject(businessUserId)
      .setIssuer('wasigo-api')
      .setAudience('wasigo-app')
      .setJti(refreshJti)
      .setIssuedAt()
      .setExpirationTime(this.JWT_REFRESH_EXPIRES_IN)
      .encrypt(this.secretKey);

    // Almacenar refresh token en Redis para rotación y revocación
    const refreshTtl = parseDurationToSeconds(
      this.JWT_REFRESH_EXPIRES_IN,
      7 * 24 * 60 * 60,
    );
    await this.redisService.set(
      `${this.REFRESH_PREFIX}${refreshJti}`,
      businessUserId,
      refreshTtl,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: parseDurationToSeconds(this.JWT_EXPIRES_IN, 900), // 15 min default
      refreshExpiresIn: refreshTtl,
    };
  }

  /**
   * Refresca los tokens usando un refresh token válido
   */
  async refreshTokens(
    refreshToken: string,
    context?: AuthContext,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }> {
    try {
      const { payload } = await jwtDecrypt(refreshToken, this.secretKey, {
        issuer: 'wasigo-api',
        audience: 'wasigo-app',
      });

      // Validar que es un refresh token
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException(
          ErrorMessages.AUTH.REFRESH_TOKEN_INVALID,
        );
      }

      const refreshJti = payload.jti as string;
      const businessUserId = payload.sub as string;

      // Verificar que el refresh token existe en Redis (no revocado)
      const storedUserId = await this.redisService.get(
        `${this.REFRESH_PREFIX}${refreshJti}`,
      );

      if (!storedUserId || storedUserId !== businessUserId) {
        throw new UnauthorizedException(
          ErrorMessages.AUTH.REFRESH_TOKEN_REVOKED,
        );
      }

      // Verificar si las sesiones del usuario han sido revocadas
      const tokenIat = payload.iat as number;
      const isUserSessionRevoked = await this.redisService.isUserSessionRevoked(
        businessUserId,
        tokenIat,
      );

      if (isUserSessionRevoked) {
        // Eliminar el refresh token de Redis
        await this.redisService.del(`${this.REFRESH_PREFIX}${refreshJti}`);
        throw new UnauthorizedException(ErrorMessages.SYSTEM.SESSION_EXPIRED);
      }

      // Obtener datos del usuario
      const businessUser = await this.businessService.findById(businessUserId);
      if (!businessUser) {
        throw new UnauthorizedException(
          ErrorMessages.SYSTEM.BUSINESS_USER_NOT_FOUND,
        );
      }

      // Obtener rol actual del usuario (puede haber cambiado)
      const authUserId =
        await this.identityResolver.resolveAuthUserId(businessUserId);
      if (!authUserId) {
        throw new UnauthorizedException(ErrorMessages.USER.NOT_FOUND);
      }

      const authUser = await this.authUserRepo.findOne({
        where: { id: authUserId },
      });
      if (!authUser) {
        throw new UnauthorizedException(ErrorMessages.USER.NOT_FOUND);
      }

      // Revocar el refresh token actual (rotación)
      await this.redisService.del(`${this.REFRESH_PREFIX}${refreshJti}`);

      // Generar nuevos tokens
      const tokens = await this.generateTokenPair(
        businessUserId,
        authUser.rol,
        authUser.estadoVerificacion === EstadoVerificacionEnum.VERIFICADO,
        businessUser.alias,
        businessUser.publicId,
      );

      this.logger.debug(`Tokens refreshed for user: ${businessUser.publicId}`);

      return tokens;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;

      this.logger.warn(
        `Refresh token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new UnauthorizedException(ErrorMessages.AUTH.REFRESH_TOKEN_INVALID);
    }
  }

  /**
   * Revoca un refresh token específico (para logout completo)
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      const { payload } = await jwtDecrypt(refreshToken, this.secretKey, {
        issuer: 'wasigo-api',
        audience: 'wasigo-app',
      });

      if (payload.type === 'refresh' && payload.jti) {
        await this.redisService.del(
          `${this.REFRESH_PREFIX}${payload.jti as string}`,
        );
      }
    } catch {
      // Si el token es inválido, simplemente ignoramos
      this.logger.debug('Invalid refresh token during revocation');
    }
  }
}
