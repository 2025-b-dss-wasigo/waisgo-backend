import { AuditService } from './../audit/audit.service';
import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { EncryptJWT } from 'jose';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { User } from '../users/Models/users.entity';
import { LoginDto } from './Dto/login.dto';
import { AuthContext } from '../common/types/auth-context.type';
import { AuditAction } from '../audit/Enums/audit-actions.enum';
import { AuditResult } from '../audit/Enums/audit-result.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');
  private readonly secretKey: Uint8Array;
  private readonly JWT_EXPIRES_IN: string;
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly BLOCK_TIME_MINUTES = 15;

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly configService: ConfigService,
    private readonly AuditService: AuditService,
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
        await this.AuditService.logEvent({
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
        isVerified: user.estadoVerificacion === 'VERIFICADO',
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

      await this.AuditService.logEvent({
        action: AuditAction.LOGIN_SUCCESS,
        userId: user.id,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
        result: AuditResult.SUCCESS,
      });

      return {
        token,
        expiresIn: 28800, // 8 horas en segundos
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(`${error.name}: ${error.message}`);
      throw new InternalServerErrorException(
        'Unexpected error, check server logs',
      );
    }
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

      // Reset para el próximo ciclo
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
}
