import { useId, useMemo, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { diffDays, formatRange } from '../lib/dates';
import { DIETARY_LABELS, EXTRA_LABELS, KASHRUT_LABELS, MEALTYPE_LABELS, SLOT_LABELS, useI18n, type Dict } from '../lib/i18n';
import { computeDays, toggleDay } from '../lib/schedule';
import {
  ALL_SLOTS,
  DIETARY_TAGS,
  KASHRUT_EXTRAS,
  LIMITS,
  type BoardDetails,
  type BoardInput,
  type KashrutLevel,
  type MealType,
} from '../lib/types';
import { ClosableCalendar } from './Calendar';
import { ChipToggle, Field, NumberStepper, Segmented, Switch, TextArea, TextInput } from './ui';

export type Errors = Partial<Record<'familyName' | 'dates' | 'slots', string>>;

export function validateBoard(v: BoardInput, t: Dict, fields: (keyof Errors)[] = ['familyName', 'dates', 'slots']): Errors {
  const e: Errors = {};
  if (fields.includes('familyName') && !v.familyName.trim()) e.familyName = t.required;
  if (fields.includes('dates')) {
    if (!v.startDate || !v.endDate) e.dates = t.required;
    else if (v.endDate < v.startDate) e.dates = t.endBeforeStart;
    else if (diffDays(v.startDate, v.endDate) >= LIMITS.maxDays) e.dates = t.tooLong.replace('{n}', String(LIMITS.maxDays));
  }
  if (fields.includes('slots') && v.slots.length === 0) e.slots = t.chooseMeal;
  return e;
}

interface SectionProps {
  value: BoardInput;
  onChange: (next: BoardInput) => void;
  errors?: Errors;
}

const toggleIn = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium">{title}</legend>
      {children}
    </fieldset>
  );
}

