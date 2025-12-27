import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { RedisService } from 'src/redis/redis.service';
import { ErrorMessages } from '../common/constants/error-messages.constant';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_TTL: number;
  private readonly MAX_ATTEMPTS: number;
  private readonly MAX_RESENDS: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.OTP_TTL =
      this.configService.get<number>('OTP_EXPIRATION_MINUTES', 15) * 60;
    this.MAX_ATTEMPTS = this.configService.get<number>('MAX_OTP_ATTEMPTS', 3);
    this.MAX_RESENDS = this.configService.get<number>('MAX_OTP_RESENDS', 3);
  }

  generateOtp(): string {
    return randomInt(100000, 999999).toString();
  }

  private getOtpKeys(userId: string) {
    return {
      otpKey: `otp:verify:${userId}`,
      attemptsKey: `otp:verify:attempts:${userId}`,
      resendKey: `otp:verify:resend:${userId}`,
    };
  }

  async sendOtp(
    userId: string,
  ): Promise<{ code: string; expiresInMinutes: number }> {
    const { otpKey, attemptsKey, resendKey } = this.getOtpKeys(userId);

    const rawResendCount = await this.redisService.get(resendKey);
    const resendCount = Number(rawResendCount) || 0;

    if (resendCount >= this.MAX_RESENDS) {
      this.logger.warn(`Max resends reached for user: ${userId}`);
      throw new ForbiddenException(ErrorMessages.VERIFICATION.RESEND_LIMIT);
    }

    const otp = this.generateOtp();

    await this.redisService.saveOtpSession(
      otpKey,
      otp,
      this.OTP_TTL,
      attemptsKey,
      resendKey,
      resendCount,
    );

    this.logger.log(`OTP generated for user: ${userId}`);

    return {
      code: otp,
      expiresInMinutes: Math.floor(this.OTP_TTL / 60),
    };
  }

  async validateOtp(userId: string, code: string): Promise<void> {
    // Validar formato del código
    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException(
        ErrorMessages.VERIFICATION.CODE_FORMAT_INVALID,
      );
    }

    const { otpKey, attemptsKey } = this.getOtpKeys(userId);

    const storedOtp = await this.redisService.get(otpKey);

    if (!storedOtp) {
      this.logger.warn(`OTP not found or expired for user: ${userId}`);
      throw new BadRequestException(ErrorMessages.VERIFICATION.CODE_EXPIRED);
    }

    // Comparación de tiempo constante para prevenir timing attacks
    const isValid = this.secureCompare(storedOtp, code);

    if (!isValid) {
      const attempts = await this.redisService.incr(attemptsKey);

      if (attempts >= this.MAX_ATTEMPTS) {
        await this.redisService.del(otpKey, attemptsKey);
        this.logger.warn(`Max OTP attempts reached for user: ${userId}`);
        throw new ForbiddenException(
          ErrorMessages.VERIFICATION.MAX_ATTEMPTS_REACHED,
        );
      }

      throw new BadRequestException(
        ErrorMessages.VERIFICATION.CODE_ATTEMPTS_LEFT(
          this.MAX_ATTEMPTS - attempts,
        ),
      );
    }

    await this.redisService.del(otpKey, attemptsKey);
    this.logger.log(`OTP validated successfully for user: ${userId}`);
  }

  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    const bufferA = Buffer.from(a, 'utf8');
    const bufferB = Buffer.from(b, 'utf8');

    let result = 0;
    for (let i = 0; i < bufferA.length; i++) {
      result |= bufferA[i] ^ bufferB[i];
    }

    return result === 0;
  }

  async getRemainingAttempts(userId: string): Promise<number> {
    const { attemptsKey } = this.getOtpKeys(userId);
    const attempts = await this.redisService.get(attemptsKey);
    const attemptCount = attempts ? Number.parseInt(attempts, 10) : 0;
    return Math.max(0, this.MAX_ATTEMPTS - attemptCount);
  }

  async invalidateOtp(userId: string): Promise<void> {
    const { otpKey, attemptsKey, resendKey } = this.getOtpKeys(userId);
    await this.redisService.del(otpKey, attemptsKey, resendKey);
  }
}
