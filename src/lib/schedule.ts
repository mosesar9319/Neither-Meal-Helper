import { addDays, dayOfWeek, eachDay } from './dates';
import { holidaysAround, type Holiday } from './jewishCalendar';
import type { BoardDetails, MealSlot, PublicSignup } from './types';

export type DayKind = 'regular' | 'friday' | 'erev' | 'shabbat' | 'holiday';

export interface DayInfo {
  date: string;
  dow: number;
  kind: DayKind;
  holiday?: Holiday;
  /** Closed automatically because of Shabbat or a holiday (before manual changes). */
  autoBlocked: boolean;
  /** Closed after applying the organizer's manual changes. */
  blocked: boolean;
  /** Fridays and holiday eves use the earlier delivery window. */
  early: boolean;
}

type ScheduleInput = {
  startDate: string;
  endDate: string;
  details: Pick<BoardDetails, 'skipShabbat' | 'skipHolidays' | 'inIsrael' | 'manualBlocked' | 'manualOpen'>;
};

export function computeDays(input: ScheduleInput): DayInfo[] {
  const { startDate, endDate, details } = input;
  if (!startDate || !endDate || endDate < startDate) return [];
  const holidays = holidaysAround(startDate, endDate, details.inIsrael);
  const manualBlocked = new Set(details.manualBlocked);
  const manualOpen = new Set(details.manualOpen);

  return eachDay(startDate, endDate).map((date) => {
    const dow = dayOfWeek(date);
    const holiday = holidays.get(date);
    const tomorrowHoliday = holidays.has(addDays(date, 1));
    let kind: DayKind = 'regular';
    if (holiday) kind = 'holiday';
    else if (dow === 6) kind = 'shabbat';
    else if (dow === 5) kind = 'friday';
    else if (tomorrowHoliday) kind = 'erev';

    const autoBlocked = (details.skipHolidays && kind === 'holiday') || (details.skipShabbat && dow === 6);
    const blocked = manualBlocked.has(date) || (autoBlocked && !manualOpen.has(date));
    const early = kind === 'friday' || kind === 'erev';
    return { date, dow, kind, holiday, autoBlocked, blocked, early };
  });
}

export function computeBlockedDates(input: ScheduleInput): string[] {
  return computeDays(input)
    .filter((d) => d.blocked)
    .map((d) => d.date);
}

/** Toggle a day open/closed, keeping manual lists minimal. */
export function toggleDay(
  details: BoardDetails,
  day: Pick<DayInfo, 'date' | 'autoBlocked' | 'blocked'>,
): Pick<BoardDetails, 'manualBlocked' | 'manualOpen'> {
  const blocked = new Set(details.manualBlocked);
  const open = new Set(details.manualOpen);
  if (day.blocked) {
    blocked.delete(day.date);
    if (day.autoBlocked) open.add(day.date);
  } else {
    open.delete(day.date);
    if (!day.autoBlocked) blocked.add(day.date);
  }
  return { manualBlocked: [...blocked].sort(), manualOpen: [...open].sort() };
}

export interface SlotState<S extends PublicSignup = PublicSignup> {
  slot: MealSlot;
  signups: S[];
  free: number;
}

export interface DaySlots<S extends PublicSignup = PublicSignup> extends DayInfo {
  slots: SlotState<S>[];
  past: boolean;
}

export function buildBoardDays<S extends PublicSignup>(
  board: { startDate: string; endDate: string; slots: MealSlot[]; perSlot: number; blockedDates: string[]; details: BoardDetails },
  signups: S[],
  today: string,
): DaySlots<S>[] {
  const stored = new Set(board.blockedDates);
  const byKey = new Map<string, S[]>();
  for (const s of signups) {
    const k = `${s.date}|${s.slot}`;
    byKey.set(k, [...(byKey.get(k) ?? []), s]);
  }
  return computeDays(board).map((day) => {
    // The server enforces the stored list, so it wins over a fresh computation.
    const blocked = stored.has(day.date);
    return {
      ...day,
      blocked,
      past: day.date < today,
      slots: board.slots.map((slot) => {
        const list = byKey.get(`${day.date}|${slot}`) ?? [];
        return { slot, signups: list, free: Math.max(0, board.perSlot - list.length) };
      }),
    };
  });
}

export interface Progress {
  filled: number;
  total: number;
  openDays: number;
  coveredDays: number;
  percent: number;
}

export function computeProgress(days: DaySlots[]): Progress {
  let filled = 0;
  let total = 0;
  let openDays = 0;
  let coveredDays = 0;
  for (const d of days) {
    if (d.blocked) continue;
    openDays++;
    let dayFull = true;
    for (const s of d.slots) {
      const cap = s.signups.length + s.free;
      total += cap;
      filled += Math.min(s.signups.length, cap);
      if (s.free > 0) dayFull = false;
    }
    if (dayFull && d.slots.length > 0) coveredDays++;
  }
  return { filled, total, openDays, coveredDays, percent: total ? Math.round((filled / total) * 100) : 0 };
}

export function deliveryWindow(early: boolean, details: BoardDetails): { from: string; to: string } {
  return early ? { from: details.earlyFrom, to: details.earlyTo } : { from: details.deliveryFrom, to: details.deliveryTo };
}

export const SLOT_ORDER: Record<MealSlot, number> = { breakfast: 0, lunch: 1, dinner: 2 };

export function sortSlots(slots: MealSlot[]): MealSlot[] {
  return [...new Set(slots)].sort((a, b) => SLOT_ORDER[a] - SLOT_ORDER[b]);
}
