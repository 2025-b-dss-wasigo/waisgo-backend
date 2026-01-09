/**
 * Servicio de negocio del modulo storage.
 */

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
import { ErrorMessages } from '../common/constants/error-messages.constant';

@Injectable()
export class MinioStorageService implements OnModuleInit, StorageProvider {
  private client: Client;
  private publicEndpoint: string;
  private internalEndpoint: string;
  private port: number;
  private useSSL: boolean;
  private accessKey: string;
  private secretKey: string;
  private readonly logger = new Logger(MinioStorageService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.internalEndpoint =
      this.configService.getOrThrow<string>('MINIO_ENDPOINT');
    this.port = Number(this.configService.getOrThrow('MINIO_PORT'));
    this.useSSL = this.configService.get<boolean>('MINIO_USE_SSL', false);
    this.publicEndpoint =
      this.configService.get<string>('MINIO_PUBLIC_ENDPOINT') ??
      this.internalEndpoint;
    this.accessKey = this.configService.getOrThrow('MINIO_ACCESS_KEY');
    this.secretKey = this.configService.getOrThrow('MINIO_SECRET_KEY');

    // Cliente interno para operaciones (upload, etc.)
    this.client = new Client({
      endPoint: this.internalEndpoint,
      port: this.port,
      useSSL: this.useSSL,
      accessKey: this.accessKey,
      secretKey: this.secretKey,
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
      throw new InternalServerErrorException(
        ErrorMessages.STORAGE.UPLOAD_FAILED,
      );
    }
  }

  async getSignedUrl(
    bucket: string,
    objectPath: string,
    expires = 3600,
  ): Promise<string> {
    if (this.publicEndpoint === this.internalEndpoint) {
      return this.client.presignedGetObject(bucket, objectPath, expires);
    }

    const protocol = this.useSSL ? 'https' : 'http';
    const port = this.port === (this.useSSL ? 443 : 80) ? '' : `:${this.port}`;
    this.logger.warn(
      `Using public URL without signature for ${bucket}/${objectPath}. ` +
        `Bucket must be configured as public.`,
    );
    return `${protocol}://${this.publicEndpoint}${port}/${bucket}/${objectPath}`;
  }
}
