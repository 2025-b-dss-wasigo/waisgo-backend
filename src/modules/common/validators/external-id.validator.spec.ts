import { validate } from 'class-validator';
import {
  IsExternalIdentifier,
  IsUserIdentifier,
} from './external-id.validator';

class ExternalIdDto {
  @IsExternalIdentifier()
  value: string;
}

class UserIdDto {
  @IsUserIdentifier()
  value: string;
}

class LimitedAliasDto {
  @IsUserIdentifier(undefined, 5)
  value: string;
}

const uuid = '11111111-2222-3333-4444-555555555555';
const publicId = 'RTE_ABCDEFGH';
const alias = 'pepito';

describe('external id validators', () => {
  const originalAllow = process.env.ALLOW_UUID_IDENTIFIERS;

  afterEach(() => {
    if (originalAllow === undefined) {
      delete process.env.ALLOW_UUID_IDENTIFIERS;
    } else {
      process.env.ALLOW_UUID_IDENTIFIERS = originalAllow;
    }
  });

  it('accepts public ids for external identifiers', async () => {
    const dto = new ExternalIdDto();
    dto.value = publicId;

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects aliases for external identifiers', async () => {
    const dto = new ExternalIdDto();
    dto.value = alias;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts aliases for user identifiers', async () => {
    process.env.ALLOW_UUID_IDENTIFIERS = 'false';

    const dto = new UserIdDto();
    dto.value = alias;

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects uuid for user identifiers when uuid identifiers are disabled', async () => {
    process.env.ALLOW_UUID_IDENTIFIERS = 'false';

    const dto = new UserIdDto();
    dto.value = uuid;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts uuid for external identifiers when enabled', async () => {
    process.env.ALLOW_UUID_IDENTIFIERS = 'true';

    const dto = new ExternalIdDto();
    dto.value = uuid;

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects long aliases for user identifiers', async () => {
    process.env.ALLOW_UUID_IDENTIFIERS = 'false';

    const dto = new LimitedAliasDto();
    dto.value = 'too-long-alias';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects non-string identifiers', async () => {
    const dto = new UserIdDto();
    (dto as { value: unknown }).value = 1234;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
