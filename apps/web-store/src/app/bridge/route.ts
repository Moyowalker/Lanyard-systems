import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { COOKIE } from '@/lib/config';

function normalizePath(rawPath?: string | null): string {
  if (!rawPath || !rawPath.startsWith('/') || rawPath.startsWith('//')) {
    return '/';
  }

  return rawPath;
}

/**
 * Marketing-to-store handoff. Optionally persists a branch selection, then redirects into the
 * store so the customer arrives in the right browsing context.
 */
export async function GET(req: NextRequest) {
  const branchId = req.nextUrl.searchParams.get('branchId');
  const source = req.nextUrl.searchParams.get('source');
  const intent = req.nextUrl.searchParams.get('intent');
  const targetPath = normalizePath(req.nextUrl.searchParams.get('path'));

  const destination = new URL(targetPath, req.nextUrl.origin);
  if (source) destination.searchParams.set('source', source);
  if (intent) destination.searchParams.set('intent', intent);

  const response = NextResponse.redirect(destination);

  if (branchId) {
    const jar = await cookies();
    jar.set(COOKIE.branch, branchId, {
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 90,
    });
  }

  return response;
}