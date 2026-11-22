import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  button,
  cleanSubject,
  bearer,
  deliveryWindow,
  esc,
  idempotencyKey,
  isChag,
  shortHash,
  isEmail,
  isFromAddress,
  normalizeSiteUrl,
  pageUrl,
  resendRequest,
  tomorrowInIsrael,
  weekday,
} from '../supabase/functions/_shared/logic';

const hours = {
  deliveryFrom: '17:00',
  deliveryTo: '19:00',
  earlyFrom: '11:00',
  earlyTo: '13:00',
  inIsrael: true,
};

describe('Resend request', () => {
  it('posts to the send-email endpoint with an array recipient and an idempotency key', () => {
    const req = resendRequest({
      apiKey: 're_test',
      from: 'Neighbors <meals@example.com>',
      to: 'cook@example.com',
      subject: 'Hello\nthere',
      html: '<p>Hi</p>',
      idempotencyKey: 'reminder/abc',
    });
    expect(req.url).toBe('https://api.resend.com/emails');
    expect(req.method).toBe('POST');
    expect(req.headers.Authorization).toBe('Bearer re_test');
    expect(req.headers['Content-Type']).toBe('application/json');
    expect(req.headers['Idempotency-Key']).toBe('reminder/abc');
    expect(JSON.parse(req.body)).toEqual({
      from: 'Neighbors <meals@example.com>',
      to: ['cook@example.com'],
      subject: 'Hello there',
      html: '<p>Hi</p>',
    });
    expect(req.body).not.toContain('re_test');
  });

  it('omits the idempotency header when there is no key', () => {
    const req = resendRequest({
      apiKey: 're_test',
      from: 'meals@example.com',
      to: 'cook@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
    });
    expect(req.headers['Idempotency-Key']).toBeUndefined();
  });
});

describe('email addresses and tokens', () => {
  it('accepts a bare address and a named sender', () => {
    expect(isEmail('Cook@example.com')).toBe(true);
    expect(isEmail('not an email')).toBe(false);
    expect(isEmail('a@b')).toBe(false);
    expect(isFromAddress('Neighbors for Neighbors <meals@example.com>')).toBe(true);
    expect(isFromAddress('meals@example.com')).toBe(true);
    expect(isFromAddress('Neighbors <not-an-email>')).toBe(false);
  });

  it('reads only a well-formed bearer token', () => {
    expect(bearer(null)).toBe('');
    expect(bearer('Bearer abc123')).toBe('abc123');
    expect(bearer('bearer abc123 ')).toBe('abc123');
    expect(bearer('Basic abc123')).toBe('');
    expect(bearer('Bearer a b')).toBe('');
  });

  it('keeps idempotency keys inside the header and the length limit', async () => {
    expect(idempotencyKey(['meal-recover', 'a@b.com\r\nBcc: x', '2026-11-16'])).toBe('meal-recover/a@b.com__Bcc:_x/2026-11-16');
    expect(idempotencyKey(['x'.repeat(300)]).length).toBe(256);
    expect(await shortHash('board-a')).toMatch(/^[0-9a-f]{32}$/);
    expect(await shortHash('board-a')).toBe(await shortHash('board-a'));
    expect(await shortHash('board-a')).not.toBe(await shortHash('board-b'));
  });
});

describe('links and html', () => {
  it('strips a trailing slash and skips links when the public URL is missing', () => {
    expect(normalizeSiteUrl(' https://meals.example/ ')).toBe('https://meals.example');
    expect(pageUrl('https://meals.example', '/m/tok')).toBe('https://meals.example/m/tok');
    expect(pageUrl('', '/m/tok')).toBeNull();
    expect(button(null, 'Manage')).toBe('');
    expect(button('https://meals.example/m/a"b', 'Manage <board>')).toContain('href="https://meals.example/m/a&quot;b"');
    expect(button('https://meals.example/m/tok', 'Manage <board>')).toContain('Manage &lt;board&gt;');
  });

  it('escapes text that neighbors typed', () => {
    expect(esc(`<script>"&'</script>`)).toBe('&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
    expect(cleanSubject('  line\r\nbreak  ')).toBe('line break');
  });
});

describe('Israel delivery dates', () => {
  it('adds a calendar day across the daylight-saving transitions', () => {
    // 23:30 IST on 26 Mar 2026, the night before the clocks spring forward.
    // Adding 24 hours lands on 28 Mar; tomorrow is 27 Mar.
    expect(tomorrowInIsrael(new Date('2026-03-26T21:30:00Z'))).toBe('2026-03-27');
    // 00:30 IDT on 25 Oct 2026, just before the clocks fall back.
    // Adding 24 hours stays on 25 Oct; tomorrow is 26 Oct.
    expect(tomorrowInIsrael(new Date('2026-10-24T21:30:00Z'))).toBe('2026-10-26');
    expect(tomorrowInIsrael(new Date('2026-06-15T12:00:00Z'))).toBe('2026-06-16');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('uses the early window on Fridays and holiday eves, including diaspora Yom Tov', () => {
    expect(weekday('2026-09-11')).toBe(5);
    expect(isChag('2026-09-12', true)).toBe(true); // Rosh Hashana
    expect(isChag('2026-09-20', true)).toBe(false); // Erev Yom Kippur
    expect(isChag('2026-09-21', true)).toBe(true);
    expect(isChag('2026-09-27', true)).toBe(false); // Chol HaMoed in Israel
    expect(isChag('2026-09-27', false)).toBe(true); // Sukkot II abroad

    expect(deliveryWindow('2026-09-14', hours)).toBe('17:00–19:00');
    expect(deliveryWindow('2026-09-11', hours)).toBe('11:00–13:00');
    expect(deliveryWindow('2026-09-20', hours)).toBe('11:00–13:00');
    expect(deliveryWindow('2026-09-26', hours)).toBe('17:00–19:00');
    expect(deliveryWindow('2026-09-26', { ...hours, inIsrael: false })).toBe('11:00–13:00');
  });
});

describe('branding', () => {
  it('uses the current name and purple', async () => {
    const { layout, button: btn } = await import('../supabase/functions/_shared/logic');
    expect(layout('<p>x</p>')).toContain('שכנות למען שכנות');
    expect(btn('https://x.example', 'Go')).toContain('#7B4FB8');
  });
});
