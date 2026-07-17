import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdirSync, promises as fs } from 'fs';
import { join } from 'path';
import type { StorageProvider, StoredFile } from './storage.interface.js';

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
    const filename = `${randomUUID()}.pdf`;
    await fs.writeFile(join(dir, filename), input.buffer);
    return {
      nombre: input.originalName,
      url: `/uploads/${folder}/${filename}`,
    };
  }
}
