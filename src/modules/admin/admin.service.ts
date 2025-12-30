import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { Driver } from '../drivers/Models/driver.entity';
import { DriverDocument } from '../drivers/Models/driver-document.entity';
import { AuthUser } from '../auth/Models/auth-user.entity';
import { EstadoConductorEnum } from '../drivers/Enums/estado-conductor.enum';
import { EstadoDocumentoEnum } from '../drivers/Enums/estado-documento.enum';
import { RolUsuarioEnum } from '../auth/Enum/users-roles.enum';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/Enums/audit-actions.enum';
import { AuditResult } from '../audit/Enums/audit-result.enum';
import { MailService } from '../mail/mail.service';
import { StorageService } from '../storage/storage.service';
import type { AuthContext } from '../common/types/auth-context.type';
import { ErrorMessages } from '../common/constants/error-messages.constant';

export interface DocumentWithSignedUrl {
  id: string;
  tipo: string;
  archivoUrl: string;
  signedUrl: string;
  estado: EstadoDocumentoEnum;
  motivoRechazo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DriverListItem {
  id: string;
  userId: string;
  paypalEmail: string;
  estado: EstadoConductorEnum;
  fechaSolicitud: Date;
  userName?: string;
  userEmail?: string;
  documentsCount: number;
  pendingDocuments: number;
}

export interface DriverDetailResponse {
  driver: Driver;
  documentsWithUrls: DocumentWithSignedUrl[];
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(DriverDocument)
    private readonly documentRepo: Repository<DriverDocument>,
    @InjectRepository(AuthUser)
    private readonly authUserRepo: Repository<AuthUser>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Lista todas las solicitudes de conductores
   */
  async getAllDrivers(
    estado?: EstadoConductorEnum,
  ): Promise<{ drivers: DriverListItem[]; total: number }> {
    const queryBuilder = this.driverRepo
      .createQueryBuilder('driver')
      .leftJoinAndSelect('driver.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('driver.documents', 'documents')
      .orderBy('driver.fechaSolicitud', 'DESC');

    if (estado) {
      queryBuilder.where('driver.estado = :estado', { estado });
    }

    const drivers = await queryBuilder.getMany();

    const driverList: DriverListItem[] = drivers.map((driver) => ({
      id: driver.id,
      userId: driver.userId,
      paypalEmail: driver.paypalEmail,
      estado: driver.estado,
      fechaSolicitud: driver.fechaSolicitud,
      userName: driver.user?.profile
        ? `${driver.user.profile.nombre} ${driver.user.profile.apellido}`
        : undefined,
      userEmail: driver.user?.email,
      documentsCount: driver.documents?.length || 0,
      pendingDocuments:
        driver.documents?.filter(
          (d) => d.estado === EstadoDocumentoEnum.PENDIENTE,
        ).length || 0,
    }));

    return {
      drivers: driverList,
      total: driverList.length,
    };
  }

  /**
   * Obtiene el detalle de una solicitud de conductor con URLs firmadas
   */
  async getDriverDetail(driverId: string): Promise<DriverDetailResponse> {
    const driver = await this.driverRepo.findOne({
      where: { id: driverId },
      relations: ['user', 'user.profile', 'documents', 'vehicles'],
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.ADMIN.DRIVER_REQUEST_NOT_FOUND);
    }

    const documentsWithUrls = await this.generateSignedUrlsForDocuments(
      driver.documents || [],
    );

    return {
      driver,
      documentsWithUrls,
    };
  }

  /**
   * Genera URLs firmadas para los documentos
   */
  private async generateSignedUrlsForDocuments(
    documents: DriverDocument[],
  ): Promise<DocumentWithSignedUrl[]> {
    const bucket = this.configService.get('STORAGE_DRIVER_BUCKET');

    if (!bucket) {
      return documents.map((doc) => ({
        id: doc.id,
        tipo: doc.tipo,
        archivoUrl: doc.archivoUrl,
        signedUrl: '',
        estado: doc.estado,
        motivoRechazo: doc.motivoRechazo,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));
    }

    return Promise.all(
      documents.map(async (doc) => {
        let signedUrl = '';
        try {
          signedUrl = await this.storageService.getSignedUrl(
            bucket,
            doc.archivoUrl,
            3600, // 1 hora
          );
        } catch (error) {
          this.logger.warn(
            `Failed to generate signed URL for document ${doc.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
          );
        }

        return {
          id: doc.id,
          tipo: doc.tipo,
          archivoUrl: doc.archivoUrl,
          signedUrl,
          estado: doc.estado,
          motivoRechazo: doc.motivoRechazo,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        };
      }),
    );
  }

  /**
   * Aprueba una solicitud de conductor
   */
  async approveDriver(
    driverId: string,
    adminUserId: string,
    context: AuthContext,
  ): Promise<{ message: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const driver = await queryRunner.manager.findOne(Driver, {
        where: { id: driverId },
        relations: ['documents', 'user', 'user.profile'],
      });

      if (!driver) {
        throw new NotFoundException(
          ErrorMessages.ADMIN.DRIVER_REQUEST_NOT_FOUND,
        );
      }

      if (driver.estado !== EstadoConductorEnum.PENDIENTE) {
        throw new BadRequestException(
          ErrorMessages.ADMIN.ONLY_PENDING_CAN_APPROVE,
        );
      }

      const pendingDocs = driver.documents?.filter(
        (d) => d.estado !== EstadoDocumentoEnum.APROBADO,
      );

      if (pendingDocs && pendingDocs.length > 0) {
        throw new BadRequestException(
          ErrorMessages.ADMIN.ALL_DOCUMENTS_REQUIRED,
        );
      }

      driver.estado = EstadoConductorEnum.APROBADO;
      driver.fechaAprobacion = new Date();
      await queryRunner.manager.save(driver);

      const authUser = await queryRunner.manager.findOne(AuthUser, {
        where: { id: driver.userId },
      });

      if (authUser) {
        authUser.rol = RolUsuarioEnum.CONDUCTOR;
        await queryRunner.manager.save(authUser);
      }

      await queryRunner.commitTransaction();

      await this.auditService.logEvent({
        action: AuditAction.DRIVER_APPLICATION_APPROVED,
        userId: adminUserId,
        result: AuditResult.SUCCESS,
        ipAddress: context.ip,
        userAgent: context.userAgent,
        metadata: { driverId, driverUserId: driver.userId },
      });

      // Enviar notificación al conductor
      await this.notifyDriverApproved(driver, authUser);

      this.logger.log(`Driver approved: ${driverId} by admin ${adminUserId}`);

      return {
        message: ErrorMessages.ADMIN.DRIVER_APPROVED,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Rechaza una solicitud de conductor
   */
  async rejectDriver(
    driverId: string,
    motivo: string,
    adminUserId: string,
    context: AuthContext,
  ): Promise<{ message: string }> {
    if (!motivo || motivo.trim().length < 10) {
      throw new BadRequestException(
        ErrorMessages.ADMIN.REJECTION_REASON_REQUIRED,
      );
    }

    const driver = await this.driverRepo.findOne({
      where: { id: driverId },
      relations: ['user', 'user.profile'],
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.ADMIN.DRIVER_REQUEST_NOT_FOUND);
    }

    if (driver.estado !== EstadoConductorEnum.PENDIENTE) {
      throw new BadRequestException(
        ErrorMessages.ADMIN.ONLY_PENDING_CAN_REJECT,
      );
    }

    driver.estado = EstadoConductorEnum.RECHAZADO;
    driver.motivoRechazo = motivo.trim();
    driver.fechaRechazo = new Date();
    await this.driverRepo.save(driver);

    await this.auditService.logEvent({
      action: AuditAction.DRIVER_APPLICATION_REJECTED,
      userId: adminUserId,
      result: AuditResult.SUCCESS,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      metadata: { driverId, motivo },
    });

    // Enviar notificación al conductor
    await this.notifyDriverRejected(driver, motivo.trim());

    this.logger.log(`Driver rejected: ${driverId} by admin ${adminUserId}`);

    return {
      message: ErrorMessages.ADMIN.DRIVER_REJECTED,
    };
  }

  /**
   * Suspende un conductor
   */
  async suspendDriver(
    driverId: string,
    adminUserId: string,
    context: AuthContext,
  ): Promise<{ message: string }> {
    const driver = await this.driverRepo.findOne({
      where: { id: driverId },
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.DRIVER_NOT_FOUND);
    }

    if (driver.estado !== EstadoConductorEnum.APROBADO) {
      throw new BadRequestException(
        ErrorMessages.ADMIN.ONLY_APPROVED_CAN_SUSPEND,
      );
    }

    driver.estado = EstadoConductorEnum.SUSPENDIDO;
    await this.driverRepo.save(driver);

    await this.auditService.logEvent({
      action: AuditAction.ADMIN_USER_SUSPENSION,
      userId: adminUserId,
      result: AuditResult.SUCCESS,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      metadata: { driverId, driverUserId: driver.userId },
    });

    this.logger.log(`Driver suspended: ${driverId} by admin ${adminUserId}`);

    return {
      message: ErrorMessages.ADMIN.DRIVER_SUSPENDED,
    };
  }

  /**
   * Aprueba un documento de conductor
   */
  async approveDocument(
    documentId: string,
    adminUserId: string,
    context: AuthContext,
  ): Promise<{ message: string }> {
    const document = await this.documentRepo.findOne({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(ErrorMessages.ADMIN.DOCUMENT_NOT_FOUND);
    }

    document.estado = EstadoDocumentoEnum.APROBADO;
    document.motivoRechazo = null;
    await this.documentRepo.save(document);

    await this.auditService.logEvent({
      action: AuditAction.DRIVER_APPLICATION_APPROVED,
      userId: adminUserId,
      result: AuditResult.SUCCESS,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      metadata: { documentId, action: 'document_approved' },
    });

    return {
      message: ErrorMessages.ADMIN.DOCUMENT_APPROVED,
    };
  }

  /**
   * Rechaza un documento de conductor
   */
  async rejectDocument(
    documentId: string,
    motivo: string,
    adminUserId: string,
    context: AuthContext,
  ): Promise<{ message: string }> {
    const document = await this.documentRepo.findOne({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(ErrorMessages.ADMIN.DOCUMENT_NOT_FOUND);
    }

    document.estado = EstadoDocumentoEnum.RECHAZADO;
    document.motivoRechazo = motivo;
    await this.documentRepo.save(document);

    await this.auditService.logEvent({
      action: AuditAction.DRIVER_APPLICATION_REJECTED,
      userId: adminUserId,
      result: AuditResult.SUCCESS,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      metadata: { documentId, motivo, action: 'document_rejected' },
    });

    return {
      message: ErrorMessages.ADMIN.DOCUMENT_REJECTED,
    };
  }

  /**
   * Notifica al conductor que su solicitud fue aprobada
   */
  private async notifyDriverApproved(
    driver: Driver,
    authUser: AuthUser | null,
  ): Promise<void> {
    try {
      if (!authUser) {
        this.logger.warn(`AuthUser not found for driver ${driver.id}`);
        return;
      }

      const driverName = driver.user?.profile
        ? `${driver.user.profile.nombre} ${driver.user.profile.apellido}`
        : 'Conductor';

      await this.mailService.sendDriverApprovedNotification({
        to: authUser.email,
        driverName,
      });

      this.logger.log(`Approval notification sent to driver ${driver.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to send approval notification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Notifica al conductor que su solicitud fue rechazada
   */
  private async notifyDriverRejected(
    driver: Driver,
    rejectionReason: string,
  ): Promise<void> {
    try {
      const authUser = await this.authUserRepo.findOne({
        where: { id: driver.userId },
      });

      if (!authUser) {
        this.logger.warn(`AuthUser not found for driver ${driver.id}`);
        return;
      }

      const driverName = driver.user?.profile
        ? `${driver.user.profile.nombre} ${driver.user.profile.apellido}`
        : 'Conductor';

      await this.mailService.sendDriverRejectedNotification({
        to: authUser.email,
        driverName,
        rejectionReason,
      });

      this.logger.log(`Rejection notification sent to driver ${driver.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to send rejection notification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
