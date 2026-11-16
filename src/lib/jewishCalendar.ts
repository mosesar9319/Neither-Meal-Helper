import { HDate, HebrewCalendar, flags } from '@hebcal/core';
import { addDays, parseISO, toISO } from './dates';
import type { Lang } from './types';

export interface Holiday {
  en: string;
  he: string;
}

const cache = new Map<string, Map<string, Holiday>>();

/** Yom Tov days (no cooking or driving) between two dates, keyed by YYYY-MM-DD. */
export function holidaysBetween(start: string, end: string, inIsrael: boolean): Map<string, Holiday> {
  const key = `${start}|${end}|${inIsrael}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out = new Map<string, Holiday>();
  const events = HebrewCalendar.calendar({
    start: parseISO(start),
    end: parseISO(end),
    il: inIsrael,
    noMinorFast: true,
    noModern: true,
    noRoshChodesh: true,
    noSpecialShabbat: true,
  });
  for (const ev of events) {
    if (ev.getFlags() & flags.CHAG) {
      const iso = toISO(ev.getDate().greg());
      if (!out.has(iso)) {
        out.set(iso, { en: stripYear(ev.render('en')), he: stripNiqqud(stripYear(ev.render('he'))) });
      }
    }
  }
  cache.set(key, out);
  return out;
}

/** Holidays in [start, end], plus the day after `end` so the last day can be marked as an eve. */
export function holidaysAround(start: string, end: string, inIsrael: boolean) {
  return holidaysBetween(start, addDays(end, 1), inIsrael);
}

export function hebrewDate(iso: string, lang: Lang): string {
  const hd = new HDate(parseISO(iso));
  if (lang === 'he') return stripNiqqud(hd.renderGematriya(true));
  return `${hd.getDate()} ${hd.getMonthName()}`;
}

function stripYear(s: string) {
  return s.replace(/\s+\d{4}$/, '');
}

function stripNiqqud(s: string) {
  return s.replace(/[֑-ׇ]/g, '');
}
