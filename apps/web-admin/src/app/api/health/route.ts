import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/config';

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/health/ready`, { cache: 'no-store' });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          title: 'Backend unavailable',
          message: body?.error?.message ?? 'The API health check failed.',
        },
        { status: res.status },
      );
    }

    return NextResponse.json({
      ok: true,
      title: 'Backend online',
      message: 'Authentication and admin APIs are reachable.',
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        title: 'Backend unavailable',
        message: `Start the API on ${API_URL} before signing in.`,
      },
      { status: 503 },
    );
  }
}
