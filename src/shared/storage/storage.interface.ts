export interface StoredFile {
  nombre: string;
  url: string;
}

export interface StorageProvider {
  save(input: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }): Promise<StoredFile>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
