import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import { randomInt } from 'node:crypto';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class OtpService {
  private readonly OTP_TTL = 15 * 60; // 15 minutos
  private readonly MAX_ATTEMPTS = 3;
  private readonly MAX_RESENDS = 3;

  constructor(private readonly redisService: RedisService) {}

  private get redis() {
    return this.redisService.getClient();
  }

  generateOtp(): string {
    return randomInt(100000, 999999).toString();
  }

  async sendOtp(
    userId: string,
  ): Promise<{ code: string; expiresInMinutes: number }> {
    const resendKey = `otp:verify:resend:${userId}`;
    const resendCount = Number(await this.redis.get(resendKey)) || 0;

    if (resendCount >= this.MAX_RESENDS) {
      throw new ForbiddenException('Límite de reenvíos alcanzado');
    }

    const otp = this.generateOtp();

    const pipeline = this.redis.pipeline();
    pipeline.set(`otp:verify:${userId}`, otp, 'EX', this.OTP_TTL);
    pipeline.set(`otp:verify:attempts:${userId}`, 0, 'EX', this.OTP_TTL);
    pipeline.set(resendKey, resendCount + 1, 'EX', 24 * 60 * 60);
    await pipeline.exec();

    return {
      code: otp,
      expiresInMinutes: Math.floor(this.OTP_TTL / 60),
    };
  }

  async validateOtp(userId: string, code: string): Promise<void> {
    const storedOtp = await this.redis.get(`otp:verify:${userId}`);

    if (!storedOtp) {
      throw new BadRequestException('OTP expirado o inválido');
    }

    if (storedOtp !== code) {
      const attemptsKey = `otp:verify:attempts:${userId}`;
      const attempts = Number(await this.redis.incr(attemptsKey));

      if (attempts >= this.MAX_ATTEMPTS) {
        await this.redis.del(`otp:verify:${userId}`);
        throw new ForbiddenException('Demasiados intentos fallidos');
      }

      throw new BadRequestException('OTP incorrecto');
    }

    await this.redis.del(
      `otp:verify:${userId}`,
      `otp:verify:attempts:${userId}`,
    );
  }
}
