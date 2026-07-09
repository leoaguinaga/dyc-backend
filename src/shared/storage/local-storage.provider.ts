import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdirSync, promises as fs } from 'fs';
import { join } from 'path';
import type { StorageProvider, StoredFile } from './storage.interface.js';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly dir = join(process.cwd(), 'uploads', 'requerimientos');

  constructor() {
    mkdirSync(this.dir, { recursive: true });
  }

  async save(input: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }): Promise<StoredFile> {
    const filename = `${randomUUID()}.pdf`;
    await fs.writeFile(join(this.dir, filename), input.buffer);
    return { nombre: input.originalName, url: `/uploads/requerimientos/${filename}` };
  }
}
