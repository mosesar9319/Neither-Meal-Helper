// Pure helpers for the email functions. No Deno APIs, so Vitest can import this file.
// Hebcal is imported with a Deno npm: specifier; vite.config.ts aliases it for tests.
// Ported from PR #1 and adapted to the meal-* functions.
import { HebrewCalendar, flags } from 'npm:@hebcal/core@6';

const EMAIL = /^[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+$/;

export function isEmail(value: string): boolean {
  const s = value.trim();
  return s.length >= 3 && s.length <= 200 && EMAIL.test(s);
}

/** `meals@example.com` or `Name <meals@example.com>`. */
export function isFromAddress(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 320) return false;
  const angled = /^(.*)<([^<>]+)>\s*$/.exec(v);
  return isEmail((angled ? angled[2] : v).trim());
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function normalizeSiteUrl(raw: string | undefined | null): string {
  return (raw ?? '').trim().replace(/\/+$/, '');
}

/** Absolute link, or null when the site address isn't configured (the button is then left out). */
export function pageUrl(base: string, path: string): string | null {
  if (!base) return null;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function cleanSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
}

/** Header-safe Idempotency-Key, capped at Resend's 256-character limit. */
export function idempotencyKey(parts: readonly string[]): string {
  const key = parts.join('/').replace(/[^\x21-\x7e]/g, '_').slice(0, 256);
  return key || 'email';
}

/** Stable 32-hex-character id, for idempotency keys built from lists. */
export async function shortHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** The bearer token from an Authorization header, or ''. */
export function bearer(header: string | null): string {
  return /^Bearer\s+(\S+)\s*$/i.exec(header ?? '')?.[1] ?? '';
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

/** Weekday of a YYYY-MM-DD date (Sunday = 0), whatever the runtime's time zone. */
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
 * Tomorrow's calendar date in Israel. Adding 24 hours can land on the wrong day
 * around daylight-saving changes (23- or 25-hour days), so add one calendar day
 * to today's Jerusalem date instead.
 */
export function tomorrowInIsrael(now = new Date()): string {
  return addCalendarDays(civilDateInTimeZone(now, 'Asia/Jerusalem'), 1);
}

/** Yom Tov on this date, using the same CHAG flag as the app's calendar. */
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
  return `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#2A2238;max-width:560px;margin:auto">${body}
<p style="color:#6D6480;font-size:13px;margin-top:32px">שכנות למען שכנות · Neighbors for Neighbors</p></div>`;
}

export function button(href: string | null, label: string) {
  if (!href) return '';
  return `<p><a href="${esc(href)}" style="display:inline-block;background:#7B4FB8;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">${esc(label)}</a></p>`;
}

export interface ResendRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

/** Request for POST https://api.resend.com/emails. */
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
    body: JSON.stringify({ from: opts.from, to: [opts.to], subject: cleanSubject(opts.subject), html: opts.html }),
  };
}
