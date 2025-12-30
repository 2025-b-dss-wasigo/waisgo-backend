import { Module } from '@nestjs/common';
import { MinioStorageService } from './minio.storage.service';
import { OciStorageService } from './oci.storage.service';
import { StorageService } from './storage.service';
import { ConfigService } from '@nestjs/config';

@Module({
  providers: [
    MinioStorageService,
    {
      provide: OciStorageService,
      useFactory: (config: ConfigService) => {
        if (config.get('STORAGE_DRIVER') === 'oci') {
          return new OciStorageService(config);
        }
        return null;
      },
      inject: [ConfigService],
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
