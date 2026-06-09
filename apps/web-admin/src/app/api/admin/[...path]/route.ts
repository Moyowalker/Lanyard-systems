import { NextRequest } from 'next/server';
import { proxy, relay } from '@/lib/proxy';

/**
 * Generic BFF proxy for all staff endpoints: forwards /api/admin/* (and query string)
 * to the API's /admin/* with the staff bearer token attached. One handler covers
 * prescription queue/verify, order list/transition, signed-URL file access, etc.
 */
function target(path: string[], req: NextRequest): string {
  const search = req.nextUrl.search ?? '';
  return `/admin/${path.join('/')}${search}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return relay(await proxy(target(path, req)));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const body = await req.text();
  return relay(await proxy(target(path, req), { method: 'POST', body: body || undefined }));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const body = await req.text();
  return relay(await proxy(target(path, req), { method: 'PUT', body: body || undefined }));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const body = await req.text();
  return relay(await proxy(target(path, req), { method: 'PATCH', body: body || undefined }));
}
