import { ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Connection } from 'mongoose';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  function controller(mongoReadyState: number, waitUntilReady: jest.Mock) {
    const connection = { readyState: mongoReadyState } as Connection;
    const queue = { waitUntilReady } as unknown as Queue;
    return new HealthController(connection, queue);
  }

  it('reports ready when MongoDB and Redis are available', async () => {
    await expect(controller(1, jest.fn().mockResolvedValue('PONG')).ready()).resolves.toEqual({
      status: 'ok',
      mongo: 'up',
      redis: 'up',
    });
  });

  it('reports unavailable before checking Redis when MongoDB is down', async () => {
    const waitUntilReady = jest.fn();

    await expect(controller(0, waitUntilReady).ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(waitUntilReady).not.toHaveBeenCalled();
  });

  it('reports unavailable when Redis is down', async () => {
    const health = controller(1, jest.fn().mockRejectedValue(new Error('unavailable')));

    await expect(health.ready()).rejects.toMatchObject({
      response: { status: 'unavailable', mongo: 'up', redis: 'down' },
    });
  });
});