/** forAdmin: an admin editing someone else's request, so the organizer fields aren't worded as "your". */
export function FamilySection({ value, onChange, errors, forAdmin = false }: SectionProps & { forAdmin?: boolean }) {
  const { t } = useI18n();
  const id = useId();
  const d = value.details;
  const setD = (patch: Partial<BoardDetails>) => onChange({ ...value, details: { ...d, ...patch } });
  return (
    <div className="space-y-5">
      <Field id={`${id}-fam`} label={t.familyName} hint={t.familyNameHint} error={errors?.familyName}>
        <TextInput
          id={`${id}-fam`}
          value={value.familyName}
          maxLength={LIMITS.familyName}
          invalid={!!errors?.familyName}
          onChange={(e) => onChange({ ...value, familyName: e.target.value })}
          autoComplete="off"
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id={`${id}-ad`} label={t.adults}>
          <NumberStepper id={`${id}-ad`} label={t.adults} value={d.adults} min={0} max={20} onChange={(n) => setD({ adults: n })} />
        </Field>
        <Field id={`${id}-ch`} label={t.children}>
          <NumberStepper id={`${id}-ch`} label={t.children} value={d.children} min={0} max={20} onChange={(n) => setD({ children: n })} />
        </Field>
      </div>
      {d.children > 0 && (
        <Field id={`${id}-ages`} label={t.childrenAges} hint={t.childrenAgesHint} optional>
          <TextInput id={`${id}-ages`} value={d.childrenAges} maxLength={LIMITS.shortText} onChange={(e) => setD({ childrenAges: e.target.value })} />
        </Field>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${id}-org`} label={forAdmin ? t.organizerNameAdmin : t.organizerName} optional>
          <TextInput id={`${id}-org`} value={d.organizerName} maxLength={LIMITS.name} autoComplete="name" onChange={(e) => setD({ organizerName: e.target.value })} />
        </Field>
        <Field id={`${id}-mail`} label={forAdmin ? t.organizerEmailAdmin : t.organizerEmail} hint={forAdmin ? undefined : t.organizerEmailHint} optional>
          <TextInput
            id={`${id}-mail`}
            type="email"
            autoComplete="email"
            value={value.private.organizerEmail}
            maxLength={LIMITS.email}
            onChange={(e) => onChange({ ...value, private: { ...value.private, organizerEmail: e.target.value } })}
          />
        </Field>
      </div>
    </div>
  );
}

export function FoodSection({ value, onChange }: SectionProps) {
  const { t, lang } = useI18n();
  const id = useId();
  const d = value.details;
  const setD = (patch: Partial<BoardDetails>) => onChange({ ...value, details: { ...d, ...patch } });
  return (
    <div className="space-y-6">
      <Group title={t.kashrut}>
        <Segmented<KashrutLevel>
          label={t.kashrut}
          value={d.kashrut}
          onChange={(k) => setD({ kashrut: k, kashrutExtras: k === 'none' ? [] : d.kashrutExtras })}
          options={(['kosher', 'mehadrin', 'none'] as const).map((k) => ({ value: k, label: KASHRUT_LABELS[lang][k] }))}
        />
      </Group>
      {d.kashrut !== 'none' && (
        <Group title={t.kashrutExtras}>
          <div className="flex flex-wrap gap-2">
            {KASHRUT_EXTRAS.map((x) => (
              <ChipToggle key={x} selected={d.kashrutExtras.includes(x)} onClick={() => setD({ kashrutExtras: toggleIn(d.kashrutExtras, x) })}>
                {EXTRA_LABELS[lang][x]}
              </ChipToggle>
            ))}
          </div>
        </Group>
      )}
      <Group title={t.mealType}>
        <Segmented<MealType>
          label={t.mealType}
          value={d.mealType}
          onChange={(m) => setD({ mealType: m })}
          options={(['any', 'meat', 'dairy', 'parve'] as const).map((m) => ({ value: m, label: MEALTYPE_LABELS[lang][m] }))}
        />
      </Group>
      <Group title={t.dietary}>
        <div className="flex flex-wrap gap-2">
          {DIETARY_TAGS.map((x) => (
            <ChipToggle key={x} selected={d.dietary.includes(x)} onClick={() => setD({ dietary: toggleIn(d.dietary, x) })}>
              {DIETARY_LABELS[lang][x]}
            </ChipToggle>
          ))}
        </div>
      </Group>
      <Field id={`${id}-all`} label={t.allergies} hint={t.allergiesHint} optional>
        <TextInput id={`${id}-all`} value={d.allergies} maxLength={LIMITS.longText} onChange={(e) => setD({ allergies: e.target.value })} />
      </Field>
      <Field id={`${id}-notes`} label={t.foodNotes} hint={t.foodNotesHint} optional>
        <TextArea id={`${id}-notes`} value={d.foodNotes} maxLength={LIMITS.longText} onChange={(e) => setD({ foodNotes: e.target.value })} />
      </Field>
    </div>
  );
}

function TimeRange({ label, from, to, onChange }: { label: string; from: string; to: string; onChange: (from: string, to: string) => void }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`${id}-f`}>
          {t.from}
        </label>
        <TextInput id={`${id}-f`} type="time" value={from} onChange={(e) => onChange(e.target.value, to)} className="w-auto flex-1" />
        <span className="text-muted">–</span>
        <label className="sr-only" htmlFor={`${id}-t`}>
          {t.to}
        </label>
        <TextInput id={`${id}-t`} type="time" value={to} onChange={(e) => onChange(from, e.target.value)} className="w-auto flex-1" />
      </div>
    </fieldset>
  );
}

/** Start and end dates. Used by the request form and by admins. */
export function DatesFields({ value, onChange, errors }: SectionProps) {
  const { t, lang } = useI18n();
  const id = useId();
  const days = useMemo(() => (errors?.dates ? [] : computeDays(value)), [value, errors?.dates]);
  const open = days.filter((x) => !x.blocked).length;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{t.dates}</legend>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-s`} className="mb-1 block text-[13px] text-muted">
            {t.startDate}
          </label>
          <TextInput id={`${id}-s`} type="date" value={value.startDate} invalid={!!errors?.dates} onChange={(e) => onChange({ ...value, startDate: e.target.value })} required />
        </div>
        <div>
          <label htmlFor={`${id}-e`} className="mb-1 block text-[13px] text-muted">
            {t.endDate}
          </label>
          <TextInput id={`${id}-e`} type="date" value={value.endDate} min={value.startDate} invalid={!!errors?.dates} onChange={(e) => onChange({ ...value, endDate: e.target.value })} required />
        </div>
      </div>
      {errors?.dates ? (
        <p className="mt-1.5 text-sm text-danger">{errors.dates}</p>
      ) : (
        days.length > 0 && (
          <p className="mt-1.5 text-[13px] text-muted">
            {formatRange(value.startDate, value.endDate, lang)} · {open} {t.days}
            {days.length - open > 0 && ` · ${days.length - open} ${t.daysClosed}`}
          </p>
        )
      )}
    </fieldset>
  );
}

/** Shabbat / holidays / Israel switches and the tap-to-close calendar. */
export function DaysFields({ value, onChange, errors, showCalendar = true }: SectionProps & { showCalendar?: boolean }) {
  const { t } = useI18n();
  const d = value.details;
  const setD = (patch: Partial<BoardDetails>) => onChange({ ...value, details: { ...d, ...patch } });
  const days = useMemo(() => (errors?.dates ? [] : computeDays(value)), [value, errors?.dates]);
  return (
    <>
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface px-4 py-2">
        <div className="py-2">
          <Switch checked={d.skipShabbat} onChange={(v) => setD({ skipShabbat: v })} label={t.skipShabbat} />
        </div>
        <div className="py-2">
          <Switch checked={d.skipHolidays} onChange={(v) => setD({ skipHolidays: v })} label={t.skipHolidays} />
        </div>
        <div className="py-2">
          <Switch checked={d.inIsrael} onChange={(v) => setD({ inIsrael: v })} label={t.inIsrael} hint={t.inIsraelHint} />
        </div>
      </div>

      {showCalendar && days.length > 0 && (
        <div>
          <p className="mb-3 text-[13px] text-muted">{t.calendarHint}</p>
          <ClosableCalendar days={days} onToggle={(day) => setD(toggleDay(d, day))} />
        </div>
      )}
    </>
  );
}

/** Shown to organizers once a request is sent: only admins change the dates and days then. */
export function CalendarLockedNote({ value }: { value: BoardInput }) {
  const { t, lang } = useI18n();
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface-2/70 p-4">
      <Lock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div>
        <p className="font-medium">
          {t.dates}: {formatRange(value.startDate, value.endDate, lang)}
        </p>
        <p className="text-sm text-muted">{t.calendarLocked}</p>
      </div>
    </div>
  );
}

