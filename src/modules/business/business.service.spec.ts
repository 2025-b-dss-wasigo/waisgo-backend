import { NotFoundException } from '@nestjs/common';
import { BusinessService } from './business.service';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';
import * as publicIdUtil from '../common/utils/public-id.util';

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
  const authUserRepo = {
    update: jest.fn(),
  };
  const storageService = {
    getSignedUrl: jest.fn(),
    upload: jest.fn(),
  };
  const configService = {
    getOrThrow: jest.fn(),
    get: jest.fn(),
  };
  const auditService = {
    logEvent: jest.fn(),
  };
  const redisService = {
    revokeUserSessions: jest.fn(),
  };

  const context: AuthContext = { ip: '127.0.0.1', userAgent: 'jest' };

  let service: BusinessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BusinessService(
      businessUserRepo as never,
      profileRepo as never,
      authUserRepo as never,
      storageService as never,
      configService as never,
      auditService as never,
      redisService as never,
    );
  });

  it('throws when profile is missing in updateProfile', async () => {
    profileRepo.findOne.mockResolvedValue(null);

    await expect(
      service.updateProfile('user-id', { nombre: 'Test' }, context),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates business user from auth data', async () => {
    businessUserRepo.create.mockImplementation((input) => ({ ...input }));
    profileRepo.create.mockImplementation((input) => ({ ...input }));
    businessUserRepo.save.mockResolvedValue({});

    const idSpy = jest
      .spyOn(publicIdUtil, 'generatePublicId')
      .mockResolvedValue('USR_123');

    const result = await service.createFromAuth('user-id', {
      email: 'user@epn.edu.ec',
      nombre: 'Ana',
      apellido: 'Perez',
      celular: '0999999999',
    });

    expect(result.publicId).toBe('USR_123');
    expect(result.alias).toMatch(/^Pasajero/);
    expect(businessUserRepo.save).toHaveBeenCalled();

    idSpy.mockRestore();
  });

  it('creates business user with manager', async () => {
    const manager = {
      getRepository: jest.fn(() => ({ findOne: jest.fn() })),
      create: jest.fn().mockImplementation((_entity, input) => ({ ...input })),
      save: jest.fn().mockResolvedValue({}),
    };

    const idSpy = jest
      .spyOn(publicIdUtil, 'generatePublicId')
      .mockResolvedValue('USR_456');

    const result = await service.createFromAuthWithManager(
      manager as never,
      'user-id',
      {
        email: 'user@epn.edu.ec',
        nombre: 'Ana',
        apellido: 'Perez',
        celular: '0999999999',
      },
    );

    expect(result.publicId).toBe('USR_456');
    expect(manager.save).toHaveBeenCalled();

    idSpy.mockRestore();
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

  it('returns alias when profile name is missing', async () => {
    businessUserRepo.findOne.mockResolvedValue({
      alias: 'Alias',
      profile: null,
    });

    const name = await service.getDisplayName('user-id');

    expect(name).toBe('Alias');
  });

  it('throws when user is missing in getMyProfile', async () => {
    businessUserRepo.findOne.mockResolvedValue(null);

    await expect(service.getMyProfile('user-id')).rejects.toThrow(
      ErrorMessages.USER.PROFILE_NOT_FOUND,
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

  it('returns profile with stored avatar url when available', async () => {
    businessUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      publicId: 'USR_123',
      alias: 'Alias',
      email: 'test@epn.edu.ec',
      profile: {
        nombre: 'Ana',
        apellido: 'Perez',
        celular: '123',
        fotoPerfilUrl: 'avatars/user.jpg',
        ratingPromedio: 5,
        totalViajes: 0,
      },
    });
    configService.getOrThrow.mockReturnValue('bucket');
    storageService.getSignedUrl.mockResolvedValue('stored-url');

    const profile = await service.getMyProfile('user-id');

    expect(profile.avatarUrl).toBe('stored-url');
  });

  it('throws when profile is missing in updateProfilePhoto', async () => {
    profileRepo.findOne.mockResolvedValue(null);

    await expect(
      service.updateProfilePhoto(
        'user-id',
        {
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
          mimetype: 'image/jpeg',
          size: 100,
        } as Express.Multer.File,
        context,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('softDeleteUser logs audit when user is deleted', async () => {
    businessUserRepo.update.mockResolvedValue({ affected: 1 });

    await service.softDeleteUser('user-id', context);

    expect(auditService.logEvent).toHaveBeenCalled();
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
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        mimetype: 'image/jpeg',
        size: 100,
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
