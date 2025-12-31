import {
  buildIdWhere,
  generatePublicId,
  isPublicId,
  isUuid,
  isValidIdentifier,
} from './public-id.util';

const uuid = '11111111-2222-3333-4444-555555555555';
const publicId = 'PAY_ABCDEFGH';

describe('public-id utils', () => {
  const originalAllow = process.env.ALLOW_UUID_IDENTIFIERS;

  afterEach(() => {
    if (originalAllow === undefined) {
      delete process.env.ALLOW_UUID_IDENTIFIERS;
    } else {
      process.env.ALLOW_UUID_IDENTIFIERS = originalAllow;
    }
  });

  it('validates uuid and publicId when uuid identifiers are enabled', () => {
    process.env.ALLOW_UUID_IDENTIFIERS = 'true';

    expect(isUuid(uuid)).toBe(true);
    expect(isPublicId(publicId)).toBe(true);
    expect(isValidIdentifier(uuid)).toBe(true);
    expect(isValidIdentifier(publicId)).toBe(true);
  });

  it('rejects uuid when uuid identifiers are disabled', () => {
    process.env.ALLOW_UUID_IDENTIFIERS = 'false';

    expect(isValidIdentifier(uuid)).toBe(false);
    expect(isValidIdentifier(publicId)).toBe(true);
  });

  it('builds a lookup for publicId only when identifier is publicId', () => {
    const result = buildIdWhere<{ id: string; publicId: string }>(publicId);
    expect(result).toEqual([{ publicId }]);
  });

  it('builds a lookup for id and publicId when identifier is uuid', () => {
    const result = buildIdWhere<{ id: string; publicId: string }>(uuid);
    expect(result).toEqual([{ id: uuid }, { publicId: uuid }]);
  });

  it('generates publicId with prefix', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const id = await generatePublicId(repo as never, 'PAY');

    expect(id).toMatch(/^PAY_[A-Z0-9]{8}$/);
    expect(repo.findOne).toHaveBeenCalled();
  });
});
