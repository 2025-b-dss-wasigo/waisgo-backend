import { ForbiddenException } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { EstadoConductorEnum, TipoDocumentoEnum } from './Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';
import * as publicIdUtil from '../common/utils/public-id.util';

describe('DriversService', () => {
  const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const driverRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const documentRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const businessUserRepo = {
    findOne: jest.fn(),
  };
  const storageService = {
    getSignedUrl: jest.fn(),
    upload: jest.fn(),
  };
  const auditService = {
    logEvent: jest.fn(),
  };
  const mailService = {
    sendDriverApplicationNotification: jest.fn(),
  };
  const authService = {
    getAdminEmails: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };

  const identityResolver = {
    resolveAuthUserId: jest.fn(),
    resolveBusinessUserId: jest.fn(),
  };

  const authUserRepo = {
    findOne: jest.fn(),
  };

  const context: AuthContext = { ip: '127.0.0.1', userAgent: 'jest' };

  let service: DriversService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockReturnValue(null);
    service = new DriversService(
      driverRepo as never,
      documentRepo as never,
      businessUserRepo as never,
      authUserRepo as never,
      storageService as never,
      auditService as never,
      mailService as never,
      authService as never,
      configService as never,
      identityResolver as never,
    );
  });

  it('returns empty status when driver does not exist', async () => {
    driverRepo.findOne.mockResolvedValue(null);

    const result = await service.getMyDriverStatus('user-id');

    expect(result).toEqual({
      hasApplication: false,
      driver: null,
      documents: [],
      vehicles: [],
      canUploadDocuments: false,
      canReapply: false,
    });
  });

  it('calculates reapply status and signs documents', async () => {
    const driver = {
      id: 'driver-id',
      estado: EstadoConductorEnum.RECHAZADO,
      fechaRechazo: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      documents: [{ id: 'doc-1', archivoUrl: 'doc.pdf' }],
      vehicles: [],
    };
    driverRepo.findOne.mockResolvedValue(driver);
    configService.get.mockReturnValue('bucket');
    storageService.getSignedUrl.mockResolvedValue('signed-url');

    const result = await service.getMyDriverStatus('user-id');

    expect(result.hasApplication).toBe(true);
    expect(result.canReapply).toBe(false);
    expect(result.daysUntilReapply).toBeGreaterThan(0);
    expect(result.documents[0].signedUrl).toBe('signed-url');
  });

  it('returns empty signed urls when bucket is missing', async () => {
    driverRepo.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.PENDIENTE,
      documents: [{ id: 'doc-1', archivoUrl: 'doc.pdf' }],
      vehicles: [],
    });
    configService.get.mockReturnValue(null);

    const result = await service.getMyDriverStatus('user-id');

    expect(result.documents[0].signedUrl).toBe('');
    expect(result.canUploadDocuments).toBe(true);
  });

  it('throws when file is missing', async () => {
    await expect(
      service.uploadDocument(
        'user-id',
        TipoDocumentoEnum.LICENCIA,
        undefined as never,
        context,
      ),
    ).rejects.toThrow(ErrorMessages.DRIVER.FILE_REQUIRED);
  });

  it('throws when file is too large', async () => {
    const file = {
      size: 2 * 1024 * 1024 + 1,
      mimetype: 'image/png',
      buffer: pngBuffer,
    } as Express.Multer.File;

    await expect(
      service.uploadDocument(
        'user-id',
        TipoDocumentoEnum.LICENCIA,
        file,
        context,
      ),
    ).rejects.toThrow(ErrorMessages.DRIVER.FILE_TOO_LARGE);
  });

  it('throws when mime type is invalid', async () => {
    const file = {
      size: 100,
      mimetype: 'text/plain',
      buffer: Buffer.from('x'),
    } as Express.Multer.File;

    await expect(
      service.uploadDocument(
        'user-id',
        TipoDocumentoEnum.LICENCIA,
        file,
        context,
      ),
    ).rejects.toThrow(ErrorMessages.DRIVER.INVALID_FILE_FORMAT);
  });

  it('throws when driver is approved and tries to upload', async () => {
    const file = {
      size: 100,
      mimetype: 'image/png',
      buffer: pngBuffer,
    } as Express.Multer.File;
    driverRepo.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });

    await expect(
      service.uploadDocument(
        'user-id',
        TipoDocumentoEnum.LICENCIA,
        file,
        context,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws when driver is rejected and tries to upload', async () => {
    const file = {
      size: 100,
      mimetype: 'image/png',
      buffer: pngBuffer,
    } as Express.Multer.File;
    driverRepo.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.RECHAZADO,
    });

    await expect(
      service.uploadDocument(
        'user-id',
        TipoDocumentoEnum.LICENCIA,
        file,
        context,
      ),
    ).rejects.toThrow(ErrorMessages.DRIVER.CANNOT_UPLOAD_WHEN_REJECTED);
  });

  it('throws when business user is missing on apply', async () => {
    businessUserRepo.findOne.mockResolvedValue(null);

    await expect(
      service.applyAsDriver('user-id', 'driver@epn.edu.ec', context),
    ).rejects.toThrow(ErrorMessages.USER.NOT_FOUND);
  });

  it('rejects when a request is already pending', async () => {
    businessUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      email: 'driver@epn.edu.ec',
      alias: 'Alias',
      profile: null,
    });
    driverRepo.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.PENDIENTE,
    });

    await expect(
      service.applyAsDriver('user-id', 'driver@epn.edu.ec', context),
    ).rejects.toThrow(ErrorMessages.DRIVER.REQUEST_PENDING);
  });

  it('rejects reapply when cooldown has not passed', async () => {
    const rejectedDriver = {
      id: 'driver-id',
      publicId: 'DRV_OLD',
      estado: EstadoConductorEnum.RECHAZADO,
      fechaRechazo: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    };
    businessUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      email: 'driver@epn.edu.ec',
      alias: 'Alias',
      profile: null,
    });
    driverRepo.findOne.mockResolvedValue(rejectedDriver);

    await expect(
      service.applyAsDriver('user-id', 'driver@epn.edu.ec', context),
    ).rejects.toThrow(ErrorMessages.DRIVER.REQUEST_REJECTED_COOLDOWN);
  });

  it('reapplies after rejection cooldown', async () => {
    const rejectedDriver = {
      id: 'driver-id',
      publicId: 'DRV_OLD',
      estado: EstadoConductorEnum.RECHAZADO,
      fechaRechazo: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    };
    businessUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      email: 'driver@epn.edu.ec',
      alias: 'Alias',
      profile: { nombre: 'Ana', apellido: 'Perez' },
    });
    driverRepo.findOne.mockResolvedValue(rejectedDriver);
    driverRepo.save.mockResolvedValue(rejectedDriver);
    authService.getAdminEmails.mockResolvedValue([]);

    const response = await service.applyAsDriver(
      'user-id',
      'driver@epn.edu.ec',
      context,
    );

    expect(response).toEqual({
      message: ErrorMessages.DRIVER.APPLICATION_RESUBMITTED,
      driverId: 'DRV_OLD',
    });
    expect(rejectedDriver.estado).toBe(EstadoConductorEnum.PENDIENTE);
    expect(auditService.logEvent).toHaveBeenCalled();
  });

  it('creates a new driver application', async () => {
    businessUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      email: 'driver@epn.edu.ec',
      alias: 'Alias',
      profile: { nombre: 'Ana', apellido: 'Perez' },
    });
    driverRepo.findOne.mockResolvedValue(null);
    driverRepo.create.mockImplementation((input) => ({ ...input }));
    driverRepo.save.mockImplementation(async (input) => ({
      ...input,
      id: 'driver-id',
      publicId: 'DRV_NEW',
    }));
    authService.getAdminEmails.mockResolvedValue([]);

    const publicIdSpy = jest
      .spyOn(publicIdUtil, 'generatePublicId')
      .mockResolvedValue('DRV_NEW');

    const response = await service.applyAsDriver(
      'user-id',
      'driver@epn.edu.ec',
      context,
    );

    expect(response).toEqual({
      message: ErrorMessages.DRIVER.APPLICATION_SUBMITTED,
      driverId: 'DRV_NEW',
    });
    expect(auditService.logEvent).toHaveBeenCalled();

    publicIdSpy.mockRestore();
  });

  it('uploads a new document when driver is pending', async () => {
    const file = {
      size: 100,
      mimetype: 'image/png',
      buffer: pngBuffer,
    } as Express.Multer.File;
    driverRepo.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.PENDIENTE,
    });
    configService.get.mockReturnValue('bucket');
    storageService.upload.mockResolvedValue('driver/doc.png');
    documentRepo.findOne.mockResolvedValue(null);
    documentRepo.create.mockImplementation((input) => ({ ...input }));
    documentRepo.save.mockResolvedValue({
      id: 'doc-id',
      publicId: 'DOC_123',
    });

    const publicIdSpy = jest
      .spyOn(publicIdUtil, 'generatePublicId')
      .mockResolvedValue('DOC_123');

    const response = await service.uploadDocument(
      'user-id',
      TipoDocumentoEnum.LICENCIA,
      file,
      context,
    );

    expect(response).toEqual({
      message: ErrorMessages.DRIVER.DOCUMENT_UPLOADED,
      documentId: 'DOC_123',
    });
    expect(auditService.logEvent).toHaveBeenCalled();

    publicIdSpy.mockRestore();
  });
});
