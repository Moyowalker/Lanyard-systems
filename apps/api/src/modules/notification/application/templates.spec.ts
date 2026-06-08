import { renderTemplate } from './templates';

describe('notification templates', () => {
  it('renders order.paid with order number, formatted total and name', () => {
    const msg = renderTemplate('order.paid', { orderNo: 'LNY-ABC123', totalKobo: 160000 }, 'Ada');
    expect(msg.subject).toMatch(/LNY-ABC123/);
    expect(msg.text).toMatch(/Hi Ada,/);
    expect(msg.text).toMatch(/₦1,600\.00/);
  });

  it('produces distinct verified vs rejected messages', () => {
    const ok = renderTemplate('rx.verified', {});
    const no = renderTemplate('rx.rejected', {});
    expect(ok.subject).toMatch(/verified/i);
    expect(no.subject).toMatch(/Action needed/i);
    expect(ok.text).not.toBe(no.text);
  });

  it('falls back for unknown templates', () => {
    const msg = renderTemplate('something.unknown', {});
    expect(msg.subject.length).toBeGreaterThan(0);
    expect(msg.text.length).toBeGreaterThan(0);
  });

  it('degrades gracefully without a name', () => {
    expect(renderTemplate('order.completed', { orderNo: 'LNY-1' }).text).toMatch(/Hi there,/);
  });
});
