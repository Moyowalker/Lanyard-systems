import type { PosSaleDto } from '@lanyard/contracts';

import {
  listQueuedSales,
  removeQueuedSale,
  saveSyncedSale,
  updateQueuedSale,
  type OfflineQueuedSale,
} from './vault';

export interface SyncResult {
  synced: PosSaleDto[];
  conflicts: OfflineQueuedSale[];
  sessionExpired: boolean;
}

function errorMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: { message?: string } }).error;
    if (error?.message) return error.message;
  }
  return 'The sale could not be synchronized';
}

export async function syncOfflineSales(
  fetcher: typeof fetch = fetch,
): Promise<SyncResult> {
  const result: SyncResult = { synced: [], conflicts: [], sessionExpired: false };
  const queue = (await listQueuedSales()).sort((left, right) =>
    left.capturedAt.localeCompare(right.capturedAt),
  );

  for (const queued of queue) {
    if (queued.status === 'conflict') {
      result.conflicts.push(queued);
      continue;
    }

    const attempting: OfflineQueuedSale = {
      ...queued,
      status: 'syncing',
      attempts: queued.attempts + 1,
      lastAttemptAt: new Date().toISOString(),
    };
    await updateQueuedSale(attempting);

    let response: Response;
    try {
      response = await fetcher('/api/admin/pos/sales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(attempting.request),
      });
    } catch {
      await updateQueuedSale({ ...attempting, status: 'pending' });
      break;
    }

    const body = (await response.json().catch(() => null)) as PosSaleDto | null;
    if (response.ok && body) {
      await saveSyncedSale({ id: attempting.id, syncedAt: new Date().toISOString(), sale: body });
      await removeQueuedSale(attempting.id);
      result.synced.push(body);
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      await updateQueuedSale({ ...attempting, status: 'pending' });
      result.sessionExpired = true;
      break;
    }
    if (response.status >= 500 || response.status === 429) {
      await updateQueuedSale({ ...attempting, status: 'pending' });
      break;
    }

    const error = body as unknown as { error?: { code?: string; details?: unknown } } | null;
    const conflict: OfflineQueuedSale = {
      ...attempting,
      status: 'conflict',
      conflict: {
        message: errorMessage(body),
        code: error?.error?.code,
        details: error?.error?.details,
      },
    };
    await updateQueuedSale(conflict);
    result.conflicts.push(conflict);
  }

  return result;
}