import { ConfigService } from '@nestjs/config';
import {
  Injectable,
  OnModuleInit,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { Client } from 'minio';
import * as path from 'node:path';
import { StorageProvider } from './Interface/storage.interface';

@Injectable()
export class MinioStorageService implements OnModuleInit, StorageProvider {
  private client: Client;
  private readonly logger = new Logger(MinioStorageService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.client = new Client({
      endPoint: this.configService.getOrThrow('MINIO_ENDPOINT'),
      port: Number(this.configService.getOrThrow('MINIO_PORT')),
      useSSL: this.configService.get('MINIO_USE_SSL') === 'true',
      accessKey: this.configService.getOrThrow('MINIO_ACCESS_KEY'),
      secretKey: this.configService.getOrThrow('MINIO_SECRET_KEY'),
    });
  }

  async upload(params): Promise<string> {
    const { bucket, folder, filename, buffer, mimetype } = params;
    const safeFilename = filename.replaceAll(/\s+/g, '_');
    const objectPath = path.posix.join(folder, safeFilename);

    try {
      await this.client.putObject(bucket, objectPath, buffer, buffer.length, {
        'Content-Type': mimetype,
      });

      return objectPath;
    } catch (error) {
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('Error al subir el archivo');
    }
  }

  async getSignedUrl(
    bucket: string,
    objectPath: string,
    expires = 3600,
  ): Promise<string> {
    return this.client.presignedGetObject(bucket, objectPath, expires);
  }
}
