export interface StoredFile {
  nombre: string;
  url: string;
}

export interface StorageProvider {
  save(input: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    folder?: string;
  }): Promise<StoredFile>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
