import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Gate every page behind a staff session cookie; /login and /api are exempt. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }
  if (!req.cookies.get('lny_at')?.value) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
