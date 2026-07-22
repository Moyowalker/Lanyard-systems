'use client';

import { useCallback, useState } from 'react';

import { downloadFile } from './download';

/**
 * Wrap {@link downloadFile} with error + busy state so export buttons can surface a
 * failure inline instead of silently opening a dead tab.
 */
export function useFileDownload() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const download = useCallback(async (url: string, fallbackName?: string) => {
    setError(null);
    setBusy(true);
    try {
      await downloadFile(url, fallbackName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }, []);

  return { download, error, busy };
}
