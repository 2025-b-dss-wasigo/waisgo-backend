import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../Models/auth-user.entity';
import { BusinessService } from '../../business/business.service';
import { EstadoVerificacionEnum } from '../Enum/estado-ver.enum';

@Injectable()
export class CleanupUnverifiedUsersJob {
  private readonly logger = new Logger('CleanupUnverifiedUsersJob');

  constructor(
    @InjectRepository(AuthUser)
    private readonly authUsersRepo: Repository<AuthUser>,
    private readonly businessService: BusinessService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleCleanup() {
    this.logger.log('Iniciando limpieza de usuarios no verificados...');

    try {
      const days =
        this.configService.get<number>('CLEANUP_UNVERIFIED_DAYS') || 3;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const users = await this.authUsersRepo.find({
        where: {
          estadoVerificacion: EstadoVerificacionEnum.NO_VERIFICADO,
          createdAt: LessThan(cutoff),
        },
        select: ['id'],
      });

      if (users.length === 0) {
        this.logger.log(
          'Limpieza completada: No se encontraron usuarios para eliminar.',
        );
        return;
      }

      for (const user of users) {
        await this.businessService.softDeleteUser(user.id);
      }

      this.logger.log(
        `Limpieza completada: ${users.length} usuarios marcados como eliminados.`,
      );
    } catch (error) {
      this.logger.error(
        'Error durante el Cron Job de limpieza',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
