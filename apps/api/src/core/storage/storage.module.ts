import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/** Global object-storage access (S3/MinIO). */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
