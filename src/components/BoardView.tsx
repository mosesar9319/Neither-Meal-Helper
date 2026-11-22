import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Clock, List, Plus, Users, UtensilsCrossed } from 'lucide-react';
import { formatDate, parseISO } from '../lib/dates';
import { DIETARY_LABELS, EXTRA_LABELS, KASHRUT_LABELS, MEALTYPE_LABELS, SLOT_LABELS, useI18n } from '../lib/i18n';
import { hebrewDate } from '../lib/jewishCalendar';
import { computeProgress, deliveryWindow, type DaySlots } from '../lib/schedule';
import type { Board, MealSlot, PublicSignup } from '../lib/types';
import { CalendarGrid, DayNumber, dayTag } from './Calendar';
import { Badge, Button, Card, Dialog, ProgressBar, cx } from './ui';

export function BoardSummary({ board }: { board: Board }) {
  const { t, f, lang } = useI18n();
  const d = board.details;
  const tags: string[] = [];
  if (d.kashrut !== 'none') tags.push(KASHRUT_LABELS[lang][d.kashrut]);
  d.kashrutExtras.forEach((x) => tags.push(EXTRA_LABELS[lang][x]));
  if (d.mealType !== 'any') tags.push(MEALTYPE_LABELS[lang][d.mealType]);
  const diet = d.dietary.map((x) => DIETARY_LABELS[lang][x]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-4" aria-hidden />
          {f('household', { adults: d.adults, children: d.children })}
          {d.children > 0 && d.childrenAges && ` (${f('householdAges', { ages: d.childrenAges })})`}
        </span>
        {d.organizerName && <span>{f('organizedBy', { name: d.organizerName })}</span>}
      </div>
      {(tags.length > 0 || diet.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((x) => (
            <Badge key={x} tone="accent">
              {x}
            </Badge>
          ))}
          {diet.map((x) => (
            <Badge key={x} tone="neutral">
              {x}
            </Badge>
          ))}
        </div>
      )}
      {d.allergies && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-danger-soft px-4 py-3 text-danger">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            <strong className="font-semibold">{t.allergyAlert}: </strong>
            {d.allergies}
          </p>
        </div>
      )}
      {d.foodNotes && <p className="whitespace-pre-line rounded-2xl bg-surface-2 px-4 py-3 text-[15px]">{d.foodNotes}</p>}
    </div>
  );
}

export function BoardProgress({ days }: { days: DaySlots[] }) {
  const { t, f } = useI18n();
  const p = computeProgress(days);
  const done = p.total > 0 && p.filled >= p.total;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{done ? t.allCovered : f('progress', { filled: p.filled, total: p.total })}</span>
        <span className="tabular-nums text-muted">{p.percent}%</span>
      </div>
      <ProgressBar percent={p.percent} label={f('progress', { filled: p.filled, total: p.total })} />
    </div>
  );
}

type TakeHandler = (day: DaySlots, slot: MealSlot) => void;

function WindowLabel({ day, board }: { day: DaySlots; board: Board }) {
  const { t } = useI18n();
  const w = deliveryWindow(day.early, board.details);
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <Clock className="size-3.5" aria-hidden />
      {day.early ? t.earlyDropOff : t.dropOff} <bdi dir="ltr">{`${w.from}–${w.to}`}</bdi>
    </span>
  );
}

function SlotRows({ day, board, onTake }: { day: DaySlots; board: Board; onTake?: TakeHandler }) {
  const { t, f, lang } = useI18n();
  const canTake = !day.past && !day.blocked;
  return (
    <ul className="space-y-2">
      {day.slots.map((s) => (
        <li key={s.slot} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2/70 p-2.5 ps-3.5">
          <span className="w-full text-sm font-semibold sm:w-auto sm:min-w-24">{SLOT_LABELS[lang][s.slot]}</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {s.signups.map((x) => (
              <span key={x.id} className="inline-flex max-w-full items-start gap-1.5 rounded-2xl bg-accent-soft px-3 py-1 text-sm text-accent">
                <UtensilsCrossed className="mt-1 size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">
                  <strong className="font-medium">{x.name}</strong>
                  {x.dish && ` · ${x.dish}`}
                </span>
              </span>
            ))}
          </div>
          {canTake && s.free > 0 && onTake && (
            <Button size="sm" onClick={() => onTake(day, s.slot)} aria-label={`${t.takeThis}: ${SLOT_LABELS[lang][s.slot]}, ${formatDate(day.date, lang)}`}>
              <Plus className="size-4" aria-hidden />
              {t.takeThis}
              {board.perSlot > 1 && <span className="opacity-80">({f('freeSpots', { n: s.free })})</span>}
            </Button>
          )}
          {s.free === 0 && s.signups.length === 0 && <Badge tone="accent">{t.full}</Badge>}
        </li>
      ))}
    </ul>
  );
}

