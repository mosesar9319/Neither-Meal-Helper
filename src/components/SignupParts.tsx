import { useId, useState } from 'react';
import { CalendarPlus, Clock, MapPin, Phone, StickyNote } from 'lucide-react';
import { downloadICS, googleCalendarUrl, type CalendarEvent } from '../lib/calendarExport';
import { formatDate } from '../lib/dates';
import { SLOT_LABELS, useI18n } from '../lib/i18n';
import { computeDays, deliveryWindow } from '../lib/schedule';
import { LIMITS, type Board, type MealSlot, type PrivateDetails, type PublicSignup } from '../lib/types';
import type { SignupEdit } from '../lib/api';
import { isEmail } from '../lib/api/validate';
import { Button, Field, Spinner, TextArea, TextInput, buttonClass } from './ui';

export function windowFor(board: Board, date: string) {
  const day = computeDays({ ...board, startDate: date, endDate: date })[0];
  return deliveryWindow(day?.early ?? false, board.details);
}

export function DeliveryDetails({ board, date, priv }: { board: Board; date: string; priv: PrivateDetails }) {
  const { t } = useI18n();
  const w = windowFor(board, date);
  const rows = [
    { icon: Clock, value: <span dir="ltr">{`${w.from}–${w.to}`}</span> },
    priv.address && { icon: MapPin, value: priv.address },
    priv.instructions && { icon: StickyNote, value: <span className="whitespace-pre-line">{priv.instructions}</span> },
    priv.phone && {
      icon: Phone,
      value: (
        <a href={`tel:${priv.phone}`} dir="ltr" className="underline underline-offset-4">
          {priv.phone}
        </a>
      ),
    },
  ].filter(Boolean) as { icon: typeof Clock; value: React.ReactNode }[];
  return (
    <section className="rounded-2xl bg-surface-2 p-4">
      <h3 className="mb-2 font-sans text-sm font-semibold text-muted">{t.deliveryDetails}</h3>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <r.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>{r.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CalendarButtons({ board, date, slot, priv, dish, uid, editUrl }: {
  board: Board;
  date: string;
  slot: MealSlot;
  priv: PrivateDetails;
  dish: string;
  uid: string;
  editUrl: string;
}) {
  const { t, f, lang } = useI18n();
  const w = windowFor(board, date);
  const ev: CalendarEvent = {
    uid: `${uid}@neighbors-meals`,
    title: `${SLOT_LABELS[lang][slot]} · ${f('boardFor', { name: board.familyName })}`,
    description: [dish, priv.instructions, priv.phone, editUrl].filter(Boolean).join('\n'),
    location: priv.address,
    date,
    from: w.from,
    to: w.to,
  };
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <CalendarPlus className="size-4 text-primary" aria-hidden /> {t.addToCalendar}
      </p>
      <div className="flex flex-wrap gap-2">
        <a className={buttonClass('secondary', 'sm')} href={googleCalendarUrl(ev)} target="_blank" rel="noreferrer">
          {t.googleCalendar}
        </a>
        <Button size="sm" variant="secondary" onClick={() => downloadICS(ev, `meal-${date}.ics`)}>
          {t.downloadIcs}
        </Button>
      </div>
      <p className="mt-2 text-[13px] text-muted">{t.calendarHasReminder}</p>
    </div>
  );
}

/** Dishes others already planned, so neighbors can vary the menu. */
export function PlannedDishes({ signups, exceptId }: { signups: PublicSignup[]; exceptId?: string }) {
  const { t } = useI18n();
  const dishes = [...new Set(signups.filter((s) => s.id !== exceptId && s.dish).map((s) => s.dish.trim()))].slice(0, 12);
  if (!dishes.length) return null;
  return (
    <div className="rounded-2xl bg-surface-2 p-3.5 text-sm">
      <p className="mb-2 text-muted">{t.plannedDishesHint}</p>
      <ul className="flex flex-wrap gap-1.5">
        {dishes.map((d) => (
          <li key={d} className="rounded-full bg-surface px-2.5 py-1">
            {d}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SignupFields({
  value,
  onChange,
  errors,
  forAdmin = false,
}: {
  value: SignupEdit;
  onChange: (v: SignupEdit) => void;
  errors: Partial<Record<'name' | 'phone' | 'email', string>>;
  /** An admin fixing a cook's details: neutral labels, no hints meant for the cook. */
  forAdmin?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const set = (patch: Partial<SignupEdit>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <Field id={`${id}-dish`} label={forAdmin ? t.cookDish : t.dish} optional>
        <TextInput id={`${id}-dish`} value={value.dish} maxLength={LIMITS.dish} placeholder={t.dishPlaceholder} onChange={(e) => set({ dish: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-name`} label={forAdmin ? t.cookName : t.yourName} error={errors.name}>
          <TextInput id={`${id}-name`} value={value.name} maxLength={LIMITS.name} autoComplete="name" invalid={!!errors.name} onChange={(e) => set({ name: e.target.value })} required />
        </Field>
        <Field id={`${id}-phone`} label={forAdmin ? t.cookPhone : t.yourPhone} hint={forAdmin ? undefined : t.yourPhoneHint} error={errors.phone}>
          <TextInput id={`${id}-phone`} type="tel" value={value.phone} maxLength={LIMITS.phone} autoComplete="tel" invalid={!!errors.phone} onChange={(e) => set({ phone: e.target.value })} required />
        </Field>
      </div>
      <Field id={`${id}-email`} label={forAdmin ? t.email : t.yourEmail} hint={forAdmin ? undefined : t.yourEmailHint} error={errors.email}>
        <TextInput
          id={`${id}-email`}
          type="email"
          value={value.email}
          maxLength={LIMITS.email}
          autoComplete="email"
          invalid={!!errors.email}
          onChange={(e) => set({ email: e.target.value })}
          required
        />
      </Field>
      <Field id={`${id}-note`} label={forAdmin ? t.cookNote : t.noteToFamily} optional>
        <TextArea id={`${id}-note`} rows={2} value={value.note} maxLength={LIMITS.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>
    </div>
  );
}

export function useSignupForm(initial: SignupEdit) {
  const { t } = useI18n();
  const [value, setValue] = useState<SignupEdit>(initial);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'phone' | 'email', string>>>({});
  const validate = () => {
    const e: typeof errors = {};
    if (!value.name.trim()) e.name = t.required;
    if (!value.phone.trim()) e.phone = t.required;
    if (!value.email.trim()) e.email = t.required;
    else if (!isEmail(value.email)) e.email = t.invalidEmail;
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  return { value, setValue, errors, validate };
}

export function SubmitButton({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <Button type="submit" disabled={busy} className="w-full sm:w-auto">
      {busy && <Spinner />}
      {busy ? busyLabel : label}
    </Button>
  );
}

export function slotDateLabel(lang: 'he' | 'en', slot: MealSlot, date: string) {
  return `${SLOT_LABELS[lang][slot]} · ${formatDate(date, lang)}`;
}
