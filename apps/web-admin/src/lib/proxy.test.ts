import { describe, expect, it } from 'vitest';

import { relay } from './proxy';

describe('relay', () => {
  it('relays a 204 response without constructing an invalid body', async () => {
    const response = await relay(new Response(null, { status: 204 }));

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    await expect(response.text()).resolves.toBe('');
  });

  it('preserves JSON response status, body, and content type', async () => {
    const response = await relay(
      Response.json({ error: { message: 'No longer held' } }, { status: 409 }),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ error: { message: 'No longer held' } });
  });
});