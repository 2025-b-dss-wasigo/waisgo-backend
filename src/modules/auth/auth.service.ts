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

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');
  private readonly secretKey: Uint8Array;
  private readonly JWT_EXPIRES_IN: string;

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly configService: ConfigService,
  ) {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    this.JWT_EXPIRES_IN =
      this.configService.get<string>('JWT_EXPIRES_IN') || '8h';
    this.secretKey = new TextEncoder().encode(jwtSecret);
  }

  async login(dto: LoginDto) {
    try {
      const email = dto.email.trim().toLowerCase();

      const user = await this.usersRepo.findOne({
        where: { email },
        relations: ['credential'], // aunque tengas eager, es explícito
      });

      if (!user || !user.credential) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      const passwordValid = await bcrypt.compare(
        dto.password,
        user.credential.passwordHash,
      );

      if (!passwordValid) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

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
}
