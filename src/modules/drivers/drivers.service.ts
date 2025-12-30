import { ConfigService } from '@nestjs/config';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Driver } from './Models/driver.entity';
import { DriverDocument } from './Models/driver-document.entity';
import { Vehicle } from './Models/vehicle.entity';
import { BusinessUser } from '../business/Models/business-user.entity';
import { EstadoConductorEnum } from './Enums/estado-conductor.enum';
import { EstadoDocumentoEnum } from './Enums/estado-documento.enum';
import { TipoDocumentoEnum } from './Enums/tipo-documento.enum';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/Enums/audit-actions.enum';
import { AuditResult } from '../audit/Enums/audit-result.enum';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import type { AuthContext } from '../common/types/auth-context.type';
import { ErrorMessages } from '../common/constants/error-messages.constant';

export interface DriverDocumentWithUrl extends DriverDocument {
  signedUrl: string;
}

export interface DriverStatusResponse {
  hasApplication: boolean;
  driver: Driver | null;
  documents: DriverDocumentWithUrl[];
  vehicles: Vehicle[];
  canUploadDocuments: boolean;
  canReapply: boolean;
  daysUntilReapply?: number;
}

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);
  private readonly MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
  private readonly ALLOWED_MIMES = [
    'image/png',
    'image/jpeg',
    'application/pdf',
  ];
  private readonly REJECTION_COOLDOWN_DAYS = 7;

  constructor(
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(DriverDocument)
    private readonly documentRepo: Repository<DriverDocument>,
    @InjectRepository(BusinessUser)
    private readonly businessUserRepo: Repository<BusinessUser>,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Aplica para ser conductor
   */
  async applyAsDriver(
    userId: string,
    paypalEmail: string,
    context: AuthContext,
  ): Promise<{ message: string; driverId: string }> {
    const businessUser = await this.businessUserRepo.findOne({
      where: { id: userId, isDeleted: false },
      relations: ['profile'],
    });

    if (!businessUser) {
      throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
    }

    const existingDriver = await this.driverRepo.findOne({
      where: { userId },
    });

    if (existingDriver) {
      if (existingDriver.estado === EstadoConductorEnum.PENDIENTE) {
        throw new ConflictException(ErrorMessages.DRIVER.REQUEST_PENDING);
      }

      if (existingDriver.estado === EstadoConductorEnum.APROBADO) {
        throw new ConflictException(
          ErrorMessages.DRIVER.ONLY_PASSENGERS_CAN_REQUEST,
        );
      }

      if (existingDriver.estado === EstadoConductorEnum.RECHAZADO) {
        const daysSinceRejection = existingDriver.fechaRechazo
          ? Math.floor(
              (Date.now() - existingDriver.fechaRechazo.getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : 0;

        if (daysSinceRejection < this.REJECTION_COOLDOWN_DAYS) {
          throw new BadRequestException(
            ErrorMessages.DRIVER.REQUEST_REJECTED_COOLDOWN,
          );
        }

        existingDriver.estado = EstadoConductorEnum.PENDIENTE;
        existingDriver.paypalEmail = paypalEmail;
        existingDriver.motivoRechazo = null;
        existingDriver.fechaRechazo = null;
        await this.driverRepo.save(existingDriver);

        await this.auditService.logEvent({
          action: AuditAction.DRIVER_APPLICATION_SUBMITTED,
          userId,
          result: AuditResult.SUCCESS,
          ipAddress: context.ip,
          userAgent: context.userAgent,
          metadata: { driverId: existingDriver.id, reapplication: true },
        });

        // Notificar a administradores
        await this.notifyAdminsAboutApplication(
          businessUser,
          paypalEmail,
          existingDriver.id,
        );

        return {
          message: ErrorMessages.DRIVER.APPLICATION_RESUBMITTED,
          driverId: existingDriver.id,
        };
      }
    }

    const driver = this.driverRepo.create({
      userId,
      paypalEmail,
      estado: EstadoConductorEnum.PENDIENTE,
    });

    const savedDriver = await this.driverRepo.save(driver);

    await this.auditService.logEvent({
      action: AuditAction.DRIVER_APPLICATION_SUBMITTED,
      userId,
      result: AuditResult.SUCCESS,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      metadata: { driverId: savedDriver.id },
    });

    // Notificar a administradores
    await this.notifyAdminsAboutApplication(
      businessUser,
      paypalEmail,
      savedDriver.id,
    );

    this.logger.log(`Driver application submitted for user ${userId}`);

    return {
      message: ErrorMessages.DRIVER.APPLICATION_SUBMITTED,
      driverId: savedDriver.id,
    };
  }

  /**
   * Obtiene el estado de la solicitud del conductor con URLs firmadas
   */
  async getMyDriverStatus(userId: string): Promise<DriverStatusResponse> {
    const driver = await this.driverRepo.findOne({
      where: { userId },
      relations: ['documents', 'vehicles'],
    });

    if (!driver) {
      return {
        hasApplication: false,
        driver: null,
        documents: [],
        vehicles: [],
        canUploadDocuments: false,
        canReapply: false,
      };
    }

    // Generar URLs firmadas para documentos
    const documentsWithUrls = await this.getDocumentsWithSignedUrls(
      driver.documents || [],
    );

    // Determinar si puede subir documentos
    const canUploadDocuments = driver.estado === EstadoConductorEnum.PENDIENTE;

    // Determinar si puede re-aplicar
    let canReapply = false;
    let daysUntilReapply: number | undefined;

    if (driver.estado === EstadoConductorEnum.RECHAZADO) {
      const { canApply, daysRemaining } = this.calculateReapplyStatus(driver);
      canReapply = canApply;
      daysUntilReapply = daysRemaining;
    }

    return {
      hasApplication: true,
      driver,
      documents: documentsWithUrls,
      vehicles: driver.vehicles || [],
      canUploadDocuments,
      canReapply,
      daysUntilReapply,
    };
  }

  /**
   * Calcula si el usuario puede re-aplicar y cuántos días faltan
   */
  private calculateReapplyStatus(driver: Driver): {
    canApply: boolean;
    daysRemaining: number;
  } {
    const daysSinceRejection = driver.fechaRechazo
      ? Math.floor(
          (Date.now() - driver.fechaRechazo.getTime()) / (1000 * 60 * 60 * 24),
        )
      : 0;

    const daysRemaining = Math.max(
      0,
      this.REJECTION_COOLDOWN_DAYS - daysSinceRejection,
    );

    return {
      canApply: daysSinceRejection >= this.REJECTION_COOLDOWN_DAYS,
      daysRemaining,
    };
  }

  /**
   * Genera URLs firmadas para una lista de documentos
   */
  private async getDocumentsWithSignedUrls(
    documents: DriverDocument[],
  ): Promise<DriverDocumentWithUrl[]> {
    const bucket = this.configService.get('STORAGE_DRIVER_BUCKET');

    if (!bucket) {
      return documents.map((doc) => ({ ...doc, signedUrl: '' }));
    }

    return Promise.all(
      documents.map(async (doc) => {
        let signedUrl = '';
        try {
          signedUrl = await this.storageService.getSignedUrl(
            bucket,
            doc.archivoUrl,
            3600, // 1 hora de expiración
          );
        } catch (error) {
          this.logger.warn(
            `Failed to generate signed URL for document ${doc.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
          );
        }

        return {
          ...doc,
          signedUrl,
        };
      }),
    );
  }

  /**
   * Sube un documento del conductor
   */
  async uploadDocument(
    userId: string,
    tipo: TipoDocumentoEnum,
    file: Express.Multer.File,
    context: AuthContext,
  ): Promise<{ message: string; documentId: string }> {
    if (!file) {
      throw new BadRequestException(ErrorMessages.DRIVER.FILE_REQUIRED);
    }

    if (file.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException(ErrorMessages.DRIVER.FILE_TOO_LARGE);
    }

    if (!this.ALLOWED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(ErrorMessages.DRIVER.INVALID_FILE_FORMAT);
    }

    const driver = await this.driverRepo.findOne({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.NO_DRIVER_REQUEST);
    }

    // Validar que solo se puedan subir documentos cuando está PENDIENTE
    if (driver.estado !== EstadoConductorEnum.PENDIENTE) {
      if (driver.estado === EstadoConductorEnum.RECHAZADO) {
        throw new ForbiddenException(
          ErrorMessages.DRIVER.CANNOT_UPLOAD_WHEN_REJECTED,
        );
      }
      if (driver.estado === EstadoConductorEnum.APROBADO) {
        throw new ForbiddenException(
          ErrorMessages.DRIVER.CANNOT_UPLOAD_WHEN_APPROVED,
        );
      }
      throw new ForbiddenException(
        ErrorMessages.DRIVER.CANNOT_UPLOAD_DOCUMENTS,
      );
    }

    const uploadResult = await this.storageService.upload({
      bucket: `${this.configService.get('STORAGE_DRIVER_BUCKET')}`,
      folder: `${driver.id}`,
      filename: tipo,
      buffer: file.buffer,
      mimetype: file.mimetype,
    });

    let document = await this.documentRepo.findOne({
      where: { driverId: driver.id, tipo },
    });

    if (document) {
      document.archivoUrl = uploadResult;
      document.estado = EstadoDocumentoEnum.PENDIENTE;
      document.motivoRechazo = null;
    } else {
      document = this.documentRepo.create({
        driverId: driver.id,
        tipo,
        archivoUrl: uploadResult,
        estado: EstadoDocumentoEnum.PENDIENTE,
      });
    }

    const savedDocument = await this.documentRepo.save(document);

    await this.auditService.logEvent({
      action: AuditAction.DRIVER_VEHICLE_UPDATE,
      userId,
      result: AuditResult.SUCCESS,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      metadata: { documentId: savedDocument.id, tipo },
    });

    this.logger.log(`Document ${tipo} uploaded for driver ${driver.id}`);

    return {
      message: ErrorMessages.DRIVER.DOCUMENT_UPLOADED,
      documentId: savedDocument.id,
    };
  }

  /**
   * Obtiene un conductor por ID (para admin)
   */
  async getDriverById(driverId: string): Promise<Driver> {
    const driver = await this.driverRepo.findOne({
      where: { id: driverId },
      relations: ['documents', 'vehicles', 'user', 'user.profile'],
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.DRIVER_NOT_FOUND);
    }

    return driver;
  }

  /**
   * Obtiene el driver por userId
   */
  async getDriverByUserId(userId: string): Promise<Driver | null> {
    return this.driverRepo.findOne({
      where: { userId },
      relations: ['documents', 'vehicles'],
    });
  }

  /**
   * Notifica a todos los administradores sobre una nueva solicitud
   */
  private async notifyAdminsAboutApplication(
    businessUser: BusinessUser,
    paypalEmail: string,
    driverId: string,
  ): Promise<void> {
    try {
      const adminEmails = await this.authService.getAdminEmails();

      if (adminEmails.length === 0) {
        this.logger.warn(
          'No admin emails found to notify about driver application',
        );
        return;
      }

      const applicantName = businessUser.profile
        ? `${businessUser.profile.nombre} ${businessUser.profile.apellido}`
        : businessUser.alias;

      await this.mailService.sendDriverApplicationNotification(adminEmails, {
        applicantName,
        applicantEmail: businessUser.email,
        paypalEmail,
        applicationDate: new Date().toLocaleDateString('es-EC', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      });

      this.logger.log(
        `Admin notification sent for driver application ${driverId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send admin notification for driver application: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
