import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

/**
 * Global BullMQ connection (Redis). Feature modules register their own queues via
 * `BullModule.registerQueue(...)` and add @Processor workers. In production the
 * `worker` process consumes these queues; in dev they are consumed in-process.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379'));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            ...(url.password ? { password: url.password } : {}),
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
