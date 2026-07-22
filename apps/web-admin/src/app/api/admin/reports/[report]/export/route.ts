import { NextRequest, NextResponse } from 'next/server';
import { proxy } from '@/lib/proxy';

const ALLOWED = new Set([
  'sales-summary',
  'inventory-valuation',
  'consumption',
  'low-stock',
  'expiring',
]);

/**
 * Dedicated BFF for report exports. Passes the binary spreadsheet body and the
 * attachment headers through unchanged (the generic admin relay would JSON-ify it).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  if (!ALLOWED.has(report)) {
    return NextResponse.json({ error: { message: 'Unknown report' } }, { status: 404 });
  }

  const search = req.nextUrl.search ?? '';
  const upstream = await proxy(`/admin/reports/${report}/export${search}`);

  if (!upstream.ok) {
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition':
        upstream.headers.get('content-disposition') ?? `attachment; filename="${report}.xlsx"`,
    },
  });
}
