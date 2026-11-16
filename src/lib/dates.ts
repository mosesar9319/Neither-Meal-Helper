import type { Lang } from './types';

/** All dates in the app are plain calendar days, written YYYY-MM-DD, in local time. */

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISO(parseISO(s)) === s;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(from: string, to: string): number {
  const a = parseISO(from);
  const b = parseISO(to);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function eachDay(start: string, end: string, max = 400): string[] {
  const out: string[] = [];
  let d = start;
  while (d <= end && out.length < max) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export function dayOfWeek(iso: string): number {
  return parseISO(iso).getDay();
}

const LOCALE: Record<Lang, string> = { he: 'he-IL', en: 'en-US' };

export function formatDate(iso: string, lang: Lang, style: 'long' | 'short' | 'weekday' | 'month' | 'monthShort' = 'long'): string {
  const opts: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long' }
      : style === 'short'
        ? { day: 'numeric', month: 'short' }
        : style === 'weekday'
          ? { weekday: 'short' }
          : style === 'monthShort'
            ? { month: 'short' }
            : { month: 'long', year: 'numeric' };
  return new Intl.DateTimeFormat(LOCALE[lang], opts).format(parseISO(iso));
}

export function formatRange(start: string, end: string, lang: Lang): string {
  return `${formatDate(start, lang, 'short')} – ${formatDate(end, lang, 'short')}`;
}

export function weekdayNames(lang: Lang): string[] {
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => formatDate(toISO(new Date(2023, 0, 1 + i)), lang, 'weekday'));
}

export function isTime(s: unknown): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}
