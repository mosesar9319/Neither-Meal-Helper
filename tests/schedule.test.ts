import { describe, expect, it } from 'vitest';
import { buildICS } from '../src/lib/calendarExport';
import { addDays, diffDays, eachDay, isISODate } from '../src/lib/dates';
import { buildBoardDays, computeBlockedDates, computeDays, computeProgress, toggleDay } from '../src/lib/schedule';
import { defaultDetails, type Board } from '../src/lib/types';
import { toWhatsappNumber } from '../src/lib/share';

const details = defaultDetails();

describe('dates', () => {
  it('walks calendar days across month and DST boundaries', () => {
    expect(eachDay('2026-03-26', '2026-03-31')).toHaveLength(6);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(diffDays('2026-12-30', '2027-01-02')).toBe(3);
  });
  it('rejects impossible dates', () => {
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-02-28')).toBe(true);
  });
});

describe('Shabbat and holidays', () => {
  // Rosh Hashana 5787 is Sat 12 – Sun 13 Sep 2026; Yom Kippur Mon 21 Sep.
  const range = { startDate: '2026-09-10', endDate: '2026-09-22', details };

  it('closes Shabbat and Yom Tov by default', () => {
    const closed = computeBlockedDates(range);
    expect(closed).toContain('2026-09-12'); // Shabbat + Rosh Hashana
    expect(closed).toContain('2026-09-13'); // Rosh Hashana II
    expect(closed).toContain('2026-09-19'); // Shabbat
    expect(closed).toContain('2026-09-21'); // Yom Kippur
    expect(closed).not.toContain('2026-09-14');
  });

  it('marks Fridays and holiday eves for early delivery', () => {
    const days = computeDays(range);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    expect(byDate['2026-09-11'].early).toBe(true); // Friday, also erev Rosh Hashana
    expect(byDate['2026-09-20'].kind).toBe('erev'); // Sunday before Yom Kippur
    expect(byDate['2026-09-20'].early).toBe(true);
    expect(byDate['2026-09-14'].early).toBe(false);
  });

  it('respects the switches', () => {
    const open = computeBlockedDates({ ...range, details: { ...details, skipShabbat: false, skipHolidays: false } });
    expect(open).toEqual([]);
  });

  it('uses the diaspora calendar when asked', () => {
    // Sukkot 5787 starts Sat 26 Sep. Abroad, Sun 27 Sep is also Yom Tov.
    const il = computeBlockedDates({ startDate: '2026-09-27', endDate: '2026-09-27', details });
    const abroad = computeBlockedDates({ startDate: '2026-09-27', endDate: '2026-09-27', details: { ...details, inIsrael: false } });
    expect(il).toEqual([]);
    expect(abroad).toEqual(['2026-09-27']);
  });

  it('lets the organizer reopen an automatic day and close a regular one', () => {
    let d = { ...details };
    const days = computeDays({ ...range, details: d });
    const shabbat = days.find((x) => x.date === '2026-09-19')!;
    d = { ...d, ...toggleDay(d, shabbat) };
    expect(d.manualOpen).toEqual(['2026-09-19']);
    const monday = days.find((x) => x.date === '2026-09-14')!;
    d = { ...d, ...toggleDay(d, monday) };
    expect(d.manualBlocked).toEqual(['2026-09-14']);
    const closed = computeBlockedDates({ ...range, details: d });
    expect(closed).not.toContain('2026-09-19');
    expect(closed).toContain('2026-09-14');
    // Toggling back removes the override.
    const again = computeDays({ ...range, details: d }).find((x) => x.date === '2026-09-14')!;
    expect(toggleDay(d, again).manualBlocked).toEqual([]);
  });
});

describe('progress', () => {
  it('counts capacity on open days only', () => {
    const board: Board = {
      slug: 'x',
      status: 'approved',
      reviewNote: '',
      familyName: 'X',
      startDate: '2026-11-15', // Sunday
      endDate: '2026-11-21', // Shabbat
      slots: ['lunch', 'dinner'],
      perSlot: 2,
      blockedDates: ['2026-11-21'],
      details,
    };
    const signups = [
      { id: '1', date: '2026-11-15', slot: 'lunch' as const, name: 'A', dish: '' },
      { id: '2', date: '2026-11-15', slot: 'lunch' as const, name: 'B', dish: '' },
      { id: '3', date: '2026-11-15', slot: 'dinner' as const, name: 'C', dish: '' },
    ];
    const days = buildBoardDays(board, signups, '2026-11-15');
    const p = computeProgress(days);
    expect(p.openDays).toBe(6);
    expect(p.total).toBe(6 * 2 * 2);
    expect(p.filled).toBe(3);
    expect(days[0].slots[0].free).toBe(0);
    expect(days[0].slots[1].free).toBe(1);
  });
});

describe('calendar export', () => {
  it('builds an iCalendar event with reminders', () => {
    const ics = buildICS({ uid: 'u1', title: 'Dinner, Cohen', description: 'Soup\nRing twice', location: '12 Oak St', date: '2026-11-16', from: '17:00', to: '19:00' });
    expect(ics).toContain('DTSTART:20261116T170000');
    expect(ics).toContain('DTEND:20261116T190000');
    expect(ics).toContain('SUMMARY:Dinner\\, Cohen');
    expect(ics).toContain('DESCRIPTION:Soup\\nRing twice');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });
});

describe('whatsapp numbers', () => {
  it('converts Israeli local numbers', () => {
    expect(toWhatsappNumber('050-123-4567')).toBe('972501234567');
    expect(toWhatsappNumber('+1 (212) 555-0100')).toBe('12125550100');
  });
});