function DayRow({ day, board, onTake }: { day: DaySlots; board: Board; onTake?: TakeHandler }) {
  const { t, lang } = useI18n();
  const tag = dayTag(day, lang, t);
  const date = parseISO(day.date);
  if (day.blocked) {
    return (
      <li className="flex items-center gap-4 rounded-2xl border border-dashed border-line px-4 py-2.5 text-sm text-muted">
        <span className="w-14 shrink-0 text-center font-semibold">
          {formatDate(day.date, lang, 'weekday')} {date.getDate()}
        </span>
        <span>
          {t.closed}
          {tag && ` · ${tag}`}
        </span>
      </li>
    );
  }
  return (
    <Card as="li" className={cx('flex gap-3 p-3 sm:gap-5 sm:p-4', day.past && 'opacity-60')}>
      <div className="flex w-14 shrink-0 flex-col items-center rounded-2xl bg-primary-soft py-2 text-primary sm:w-16">
        <span className="text-xs font-medium">{formatDate(day.date, lang, 'weekday')}</span>
        <span className="font-display text-2xl leading-none font-bold sm:text-3xl">{date.getDate()}</span>
        <span className="mt-0.5 text-[11px]">{formatDate(day.date, lang, 'monthShort')}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-muted">{hebrewDate(day.date, lang)}</span>
          {tag && <Badge tone="accent">{tag}</Badge>}
          <WindowLabel day={day} board={board} />
        </div>
        <SlotRows day={day} board={board} onTake={onTake} />
      </div>
    </Card>
  );
}

function defaultView(): 'list' | 'calendar' {
  try {
    const saved = localStorage.getItem('nmc.view');
    if (saved === 'list' || saved === 'calendar') return saved;
  } catch {
    /* ignore */
  }
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches ? 'calendar' : 'list';
}

export function BoardDays({ board, days, onTake, compact }: { board: Board; days: DaySlots<PublicSignup>[]; onTake?: TakeHandler; compact?: boolean }) {
  const { t, lang } = useI18n();
  const [view, setView] = useState<'list' | 'calendar'>(compact ? 'list' : defaultView);
  const [showPast, setShowPast] = useState(false);
  const [openDay, setOpenDay] = useState<DaySlots | null>(null);
  const pastCount = days.filter((d) => d.past).length;
  const visible = useMemo(() => (showPast ? days : days.filter((d) => !d.past)), [days, showPast]);

  const pick = (v: 'list' | 'calendar') => {
    setView(v);
    try {
      localStorage.setItem('nmc.view', v);
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      {!compact && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" className="inline-flex rounded-full border border-line bg-surface p-1">
            {(['calendar', 'list'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                type="button"
                aria-selected={view === v}
                onClick={() => pick(v)}
                className={cx(
                  'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors',
                  view === v ? 'bg-primary text-primary-ink shadow-card' : 'text-muted hover:text-ink',
                )}
              >
                {v === 'calendar' ? <CalendarDays className="size-4" aria-hidden /> : <List className="size-4" aria-hidden />}
                {v === 'calendar' ? t.viewCalendar : t.viewList}
              </button>
            ))}
          </div>
          {pastCount > 0 && (
            <button type="button" onClick={() => setShowPast(!showPast)} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
              {showPast ? t.hidePast : t.showPast}
            </button>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-10 text-center text-muted">{t.noOpenDays}</p>
      ) : view === 'list' ? (
        <ul className="space-y-3">
          {visible.map((d) => (
            <DayRow key={d.date} day={d} board={board} onTake={onTake} />
          ))}
        </ul>
      ) : (
        <CalendarGrid
          days={visible}
          onSelect={(d) => setOpenDay(d)}
          isSelectable={(d) => !d.blocked}
          ariaLabel={(d) => formatDate(d.date, lang)}
          cellClass={(d) =>
            d.blocked
              ? 'border-dashed border-line bg-closed'
              : d.past
                ? 'border-line bg-surface opacity-60'
                : d.slots.every((s) => s.free === 0)
                  ? 'border-accent/40 bg-accent-soft'
                  : 'border-line bg-surface'
          }
          renderCell={(d) => (
            <>
              <DayNumber day={d} muted={d.blocked} />
              {!d.blocked && (
                <div className="mt-auto flex flex-col gap-0.5 pt-1">
                  {d.slots.map((s) => (
                    <span
                      key={s.slot}
                      className={cx(
                        'h-1.5 rounded-full sm:h-auto sm:truncate sm:px-1.5 sm:py-0.5 sm:text-[11px] sm:font-medium',
                        s.free === 0 ? 'bg-accent sm:bg-accent/15 sm:text-accent' : 'bg-primary/25 sm:bg-primary-soft sm:text-primary',
                      )}
                    >
                      <span className="hidden sm:inline">
                        {s.signups.length ? s.signups.map((x) => x.name).join(', ') : `+ ${SLOT_LABELS[lang][s.slot]}`}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {d.blocked && <span className="mt-auto text-[10px] text-muted sm:text-xs">{t.closed}</span>}
            </>
          )}
        />
      )}

      <Dialog open={!!openDay} onClose={() => setOpenDay(null)} title={openDay ? formatDate(openDay.date, lang) : ''} wide>
        {openDay && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm text-muted">{hebrewDate(openDay.date, lang)}</span>
              {dayTag(openDay, lang, t) && <Badge tone="accent">{dayTag(openDay, lang, t)}</Badge>}
              <WindowLabel day={openDay} board={board} />
            </div>
            <SlotRows
              day={openDay}
              board={board}
              onTake={
                onTake &&
                ((day, slot) => {
                  setOpenDay(null);
                  onTake(day, slot);
                })
              }
            />
          </div>
        )}
      </Dialog>
    </div>
  );
}
