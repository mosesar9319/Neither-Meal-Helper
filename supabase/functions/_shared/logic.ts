// Pure helpers for the email functions. No Deno APIs, so Vitest can import this file.
// Hebcal is imported with a Deno npm: specifier; Vitest aliases it to the installed package.
import { HebrewCalendar, flags } from 'npm:@hebcal/core@6';

const EMAIL = /^[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+$/;

export function isEmail(value: string): boolean {
  const s = value.trim();
  return s.length >= 3 && s.length <= 200 && EMAIL.test(s);
}

/** `meals@example.com` or `Neighbors <meals@example.com>`. */
export function isFromAddress(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 320) return false;
  const angled = /^(.*)<([^<>]+)>\s*$/.exec(v);
  return isEmail((angled ? angled[2] : v).trim());
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function normalizeAppUrl(raw: string | undefined | null): string {
  return (raw ?? '').trim().replace(/\/+$/, '');
}

export function pageUrl(base: string, path: string): string | null {
  if (!base) return null;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function cleanSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
}

/** Header-safe idempotency key, capped at Resend's 256-character limit. */
export function idempotencyKey(parts: readonly string[]): string {
  const key = parts.join('/').replace(/[^\x21-\x7e]/g, '_').slice(0, 256);
  return key || 'email';
}

/** Stable id for an idempotency key. 32 hex characters. */
export async function shortHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/**
 * True when the request presents CRON_SECRET. The secret is not a Supabase JWT,
 * so send-reminders is deployed with verify_jwt = false and checks the secret itself.
 * A missing or very short secret never authorizes a call.
 */
export function cronAuthorized(
  headers: { authorization: string | null; cronSecret: string | null; apiKey: string | null },
  secret: string | undefined | null,
): boolean {
  if (!secret || secret.length < 16) return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(headers.authorization ?? '');
  const bearer = match?.[1] ?? '';
  return timingSafeEqual(bearer, secret) || timingSafeEqual(headers.cronSecret ?? '', secret) || timingSafeEqual(headers.apiKey ?? '', secret);
}

const SLOT_HE: Record<string, string> = { breakfast: 'ארוחת בוקר', lunch: 'ארוחת צהריים', dinner: 'ארוחת ערב' };
const SLOT_EN: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

export function slotLabel(slot: string) {
  return `${SLOT_HE[slot] ?? slot} · ${SLOT_EN[slot] ?? slot}`;
}

export function dateLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  const he = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
  const en = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
  return `${he} · ${en}`;
}

export interface DeliveryDetails {
  deliveryFrom?: string;
  deliveryTo?: string;
  earlyFrom?: string;
  earlyTo?: string;
  inIsrael?: boolean;
}

/** Calendar weekday of a YYYY-MM-DD date. Sunday = 0. Independent of the runtime timezone. */
export function weekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function civilDateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Tomorrow's calendar date in Israel. Adding 24 hours is wrong on the DST
 * transitions (a 23-hour or 25-hour civil day), so this adds one calendar day
 * to today's Jerusalem date.
 */
export function tomorrowInIsrael(now = new Date()): string {
  return addCalendarDays(civilDateInTimeZone(now, 'Asia/Jerusalem'), 1);
}

/** Yom Tov on this civil date, using the same CHAG flag as the app's calendar. */
export function isChag(iso: string, inIsrael: boolean): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return false;
  const events = HebrewCalendar.getHolidaysOnDate(date, inIsrael) ?? [];
  return events.some((event) => (event.getFlags() & flags.CHAG) !== 0);
}

/** Fridays and holiday eves use the early window, matching src/lib/schedule.ts. */
export function deliveryWindow(iso: string, details: DeliveryDetails): string {
  const early = weekday(iso) === 5 || isChag(addCalendarDays(iso, 1), details.inIsrael ?? true);
  const from = early ? details.earlyFrom : details.deliveryFrom;
  const to = early ? details.earlyTo : details.deliveryTo;
  if (!from && !to) return '';
  return `${from ?? ''}–${to ?? ''}`;
}

export function layout(body: string) {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#2A2420;max-width:560px;margin:auto">${body}
<p style="color:#6E6359;font-size:13px;margin-top:32px">שכנים למען שכנים · Neighbors for Neighbors</p></div>`;
}

export function button(href: string | null, label: string) {
  if (!href) return '';
  return `<p><a href="${esc(href)}" style="display:inline-block;background:#B5532F;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">${esc(label)}</a></p>`;
}

export interface ResendRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

/** Body and headers for POST https://api.resend.com/emails. `to` is an array, as in Resend's examples. */
export function resendRequest(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}): ResendRequest {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    'Content-Type': 'application/json',
  };
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  return {
    url: 'https://api.resend.com/emails',
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: cleanSubject(opts.subject),
      html: opts.html,
    }),
  };
}
