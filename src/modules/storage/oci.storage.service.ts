import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider } from './Interface/storage.interface';
import * as common from 'oci-common';
import * as objectstorage from 'oci-objectstorage';
import * as path from 'node:path';

@Injectable()
export class OciStorageService implements StorageProvider {
  private readonly client: objectstorage.ObjectStorageClient;
  private readonly namespace: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    const provider = new common.ConfigFileAuthenticationDetailsProvider(
      this.configService.getOrThrow('OCI_CONFIG_PATH'),
      this.configService.getOrThrow('OCI_CONFIG_PROFILE'),
    );

    this.client = new objectstorage.ObjectStorageClient({
      authenticationDetailsProvider: provider,
    });

    this.namespace = this.configService.getOrThrow('OCI_NAMESPACE');
    this.region = this.configService.getOrThrow('OCI_REGION');
  }

  async upload(params): Promise<string> {
    const { bucket, folder, filename, buffer, mimetype } = params;

    const safeFilename = filename.replaceAll(/\s+/g, '_');
    const objectName = path.posix.join(folder, safeFilename);

    await this.client.putObject({
      namespaceName: this.namespace,
      bucketName: bucket,
      objectName,
      putObjectBody: buffer,
      contentType: mimetype,
    });

    return objectName;
  }

  async getSignedUrl(
    bucket: string,
    objectPath: string,
    expires = 3600,
  ): Promise<string> {
    const response = await this.client.createPreauthenticatedRequest({
      namespaceName: this.namespace,
      bucketName: bucket,
      createPreauthenticatedRequestDetails: {
        name: `par-${Date.now()}`,
        objectName: objectPath,
        accessType:
          objectstorage.models.CreatePreauthenticatedRequestDetails.AccessType
            .AnyObjectRead,
        timeExpires: new Date(Date.now() + expires * 1000),
      },
    });

    return `https://objectstorage.${this.region}.oraclecloud.com${response.preauthenticatedRequest.accessUri}`;
  }
}
