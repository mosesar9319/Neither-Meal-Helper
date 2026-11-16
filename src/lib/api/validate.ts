import { diffDays, isISODate, isTime } from '../dates';
import { computeBlockedDates, sortSlots } from '../schedule';
import {
  ALL_SLOTS,
  DIETARY_TAGS,
  KASHRUT_EXTRAS,
  LIMITS,
  type BoardInput,
  type SignupInput,
} from '../types';
import { ApiError, type SignupEdit } from './types';

const clip = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
const int = (n: unknown, min: number, max: number, fallback: number) =>
  Number.isFinite(Number(n)) ? Math.min(max, Math.max(min, Math.round(Number(n)))) : fallback;

/** Cleans board input and attaches the effective closed days. Mirrors the SQL checks. */
export function normalizeBoard(input: BoardInput): BoardInput & { blockedDates: string[] } {
  const familyName = clip(input.familyName, LIMITS.familyName);
  if (!familyName) throw new ApiError('invalid', 'familyName');
  if (!isISODate(input.startDate) || !isISODate(input.endDate)) throw new ApiError('invalid', 'dates');
  const span = diffDays(input.startDate, input.endDate);
  if (span < 0 || span >= LIMITS.maxDays) throw new ApiError('invalid', 'dates');
  const slots = sortSlots(input.slots.filter((s) => ALL_SLOTS.includes(s)));
  if (!slots.length) throw new ApiError('invalid', 'slots');
  const d = input.details;
  const inRange = (x: string) => isISODate(x) && x >= input.startDate && x <= input.endDate;
  const details = {
    organizerName: clip(d.organizerName, LIMITS.name),
    adults: int(d.adults, 0, 20, 2),
    children: int(d.children, 0, 20, 0),
    childrenAges: clip(d.childrenAges, LIMITS.shortText),
    kashrut: (['none', 'kosher', 'mehadrin'] as const).includes(d.kashrut) ? d.kashrut : 'kosher',
    kashrutExtras: d.kashrutExtras.filter((x) => KASHRUT_EXTRAS.includes(x)),
    mealType: (['any', 'meat', 'dairy', 'parve'] as const).includes(d.mealType) ? d.mealType : 'any',
    dietary: d.dietary.filter((x) => DIETARY_TAGS.includes(x)),
    allergies: clip(d.allergies, LIMITS.longText),
    foodNotes: clip(d.foodNotes, LIMITS.longText),
    deliveryFrom: isTime(d.deliveryFrom) ? d.deliveryFrom : '17:00',
    deliveryTo: isTime(d.deliveryTo) ? d.deliveryTo : '19:00',
    earlyFrom: isTime(d.earlyFrom) ? d.earlyFrom : '11:00',
    earlyTo: isTime(d.earlyTo) ? d.earlyTo : '13:00',
    skipShabbat: !!d.skipShabbat,
    skipHolidays: !!d.skipHolidays,
    inIsrael: !!d.inIsrael,
    manualBlocked: [...new Set(d.manualBlocked.filter(inRange))].sort(),
    manualOpen: [...new Set(d.manualOpen.filter(inRange))].sort(),
  };
  const clean: BoardInput = {
    familyName,
    startDate: input.startDate,
    endDate: input.endDate,
    slots,
    perSlot: int(input.perSlot, 1, LIMITS.maxPerSlot, 1),
    details,
    private: {
      address: clip(input.private.address, LIMITS.shortText),
      instructions: clip(input.private.instructions, LIMITS.longText),
      phone: clip(input.private.phone, LIMITS.phone),
      organizerEmail: clip(input.private.organizerEmail, LIMITS.email),
    },
  };
  return { ...clean, blockedDates: computeBlockedDates(clean) };
}

export function normalizeSignupEdit(e: SignupEdit): SignupEdit {
  const out = {
    name: clip(e.name, LIMITS.name),
    phone: clip(e.phone, LIMITS.phone),
    email: clip(e.email, LIMITS.email),
    dish: clip(e.dish, LIMITS.dish),
    note: clip(e.note, LIMITS.note),
  };
  if (!out.name || !out.phone) throw new ApiError('invalid', 'contact');
  return out;
}

export function normalizeSignup(input: SignupInput): SignupInput {
  if (!isISODate(input.date) || !ALL_SLOTS.includes(input.slot)) throw new ApiError('invalid', 'slot');
  return { date: input.date, slot: input.slot, ...normalizeSignupEdit(input) };
}
