import { Fragment, type ReactNode } from 'react';
import { formatDate, parseISO, weekdayNames } from '../lib/dates';
import { useI18n, type Dict } from '../lib/i18n';
import { hebrewDate } from '../lib/jewishCalendar';
import type { DayInfo } from '../lib/schedule';
import type { Lang } from '../lib/types';
import { cx } from './ui';

/** Short label for special days: holiday name, Shabbat or holiday eve. */
export function dayTag(day: DayInfo, lang: Lang, t: Dict): string | undefined {
  if (day.holiday) return day.holiday[lang];
  if (day.kind === 'shabbat') return t.shabbat;
  if (day.kind === 'erev') return t.holidayEve;
  return undefined;
}

function groupByMonth<D extends DayInfo>(days: D[]) {
  const months: { key: string; first: string; days: D[] }[] = [];
  for (const d of days) {
    const key = d.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.key === key) last.days.push(d);
    else months.push({ key, first: d.date, days: [d] });
  }
  return months;
}

/**
 * Month grids (weeks start on Sunday) for a range of days. The parent decides
 * what goes in each cell and whether a cell is a button.
 */
export function CalendarGrid<D extends DayInfo>({
  days,
  renderCell,
  onSelect,
  isSelectable = () => !!onSelect,
  cellClass,
  ariaLabel,
}: {
  days: D[];
  renderCell: (d: D) => ReactNode;
  onSelect?: (d: D) => void;
  isSelectable?: (d: D) => boolean;
  cellClass?: (d: D) => string;
  ariaLabel?: (d: D) => string;
}) {
  const { lang } = useI18n();
  const names = weekdayNames(lang);
  return (
    <div className="space-y-8">
      {groupByMonth(days).map((m) => {
        const lead = parseISO(m.first).getDay();
        return (
          <section key={m.key} aria-label={formatDate(m.first, lang, 'month')}>
            <h3 className="mb-3 text-lg font-bold">{formatDate(m.first, lang, 'month')}</h3>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {names.map((n, i) => (
                <div key={i} className="pb-1 text-center text-xs font-medium text-muted" aria-hidden>
                  {n}
                </div>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <div key={`lead-${i}`} aria-hidden />
              ))}
              {m.days.map((d) => {
                const selectable = isSelectable(d);
                const cls = cx(
                  'relative flex min-h-16 flex-col rounded-xl border p-1 text-start sm:min-h-24 sm:rounded-2xl sm:p-2',
                  cellClass?.(d),
                  selectable && 'cursor-pointer transition hover:-translate-y-px hover:shadow-card',
                );
                return (
                  <Fragment key={d.date}>
                    {selectable ? (
                      <button type="button" className={cls} onClick={() => onSelect?.(d)} aria-label={ariaLabel?.(d)}>
                        {renderCell(d)}
                      </button>
                    ) : (
                      <div className={cls} title={ariaLabel?.(d)}>
                        {renderCell(d)}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function DayNumber({ day, muted }: { day: DayInfo; muted?: boolean }) {
  const { lang, t } = useI18n();
  const tag = dayTag(day, lang, t);
  return (
    <div className="flex flex-col leading-tight">
      <span className="flex items-baseline justify-between gap-1">
        <span className={cx('text-sm font-semibold sm:text-base', muted && 'text-muted')}>{parseISO(day.date).getDate()}</span>
        <span className="hidden truncate text-[10px] text-muted sm:inline" title={t.hebrewDate}>
          {hebrewDate(day.date, lang).split(' ').slice(0, 2).join(' ')}
        </span>
      </span>
      {tag && <span className="truncate text-[10px] font-medium text-accent sm:text-xs">{tag}</span>}
    </div>
  );
}

/** Calendar you tap to close or reopen days (request form, admin page). Without onToggle it is read-only. */
export function ClosableCalendar({ days, onToggle }: { days: DayInfo[]; onToggle?: (d: DayInfo) => void }) {
  const { lang, t } = useI18n();
  return (
    <CalendarGrid
      days={days}
      onSelect={onToggle}
      cellClass={(d) => (d.blocked ? 'border-dashed border-line bg-closed' : 'border-accent/30 bg-accent-soft')}
      ariaLabel={(d) => `${formatDate(d.date, lang)} — ${d.blocked ? t.closed : t.free}`}
      renderCell={(d) => (
        <>
          <DayNumber day={d} muted={d.blocked} />
          <span className={cx('mt-auto text-[10px] font-medium sm:text-xs', d.blocked ? 'text-muted' : 'text-accent')}>
            {d.blocked ? t.closed : '✓'}
          </span>
        </>
      )}
    />
  );
}
