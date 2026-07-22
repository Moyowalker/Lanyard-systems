/**
 * Download a file from a same-origin BFF URL, surfacing failures instead of
 * silently opening a dead tab (the old `window.open` approach hid every error —
 * a 404/500 just rendered an empty page). Fetches the body, checks `res.ok`,
 * then triggers a browser download from the blob.
 *
 * Throws an Error with a human-readable message on failure so callers can show it.
 */
export async function downloadFile(url: string, fallbackName = 'download'): Promise<void> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.error?.message ?? body?.message ?? message;
    } catch {
      // non-JSON error body — keep the status-based message
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get('content-disposition')) ?? fallbackName;
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Pull the filename out of a Content-Disposition header, if present. */
function filenameFromDisposition(disposition: string | null): string | undefined {
  if (!disposition) return undefined;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}
