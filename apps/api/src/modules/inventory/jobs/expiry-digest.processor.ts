import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { BranchStatus } from '@lanyard/contracts';

import { InventoryService } from '../application/inventory.service';
import { Branch } from '../../branch/infrastructure/branch.schema';
import { EmailChannel } from '../../notification/application/channels/email.channel';
import { EXPIRY_DIGEST_QUEUE } from '../../../core/queue/queue.constants';

/** Daily sweep; batches expiring within this window make the digest. */
const INTERVAL_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WINDOW_DAYS = 30;
const REPEAT_JOB_NAME = 'expiry-digest';

/**
 * Daily expiring-stock digest per branch, emailed to the branch mailbox
 * (`branch.contact.email`). Deliberately bypasses NotificationService — that path
 * resolves recipients from the Customer collection, and this alert is staff-facing.
 * Registered as a BullMQ repeatable job (idempotent across processes), mirroring
 * the payment-reconcile sweep.
 */
@Processor(EXPIRY_DIGEST_QUEUE)
export class ExpiryDigestProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ExpiryDigestProcessor.name);

  constructor(
    @InjectQueue(EXPIRY_DIGEST_QUEUE) private readonly queue: Queue,
    @InjectModel(Branch.name) private readonly branchModel: Model<Branch>,
    private readonly inventory: InventoryService,
    private readonly email: EmailChannel,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      REPEAT_JOB_NAME,
      {},
      { repeat: { every: INTERVAL_MS }, removeOnComplete: true, removeOnFail: 50 },
    );
    this.logger.log(`Expiry digest scheduled every ${INTERVAL_MS / 3_600_000}h`);
  }

  async process(): Promise<void> {
    try {
      await this.sweep();
    } catch (err) {
      // Never let a digest sweep crash the worker; the next tick retries.
      this.logger.error(`Expiry digest sweep failed: ${(err as Error).message}`);
    }
  }

  /** One digest email per active branch that has expiring stock and a mailbox. */
  async sweep(): Promise<{ branchesChecked: number; emailsSent: number }> {
    const branches = await this.branchModel
      .find({ status: BranchStatus.ACTIVE })
      .select('name contact.email')
      .lean<Array<{ _id: unknown; name: string; contact?: { email?: string } }>>();

    let emailsSent = 0;
    for (const branch of branches) {
      const expiring = await this.inventory.listExpiring(String(branch._id), EXPIRY_WINDOW_DAYS);
      if (expiring.length === 0) continue;

      const to = branch.contact?.email;
      if (!to) {
        this.logger.warn(
          `Branch "${branch.name}" has ${expiring.length} expiring item(s) but no contact email — digest skipped`,
        );
        continue;
      }

      const lines = expiring.map((row) => {
        const expiry = row.nextExpiry ? row.nextExpiry.slice(0, 10) : 'unknown date';
        return `• ${row.productName} — ${row.onHand} on hand, earliest batch expires ${expiry}`;
      });
      await this.email.send({
        to,
        subject: `⚠ ${expiring.length} medicine(s) expiring within ${EXPIRY_WINDOW_DAYS} days — ${branch.name}`,
        text: [
          `The following stock at ${branch.name} expires within ${EXPIRY_WINDOW_DAYS} days:`,
          '',
          ...lines,
          '',
          'Review them under Inventory in the pharmacy console to adjust, return, or run promotions before the stock is lost.',
        ].join('\n'),
      });
      emailsSent += 1;
    }

    if (emailsSent > 0) {
      this.logger.log(`Expiry digest sent for ${emailsSent}/${branches.length} branch(es)`);
    }
    return { branchesChecked: branches.length, emailsSent };
  }
}
