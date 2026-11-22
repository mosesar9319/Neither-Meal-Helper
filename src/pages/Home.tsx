import { useMemo } from 'react';
import { Link } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  CalendarHeart,
  ChevronDown,
  Link2,
  ListChecks,
  Lock,
  MessageCircle,
  NotebookPen,
  Repeat2,
  UsersRound,
} from 'lucide-react';
import { BoardProgress, BoardSummary } from '../components/BoardView';
import { useTitle } from '../components/Layout';
import { Badge, Card, LinkButton, buttonClass } from '../components/ui';
import { addDays, formatDate, parseISO, todayISO } from '../lib/dates';
import { api } from '../lib/api';
import { device } from '../lib/device';
import { SLOT_LABELS, useI18n } from '../lib/i18n';
import { buildBoardDays } from '../lib/schedule';
import { defaultDetails, type Board, type PublicSignup } from '../lib/types';

function useDemoBoard() {
  const { lang } = useI18n();
  return useMemo(() => {
    const start = todayISO();
    const board: Board = {
      slug: 'demo',
      status: 'approved',
      reviewNote: '',
      familyName: lang === 'he' ? 'לוי' : 'Levi',
      startDate: start,
      endDate: addDays(start, 6),
      slots: ['dinner'],
      perSlot: 1,
      blockedDates: [],
      details: {
        ...defaultDetails(),
        organizerName: lang === 'he' ? 'שירה' : 'Shira',
        adults: 2,
        children: 3,
        kashrut: 'mehadrin',
        mealType: 'meat',
        dietary: ['kid_friendly'],
        allergies: lang === 'he' ? 'שומשום' : 'Sesame',
        skipShabbat: true,
      },
    };
    const names = lang === 'he' ? ['רבקה', 'דוד', 'מרים'] : ['Rivka', 'David', 'Miriam'];
    const dishes = lang === 'he' ? ['מרק עוף ואורז', 'קציצות ופירה', 'שניצל וסלט'] : ['Chicken soup & rice', 'Meatballs & mash', 'Schnitzel & salad'];
    const signups: PublicSignup[] = [0, 1, 3].map((offset, i) => ({
      id: String(i),
      date: addDays(start, offset),
      slot: 'dinner',
      name: names[i],
      dish: dishes[i],
    }));
    // Keep the closed Shabbat honest in the preview.
    board.blockedDates = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(start, n)).filter((d) => parseISO(d).getDay() === 6);
    return { board, days: buildBoardDays(board, signups.filter((s) => !board.blockedDates.includes(s.date)), start) };
  }, [lang]);
}

/** A steaming pot whose steam rises into a heart. */
function WarmPot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden>
      <ellipse cx="80" cy="108" rx="62" ry="8" fill="var(--peach-soft)" />
      <path d="M58 44c-6-8 6-12 0-20M80 40c-6-8 6-12 0-20" stroke="var(--peach)" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.8" />
      <path d="M102 30c-4.5-6-14-2-11 6 2 5 11 10 11 10s9-5 11-10c3-8-6.5-12-11-6z" fill="var(--peach)" />
      <rect x="34" y="54" width="92" height="8" rx="4" fill="var(--primary)" />
      <rect x="72" y="47" width="16" height="8" rx="4" fill="var(--primary)" />
      <path d="M40 62h80v14a26 26 0 0 1-26 26H66a26 26 0 0 1-26-26z" fill="#c9a3d8" />
      <path d="M40 66h-8a6 6 0 0 0 0 12h9M120 66h8a6 6 0 0 1 0 12h-9" stroke="#c9a3d8" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M54 80c8 4 18 4 26 0s18-4 26 0" stroke="#fff" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M128 100c4-10 12-14 20-14-2 8-8 14-20 14z" fill="var(--accent)" opacity="0.55" />
      <path d="M30 102c-3-8-10-12-17-12 2 7 7 12 17 12z" fill="var(--accent)" opacity="0.45" />
    </svg>
  );
}

