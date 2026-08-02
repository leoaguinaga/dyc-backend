import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdirSync, promises as fs } from 'fs';
import { join } from 'path';
import type { StorageProvider, StoredFile } from './storage.interface.js';

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir = join(process.cwd(), 'uploads');

  async save(input: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    folder?: string;
  }): Promise<StoredFile> {
    const folder = input.folder ?? 'requerimientos';
    const dir = join(this.baseDir, folder);
    mkdirSync(dir, { recursive: true });
    const extension = EXTENSION_BY_MIME_TYPE[input.mimeType] ?? 'bin';
    const filename = `${randomUUID()}.${extension}`;
    await fs.writeFile(join(dir, filename), input.buffer);
    return {
      nombre: input.originalName,
      url: `/uploads/${folder}/${filename}`,
    };
  }
}
