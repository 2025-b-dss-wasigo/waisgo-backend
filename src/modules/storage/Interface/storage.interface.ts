export interface StorageProvider {
  upload(params: {
    bucket: string;
    folder: string;
    filename: string;
    buffer: Buffer;
    mimetype: string;
  }): Promise<string>;

  getSignedUrl(
    bucket: string,
    objectPath: string,
    expiresInSeconds?: number,
  ): Promise<string>;
}
