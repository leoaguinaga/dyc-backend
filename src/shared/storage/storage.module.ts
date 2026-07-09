import { Module } from '@nestjs/common';
import { LocalStorageProvider } from './local-storage.provider.js';
import { STORAGE_PROVIDER } from './storage.interface.js';

@Module({
  providers: [{ provide: STORAGE_PROVIDER, useClass: LocalStorageProvider }],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