function Preview() {
  const { t, f, lang } = useI18n();
  const { board, days } = useDemoBoard();
  return (
    <Card className="relative overflow-hidden p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Badge tone="primary">{t.previewLabel}</Badge>
        <span className="text-xs text-muted">{board.details.organizerName && f('organizedBy', { name: board.details.organizerName })}</span>
      </div>
      <h3 className="mb-3 text-2xl font-bold">{f('boardFor', { name: board.familyName })}</h3>
      <div className="pointer-events-none space-y-4" aria-hidden>
        <BoardSummary board={{ ...board, details: { ...board.details, organizerName: '' } }} />
        <BoardProgress days={days} />
        <ul className="space-y-2">
          {days.slice(0, 4).map((d) => {
            const s = d.slots[0];
            const taken = s.signups[0];
            return (
              <li key={d.date} className="flex items-center gap-3 rounded-2xl bg-surface-2/70 px-3 py-2.5 text-sm">
                <span className="w-20 shrink-0 font-semibold">
                  {formatDate(d.date, lang, 'weekday')} {parseISO(d.date).getDate()}
                </span>
                {d.blocked ? (
                  <span className="text-muted">
                    {t.closed} · {t.shabbat}
                  </span>
                ) : taken ? (
                  <span className="truncate text-accent">
                    <strong className="font-medium">{taken.name}</strong> · {taken.dish}
                  </span>
                ) : (
                  <span className={buttonClass('primary', 'sm', 'ms-auto')}>+ {SLOT_LABELS[lang].dinner}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

export function Home() {
  const { t, lang } = useI18n();
  useTitle(undefined);
  const Arrow = lang === 'he' ? ArrowLeft : ArrowRight;
  const myBoards = device.boards();
  const mySignups = device.signups().filter((s) => s.date >= todayISO());

  const steps = [
    { icon: NotebookPen, title: t.how1Title, text: t.how1 },
    { icon: MessageCircle, title: t.how2Title, text: t.how2 },
    { icon: CalendarHeart, title: t.how3Title, text: t.how3 },
  ];
  const features = [
    { icon: ListChecks, title: t.f2Title, text: t.f2 },
    { icon: Repeat2, title: t.f3Title, text: t.f3 },
    { icon: Lock, title: t.f4Title, text: t.f4 },
    { icon: Link2, title: t.f5Title, text: t.f5 },
    { icon: UsersRound, title: t.f6Title, text: t.f6 },
  ];
  const faqs = [
    [t.q1, api.googleEnabled ? `${t.a1} ${t.a1Google}` : t.a1],
    [t.q2, t.a2],
    [t.q3, t.a3],
    [t.q5, t.a5],
    [t.q4, t.a4],
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-peach-soft via-bg to-bg">
        <div aria-hidden className="pointer-events-none absolute -top-32 -start-24 size-[28rem] rounded-full bg-primary-soft blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute top-24 -end-32 size-[24rem] rounded-full bg-peach-soft blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-16 sm:px-6 sm:pt-14 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pt-20 lg:pb-24">
          <div className="animate-rise">
            <WarmPot className="mb-4 h-24 w-auto sm:h-28" />
            <h1 className="mb-3 text-4xl font-bold tracking-tight text-ink sm:text-5xl lg:text-6xl">{t.heroTitle}</h1>
            <p className="mb-4 max-w-xl text-xl leading-snug font-medium text-primary sm:text-2xl">{t.heroSubtitle}</p>
            <p className="mb-8 max-w-xl text-lg text-muted">{t.heroText}</p>
            <div className="flex flex-wrap items-center gap-3">
              <LinkButton to="/new" size="lg">
                {t.startBoard}
                <Arrow className="size-5" aria-hidden />
              </LinkButton>
              <a href="#how" className={buttonClass('ghost', 'lg')}>
                {t.seeHow}
                <ChevronDown className="size-5" aria-hidden />
              </a>
            </div>
          </div>
          <div className="animate-rise [animation-delay:80ms]">
            <Preview />
          </div>
        </div>
      </section>

      {/* Remembered on this device */}
      {(myBoards.length > 0 || mySignups.length > 0) && (
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
          <div className="grid gap-4 md:grid-cols-2">
            {myBoards.length > 0 && (
              <Card className="p-5">
                <h2 className="mb-3 text-xl font-bold">{t.myBoards}</h2>
                <ul className="divide-y divide-line">
                  {myBoards.slice(0, 5).map((b) => (
                    <li key={b.manageToken} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="truncate font-medium">{b.familyName}</span>
                      <Link to={`/m/${b.manageToken}`} className={buttonClass('secondary', 'sm')}>
                        {t.manage}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {mySignups.length > 0 && (
              <Card className="p-5">
                <h2 className="mb-3 text-xl font-bold">{t.mySignups}</h2>
                <ul className="divide-y divide-line">
                  {mySignups.slice(0, 5).map((s) => (
                    <li key={s.editToken} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="truncate">
                        <strong className="font-medium">{s.familyName}</strong> · {formatDate(s.date, lang)}
                      </span>
                      <Link to={`/s/${s.editToken}`} className={buttonClass('secondary', 'sm')}>
                        {t.open}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </section>
      )}

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-peach-soft/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="mb-10 text-center text-3xl font-bold sm:text-4xl">{t.howTitle}</h2>
          <ol className="grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="relative rounded-3xl bg-surface p-6 shadow-card">
                <span className="absolute end-5 top-4 font-display text-5xl font-bold text-peach/40" aria-hidden>
                  {i + 1}
                </span>
                <s.icon className="mb-4 size-8 text-primary" aria-hidden />
                <h3 className="mb-2 text-xl font-bold">{s.title}</h3>
                <p className="text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="mb-10 text-center text-3xl font-bold sm:text-4xl">{t.featuresTitle}</h2>
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((x, i) => (
            <div key={x.title} className="flex gap-4">
              <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${i % 2 ? 'bg-peach-soft text-[#c0613f]' : 'bg-primary-soft text-primary'}`}>
                <x.icon className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="mb-1 font-sans text-lg font-semibold">{x.title}</h3>
                <p className="text-[15px] text-muted">{x.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 sm:pb-20">
        <h2 className="mb-6 text-center text-3xl font-bold sm:text-4xl">{t.faqTitle}</h2>
        <div className="space-y-3">
          {faqs.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-line bg-surface px-5 py-4 open:shadow-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-3 text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-peach-soft via-surface to-primary-soft px-6 py-12 text-center shadow-card sm:py-16">
          <WarmPot className="mx-auto mb-4 h-20 w-auto" />
          <h2 className="mb-3 text-3xl font-bold sm:text-4xl">{t.ctaTitle}</h2>
          <p className="mx-auto mb-8 max-w-lg text-muted">{t.ctaText}</p>
          <LinkButton to="/new" size="lg">
            {t.startBoard}
            <Arrow className="size-5" aria-hidden />
          </LinkButton>
        </div>
      </section>
    </>
  );
}
