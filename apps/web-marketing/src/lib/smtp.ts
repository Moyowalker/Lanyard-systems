import net from 'node:net';
import { randomUUID } from 'node:crypto';

interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export async function sendSmtpEmail(input: SendEmailInput): Promise<{ providerRef: string }> {
  const host = process.env.SMTP_HOST ?? 'localhost';
  const port = Number(process.env.SMTP_PORT ?? '1025');
  const from = process.env.SMTP_FROM ?? 'no-reply@lanyard.test';
  const messageId = `${randomUUID()}@lanyard`;
  const replyToHeader = input.replyTo ? `Reply-To: ${input.replyTo}\r\n` : '';

  const message =
    `From: Lanyard Pharmacy <${from}>\r\n` +
    `To: ${input.to}\r\n` +
    replyToHeader +
    `Message-ID: <${messageId}>\r\n` +
    `Subject: ${input.subject}\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
    `${input.text}\r\n.`;

  const conversation = [`EHLO lanyard`, `MAIL FROM:<${from}>`, `RCPT TO:<${input.to}>`, `DATA`];

  return new Promise<{ providerRef: string }>((resolve, reject) => {
    const socket = net.createConnection(port, host);
    socket.setEncoding('utf8');
    socket.setTimeout(10_000);

    let stage = 0;
    let buffer = '';
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
        return;
      }
      resolve({ providerRef: messageId });
    };

    socket.on('error', finish);
    socket.on('timeout', () => finish(new Error('SMTP timeout')));
    socket.on('data', (chunk: string) => {
      buffer += chunk;

      let idx: number;
      while ((idx = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        if (line[3] === '-') continue;

        const code = Number(line.slice(0, 3));
        if (stage === 0) {
          if (code !== 220) return finish(new Error(line));
          socket.write(conversation[0] + '\r\n');
          stage = 1;
        } else if (stage >= 1 && stage <= 3) {
          if (code !== 250) return finish(new Error(line));
          socket.write(conversation[stage] + '\r\n');
          stage += 1;
        } else if (stage === 4) {
          if (code !== 354) return finish(new Error(line));
          socket.write(message + '\r\n');
          stage = 5;
        } else if (stage === 5) {
          if (code !== 250) return finish(new Error(line));
          socket.write('QUIT\r\n');
          finish();
        }
      }
    });
  });
}
