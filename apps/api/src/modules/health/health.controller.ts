import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectConnection } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Connection } from 'mongoose';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../../core/auth/auth.decorators';
import { NOTIFICATION_QUEUE } from '../../core/queue/queue.constants';

/**
 * Liveness vs readiness probes for the orchestrator / load balancer.
 *  - /health/live  : process is up (does not check dependencies)
 *  - /health/ready : required data and queue dependencies are reachable; 503 otherwise
 */
@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notificationQueue: Queue,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  async ready() {
    const mongoUp = this.connection.readyState === 1; // 1 = connected
    if (!mongoUp) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        mongo: 'down',
        redis: 'unknown',
      });
    }

    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.notificationQueue.waitUntilReady(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Redis readiness timed out')), 2_000);
        }),
      ]);
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        mongo: 'up',
        redis: 'down',
      });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    return { status: 'ok', mongo: 'up', redis: 'up' };
  }
}
