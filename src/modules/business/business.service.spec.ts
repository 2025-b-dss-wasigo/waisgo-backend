import { NotFoundException } from '@nestjs/common';
import { BusinessService } from './business.service';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';

describe('BusinessService', () => {
  const businessUserRepo = {
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
  };
  const profileRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };
  const storageService = {
    getSignedUrl: jest.fn(),
    upload: jest.fn(),
  };
  const configService = {
    getOrThrow: jest.fn(),
  };
  const auditService = {
    logEvent: jest.fn(),
  };

  const context: AuthContext = { ip: '127.0.0.1', userAgent: 'jest' };

  let service: BusinessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BusinessService(
      businessUserRepo as never,
      profileRepo as never,
      storageService as never,
      configService as never,
      auditService as never,
    );
  });

  it('throws when profile is missing in updateProfile', async () => {
    profileRepo.findOne.mockResolvedValue(null);

    await expect(
      service.updateProfile('user-id', { nombre: 'Test' }, context),
    ).rejects.toThrow(NotFoundException);
  });

  it('updates profile fields and logs audit', async () => {
    const profile = { nombre: 'A', apellido: 'B', celular: '123' };
    profileRepo.findOne.mockResolvedValue(profile);
    profileRepo.save.mockResolvedValue(profile);

    const response = await service.updateProfile(
      'user-id',
      { nombre: 'Nuevo' },
      context,
    );

    expect(response).toEqual({
      message: ErrorMessages.USER.PROFILE_UPDATED,
    });
    expect(profile.nombre).toBe('Nuevo');
    expect(auditService.logEvent).toHaveBeenCalled();
  });

  it('returns Usuario when display name not found', async () => {
    businessUserRepo.findOne.mockResolvedValue(null);

    const name = await service.getDisplayName('user-id');

    expect(name).toBe('Usuario');
  });

  it('returns full name when profile exists', async () => {
    businessUserRepo.findOne.mockResolvedValue({
      alias: 'Alias',
      profile: { nombre: 'Ana', apellido: 'Perez' },
    });

    const name = await service.getDisplayName('user-id');

    expect(name).toBe('Ana Perez');
  });

  it('throws when user is missing in getMyProfile', async () => {
    businessUserRepo.findOne.mockResolvedValue(null);

    await expect(service.getMyProfile('user-id')).rejects.toThrow(
      ErrorMessages.USER.NOT_FOUND,
    );
  });

  it('returns profile with default avatar', async () => {
    businessUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      publicId: 'USR_123',
      alias: 'Alias',
      email: 'test@epn.edu.ec',
      profile: {
        nombre: 'Ana',
        apellido: 'Perez',
        celular: '123',
        fotoPerfilUrl: null,
        ratingPromedio: 5,
        totalViajes: 0,
      },
    });
    configService.getOrThrow.mockReturnValue('bucket');
    storageService.getSignedUrl.mockResolvedValue('signed-url');

    const profile = await service.getMyProfile('user-id');

    expect(profile.avatarUrl).toBe('signed-url');
  });

  it('updates profile photo', async () => {
    profileRepo.findOne.mockResolvedValue({
      userId: 'user-id',
      fotoPerfilUrl: null,
    });
    storageService.upload.mockResolvedValue('avatars/user.jpg');

    const response = await service.updateProfilePhoto(
      'user-id',
      {
        buffer: Buffer.from('file'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File,
      context,
    );

    expect(response).toEqual({
      message: ErrorMessages.USER.PROFILE_PHOTO_UPDATED,
    });
    expect(profileRepo.save).toHaveBeenCalled();
    expect(auditService.logEvent).toHaveBeenCalled();
  });
});
