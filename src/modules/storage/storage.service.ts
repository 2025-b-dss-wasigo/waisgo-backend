import { ConfigService } from '@nestjs/config'; // TODO: Implementar Audit y logger correctamente - Audit-Actions.enum.ts y error-mmessages.constant.ts
import { Injectable, Optional } from '@nestjs/common';
import { StorageProvider } from './Interface/storage.interface';
import { MinioStorageService } from './minio.storage.service';
import { OciStorageService } from './oci.storage.service';

@Injectable()
export class StorageService implements StorageProvider {
  private readonly provider: StorageProvider;

  constructor(
    private readonly config: ConfigService,
    private readonly minio: MinioStorageService,
    @Optional() private readonly oci: OciStorageService | null,
  ) {
    this.provider =
      this.config.get('STORAGE_DRIVER') === 'oci' && this.oci
        ? this.oci
        : this.minio;
  }

  upload(params) {
    return this.provider.upload(params);
  }

  getSignedUrl(bucket: string, objectPath: string, expires?: number) {
    return this.provider.getSignedUrl(bucket, objectPath, expires);
  }
}
