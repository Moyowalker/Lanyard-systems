import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import { PaymentService } from '../application/payment.service';
import { PAYMENT_RECONCILE_QUEUE } from '../../../core/queue/queue.constants';

/** How often to sweep PENDING intents for missed webhooks. */
const INTERVAL_MS = 5 * 60_000;
const REPEAT_JOB_NAME = 'reconcile';

/**
 * Periodically reconciles payment intents stuck PENDING (a webhook we never received).
 * Registers a single BullMQ repeatable job on boot — adding the same repeat config from
 * multiple processes is idempotent (deduped by repeat key), and BullMQ guarantees each
 * scheduled run is processed once across the web + worker dynos. The work itself
 * (`PaymentService.reconcile`) is already idempotent and a no-op under the dev mock provider.
 */
@Processor(PAYMENT_RECONCILE_QUEUE)
export class PaymentReconcileProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PaymentReconcileProcessor.name);

  constructor(
    @InjectQueue(PAYMENT_RECONCILE_QUEUE) private readonly queue: Queue,
    private readonly payments: PaymentService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      REPEAT_JOB_NAME,
      {},
      { repeat: { every: INTERVAL_MS }, removeOnComplete: true, removeOnFail: 50 },
    );
    this.logger.log(`Payment reconciliation scheduled every ${INTERVAL_MS / 1000}s`);
  }

  async process(): Promise<void> {
    try {
      const result = await this.payments.reconcile();
      if (result.settled > 0) {
        this.logger.log(
          `Reconciliation settled ${result.settled}/${result.checked} pending intent(s)`,
        );
      }
    } catch (err) {
      // Never let a reconciliation sweep crash the worker; the next tick retries.
      this.logger.error(`Reconciliation sweep failed: ${(err as Error).message}`);
    }
  }
}
