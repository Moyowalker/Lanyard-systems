import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../../core/auth/auth.decorators';

/**
 * Liveness vs readiness probes for the orchestrator / load balancer.
 *  - /health/live  : process is up (does not check dependencies)
 *  - /health/ready : dependencies (Mongo) are reachable; 503 otherwise
 */
@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('live')
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  ready() {
    const mongoUp = this.connection.readyState === 1; // 1 = connected
    if (!mongoUp) {
      throw new ServiceUnavailableException({ status: 'unavailable', mongo: 'down' });
    }
    return { status: 'ok', mongo: 'up' };
  }
}
