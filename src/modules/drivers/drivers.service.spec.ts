import { ForbiddenException } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { EstadoConductorEnum, TipoDocumentoEnum } from './Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';

describe('DriversService', () => {
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

  const context: AuthContext = { ip: '127.0.0.1', userAgent: 'jest' };

  let service: DriversService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockReturnValue(null);
    service = new DriversService(
      driverRepo as never,
      documentRepo as never,
      businessUserRepo as never,
      storageService as never,
      auditService as never,
      mailService as never,
      authService as never,
      configService as never,
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
      buffer: Buffer.from('x'),
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
      buffer: Buffer.from('x'),
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
});
