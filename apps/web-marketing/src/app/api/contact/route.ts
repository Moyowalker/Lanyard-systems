import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/config';
import { sendSmtpEmail } from '@/lib/smtp';

export const runtime = 'nodejs';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: 'Send a valid JSON payload.' } }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const name = asString(payload.name);
  const email = asString(payload.email).toLowerCase();
  const topic = asString(payload.topic);
  const branch = asString(payload.branch);
  const message = asString(payload.message);

  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: { message: 'Enter a valid name.' } }, { status: 400 });
  }

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: { message: 'Enter a valid email address.' } },
      { status: 400 },
    );
  }

  if (message.length < 20 || message.length > 4000) {
    return NextResponse.json(
      { error: { message: 'Your message should be between 20 and 4000 characters.' } },
      { status: 400 },
    );
  }

  const recipient = process.env.CONTACT_TO ?? 'hello@lanyardpharmacy.com';
  const subject = `[Lanyard marketing] ${topic || 'General enquiry'} from ${name}`;
  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Topic: ${topic || 'General enquiry'}`,
    `Preferred branch: ${branch || 'Not provided'}`,
    '',
    message,
  ].join('\n');

  let leadId: string | null = null;

  try {
    const leadResponse = await fetch(`${API_URL}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        message,
        source: 'marketing-contact',
        topic: topic || 'General enquiry',
        branch: branch || undefined,
      }),
      cache: 'no-store',
    });

    if (leadResponse.ok) {
      const lead = (await leadResponse.json()) as { id?: string };
      leadId = lead.id ?? null;
    }
  } catch {
    leadId = null;
  }

  try {
    const result = await sendSmtpEmail({
      to: recipient,
      subject,
      text,
      replyTo: email,
    });

    return NextResponse.json({
      ok: true,
      leadId,
      providerRef: result.providerRef,
      message: 'Your message has been sent to the Lanyard team.',
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          message:
            'Contact delivery is unavailable right now. Please try again shortly or use the direct support details below.',
        },
      },
      { status: 503 },
    );
  }
}
