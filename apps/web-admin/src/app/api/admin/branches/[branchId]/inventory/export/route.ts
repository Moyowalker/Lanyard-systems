import { NextRequest, NextResponse } from 'next/server';
import { proxy } from '@/lib/proxy';

/**
 * Dedicated BFF for the inventory export download. Unlike the generic admin proxy
 * (which relays everything as JSON text), this passes the binary spreadsheet body
 * and the upstream content-type / attachment headers through unchanged.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const format = req.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';
  const upstream = await proxy(`/admin/branches/${branchId}/inventory/export?format=${format}`);

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
        upstream.headers.get('content-disposition') ?? `attachment; filename="inventory.${format}"`,
    },
  });
}
