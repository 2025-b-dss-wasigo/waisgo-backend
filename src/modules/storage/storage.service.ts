/**
 * Servicio de negocio del modulo storage.
 */

import { ConfigService } from '@nestjs/config';
import { Injectable, Optional, Logger } from '@nestjs/common';
import { StorageProvider } from './Interface/storage.interface';
import { MinioStorageService } from './minio.storage.service';
import { OciStorageService } from './oci.storage.service';

@Injectable()
export class StorageService implements StorageProvider {
  private readonly provider: StorageProvider;
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly minio: MinioStorageService,
    @Optional() private readonly oci: OciStorageService | null,
  ) {
    this.provider =
      this.config.get('STORAGE_DRIVER') === 'oci' && this.oci
        ? this.oci
        : this.minio;

    this.logger.log(
      `Storage provider selected: ${this.provider.constructor.name}`,
    );
  }

  upload(params) {
    return this.provider.upload(params);
  }

  getSignedUrl(bucket: string, objectPath: string, expires?: number) {
    return this.provider.getSignedUrl(bucket, objectPath, expires);
  }
}