export function ScheduleSection({
  value,
  onChange,
  errors,
  showCalendar = true,
  calendarLocked = false,
}: SectionProps & { showCalendar?: boolean; calendarLocked?: boolean }) {
  const { t, lang } = useI18n();
  const id = useId();
  const d = value.details;
  const setD = (patch: Partial<BoardDetails>) => onChange({ ...value, details: { ...d, ...patch } });

  return (
    <div className="space-y-6">
      {calendarLocked ? <CalendarLockedNote value={value} /> : <DatesFields value={value} onChange={onChange} errors={errors} />}

      <Group title={t.mealsPerDay}>
        <div className="flex flex-wrap gap-2">
          {ALL_SLOTS.map((s) => (
            <ChipToggle key={s} selected={value.slots.includes(s)} onClick={() => onChange({ ...value, slots: toggleIn(value.slots, s) })}>
              {SLOT_LABELS[lang][s]}
            </ChipToggle>
          ))}
        </div>
        {errors?.slots && <p className="text-sm text-danger">{errors.slots}</p>}
      </Group>

      <Field id={`${id}-per`} label={t.perSlot} hint={t.perSlotHint}>
        <div className="max-w-44">
          <NumberStepper id={`${id}-per`} label={t.perSlot} value={value.perSlot} min={1} max={LIMITS.maxPerSlot} onChange={(n) => onChange({ ...value, perSlot: n })} />
        </div>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <TimeRange label={t.deliveryWindow} from={d.deliveryFrom} to={d.deliveryTo} onChange={(f, to) => setD({ deliveryFrom: f, deliveryTo: to })} />
        <TimeRange label={t.earlyWindow} from={d.earlyFrom} to={d.earlyTo} onChange={(f, to) => setD({ earlyFrom: f, earlyTo: to })} />
      </div>

      {!calendarLocked && <DaysFields value={value} onChange={onChange} errors={errors} showCalendar={showCalendar} />}
    </div>
  );
}

export function PrivateSection({ value, onChange }: SectionProps) {
  const { t } = useI18n();
  const id = useId();
  const p = value.private;
  const setP = (patch: Partial<BoardInput['private']>) => onChange({ ...value, private: { ...p, ...patch } });
  return (
    <div className="space-y-5 rounded-3xl border border-dashed border-primary/40 bg-primary-soft/40 p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-medium text-primary">
        <Lock className="size-4" aria-hidden /> {t.privateNote}
      </p>
      <Field id={`${id}-addr`} label={t.address}>
        <TextInput id={`${id}-addr`} value={p.address} maxLength={LIMITS.shortText} autoComplete="street-address" onChange={(e) => setP({ address: e.target.value })} />
      </Field>
      <Field id={`${id}-ins`} label={t.instructions} hint={t.instructionsHint} optional>
        <TextArea id={`${id}-ins`} value={p.instructions} maxLength={LIMITS.longText} onChange={(e) => setP({ instructions: e.target.value })} />
      </Field>
      <Field id={`${id}-ph`} label={t.contactPhone} optional>
        <TextInput id={`${id}-ph`} type="tel" value={p.phone} maxLength={LIMITS.phone} autoComplete="tel" onChange={(e) => setP({ phone: e.target.value })} />
      </Field>
    </div>
  );
}
