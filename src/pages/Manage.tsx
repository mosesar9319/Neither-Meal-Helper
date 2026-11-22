import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  AlertCircle,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  Hourglass,
  LayoutDashboard,
  Lock,
  MessageCircle,
  PartyPopper,
  Phone,
  Settings2,
  Share2,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { FamilySection, FoodSection, PrivateSection, ScheduleSection, validateBoard, type Errors } from '../components/BoardForm';
import { BoardProgress } from '../components/BoardView';
import { ClosableCalendar } from '../components/Calendar';
import { LoadingState, NotFoundState, Page, useTitle } from '../components/Layout';
import { Badge, Button, Card, CopyField, Field, Spinner, TextInput, buttonClass, cx, useConfirm, useToast } from '../components/ui';
import { api } from '../lib/api';
import { addDays, formatDate, todayISO } from '../lib/dates';
import { device } from '../lib/device';
import { SLOT_LABELS, useI18n } from '../lib/i18n';
import { buildBoardDays, computeDays, computeProgress, toggleDay, type DaySlots } from '../lib/schedule';
import { absoluteUrl, copyText, whatsappUrl } from '../lib/share';
import type { BoardInput, ManageData, Signup } from '../lib/types';
import { useAsync } from '../lib/useAsync';

type Tab = 'overview' | 'signups' | 'days' | 'details' | 'team';

function toInput(d: ManageData): BoardInput {
  const b = d.board;
  return { familyName: b.familyName, startDate: b.startDate, endDate: b.endDate, slots: b.slots, perSlot: b.perSlot, details: b.details, private: d.private };
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-bold">{children}</h2>
      {action}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface-2/70 p-4">
      <p className="font-display text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

function openMealsMessage(days: DaySlots<Signup>[], familyName: string, url: string, lang: 'he' | 'en', intro: string, signUpHere: string) {
  const lines: string[] = [];
  for (const d of days) {
    if (d.blocked || d.past) continue;
    for (const s of d.slots) if (s.free > 0) lines.push(`• ${formatDate(d.date, lang)} — ${SLOT_LABELS[lang][s.slot]}`);
    if (lines.length >= 12) break;
  }
  return `${intro.replace('{name}', familyName)}\n${lines.join('\n')}\n\n${signUpHere} ${url}`;
}

// ---------------------------------------------------------------- overview

function StatusBanner({ status, note }: { status: ManageData['board']['status']; note: string }) {
  const { t } = useI18n();
  if (status === 'approved') return null;
  const pending = status === 'pending';
  return (
    <div role="status" className={cx('flex items-start gap-3 rounded-3xl p-5', pending ? 'bg-primary-soft text-primary' : 'bg-warn-soft text-warn')}>
      {pending ? <Hourglass className="mt-0.5 size-6 shrink-0" aria-hidden /> : <AlertCircle className="mt-0.5 size-6 shrink-0" aria-hidden />}
      <div className="space-y-1">
        <p className="text-lg font-semibold">{pending ? t.statusPendingTitle : t.statusDeclinedTitle}</p>
        <p>{pending ? t.statusPendingText : t.statusDeclinedText}</p>
        {note && (
          <p className="pt-1">
            <strong className="font-semibold">{t.adminNote}: </strong>
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

function Overview({ data, days, isNew, newCount }: { data: ManageData; days: DaySlots<Signup>[]; isNew: boolean; newCount: number }) {
  const { t, f, lang } = useI18n();
  const toast = useToast();
  const { token = '' } = useParams();
  const publicUrl = absoluteUrl(`/b/${data.board.slug}`);
  const manageUrl = absoluteUrl(`/m/${token}`);
  const progress = computeProgress(days);
  const today = todayISO();
  const upcoming = data.signups.filter((s) => s.date >= today && s.date <= addDays(today, 3));
  const groupMsg = openMealsMessage(days, data.board.familyName, publicUrl, lang, t.stillOpenText, t.signUpHere);
  const hasOpen = progress.filled < progress.total;
  const approved = data.board.status === 'approved';

  return (
    <div className="space-y-6">
      {isNew && (
        <div className="animate-rise flex items-start gap-3 rounded-3xl bg-accent-soft p-5 text-accent">
          <PartyPopper className="mt-0.5 size-6 shrink-0" aria-hidden />
          <div>
            <p className="text-lg font-semibold">{t.boardCreated}</p>
            <p>{t.boardCreatedText}</p>
          </div>
        </div>
      )}
      <StatusBanner status={data.board.status} note={data.board.reviewNote} />

      <Card className="space-y-5 p-5 sm:p-6">
        {approved && (
        <div>
          <p className="mb-2 font-semibold">{t.publicLink}</p>
          <CopyField value={publicUrl} label={t.publicLink} />
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={whatsappUrl(`${f('shareText', { name: data.board.familyName })}\n${publicUrl}`)} target="_blank" rel="noreferrer" className={buttonClass('whatsapp', 'sm')}>
              <Share2 className="size-4" aria-hidden />
              {t.shareWhatsapp}
            </a>
            <Link to={`/b/${data.board.slug}`} className={buttonClass('secondary', 'sm')}>
              <ExternalLink className="size-4" aria-hidden />
              {t.viewBoard}
            </Link>
          </div>
        </div>
        )}
        <div className={cx(approved && 'border-t border-line pt-5')}>
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <Lock className="size-4 text-primary" aria-hidden />
            {t.manageLink}
          </p>
          <CopyField value={manageUrl} label={t.manageLink} />
        </div>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-bold">{t.tabOverview}</h2>
          {newCount > 0 && <Badge tone="primary">{f('newSince', { n: newCount })}</Badge>}
        </div>
        <BoardProgress days={days} />
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t.openSlots} value={progress.total - progress.filled} />
          <Stat label={t.coveredDays} value={`${progress.coveredDays}/${progress.openDays}`} />
          <Stat label={t.totalSignups} value={new Set(data.signups.map((s) => s.phone)).size} />
        </div>
        <div>
          <h3 className="mb-2 font-sans text-base font-semibold">{t.upcoming}</h3>
          {upcoming.length === 0 ? (
            <p className="text-muted">{t.nothingUpcoming}</p>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                  <span>
                    <strong className="font-medium">{formatDate(s.date, lang)}</strong> · {SLOT_LABELS[lang][s.slot]}
                  </span>
                  <span className="text-muted">
                    {s.name}
                    {s.dish && ` · ${s.dish}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {approved && hasOpen && (
        <Card className="space-y-3 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <MessageCircle className="size-6 text-primary" aria-hidden />
            {t.remindAll}
          </h2>
          <p className="text-muted">{t.remindAllHint}</p>
          <pre className="max-h-56 overflow-auto rounded-2xl bg-surface-2 p-4 font-sans text-sm whitespace-pre-wrap">{groupMsg}</pre>
          <div className="flex flex-wrap gap-2">
            <a href={whatsappUrl(groupMsg)} target="_blank" rel="noreferrer" className={buttonClass('whatsapp', 'sm')}>
              {t.shareWhatsapp}
            </a>
            <Button size="sm" variant="secondary" onClick={async () => (await copyText(groupMsg)) && toast(t.copied)}>
              {t.copy}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- sign-ups

function Signups({ data, seenAt, token, reload }: { data: ManageData; seenAt: string; token: string; reload: () => void }) {
  const { t, f, lang } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const valid = useMemo(() => {
    const b = data.board;
    const closed = new Set(b.blockedDates);
    return (s: Signup) => s.date >= b.startDate && s.date <= b.endDate && !closed.has(s.date) && b.slots.includes(s.slot);
  }, [data.board]);

  if (data.signups.length === 0) {
    return (
      <Card className="p-8 text-center text-muted">
        <ClipboardList className="mx-auto mb-3 size-10" aria-hidden />
        {t.noSignups}
      </Card>
    );
  }

  const byDate = new Map<string, Signup[]>();
  for (const s of data.signups) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);

  return (
    <div className="space-y-5">
      {[...byDate.entries()].map(([date, list]) => (
        <section key={date}>
          <h3 className={cx('mb-2 font-sans text-sm font-semibold', date < todayISO() ? 'text-muted' : 'text-primary')}>{formatDate(date, lang)}</h3>
          <ul className="space-y-2">
            {list.map((s) => (
              <Card as="li" key={s.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{SLOT_LABELS[lang][s.slot]}</Badge>
                    <strong className="font-semibold">{s.name}</strong>
                    {s.createdAt > seenAt && <Badge tone="primary">{t.newBadge}</Badge>}
                    {!valid(s) && <Badge tone="warn">{t.outsideSchedule}</Badge>}
                  </p>
                  {s.dish && <p>{s.dish}</p>}
                  {s.note && <p className="text-sm text-muted">“{s.note}”</p>}
                  <p className="text-sm text-muted">
                    <span dir="ltr">{s.phone}</span>
                    {s.email && <> · {s.email}</>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <a href={`tel:${s.phone}`} className={buttonClass('secondary', 'sm')} aria-label={`${t.call} ${s.name}`}>
                    <Phone className="size-4" aria-hidden />
                    <span className="hidden sm:inline">{t.call}</span>
                  </a>
                  <a href={whatsappUrl('', s.phone)} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')} aria-label={`${t.whatsapp} ${s.name}`}>
                    <MessageCircle className="size-4" aria-hidden />
                    <span className="hidden sm:inline">{t.whatsapp}</span>
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={async () => {
                      const ok = await confirm({
                        title: t.remove,
                        body: f('removeConfirm', { name: s.name, date: formatDate(s.date, lang) }),
                        confirmLabel: t.remove,
                        danger: true,
                      });
                      if (!ok) return;
                      try {
                        await api.removeSignup(token, s.id);
                        reload();
                      } catch {
                        toast(t.error, 'error');
                      }
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    {t.remove}
                  </Button>
                </div>
              </Card>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- days

function Days({ data, token, reload }: { data: ManageData; token: string; reload: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState(() => toInput(data));
  const [busy, setBusy] = useState(false);
  const days = useMemo(() => computeDays(draft), [draft]);
  const dirty = JSON.stringify(draft.details) !== JSON.stringify(data.board.details);
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle
        action={
          <Button
            disabled={!dirty || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.updateBoard(token, draft);
                toast(t.saved);
                reload();
              } catch {
                toast(t.error, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Spinner />}
            {t.saveDays}
          </Button>
        }
      >
        {t.tabDays}
      </SectionTitle>
      <p className="mb-5 text-muted">{t.daysHint}</p>
      <ClosableCalendar days={days} onToggle={(day) => setDraft({ ...draft, details: { ...draft.details, ...toggleDay(draft.details, day) } })} />
    </Card>
  );
}

// ---------------------------------------------------------------- details

function Details({ data, token, reload }: { data: ManageData; token: string; reload: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [value, setValue] = useState(() => toInput(data));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const sections = [
    { title: t.stepFamily, body: <FamilySection value={value} onChange={setValue} errors={errors} /> },
    { title: t.stepFood, body: <FoodSection value={value} onChange={setValue} /> },
    { title: t.stepSchedule, body: <ScheduleSection value={value} onChange={setValue} errors={errors} showCalendar={false} /> },
    { title: t.stepPrivate, body: <PrivateSection value={value} onChange={setValue} /> },
  ];
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const errs = validateBoard(value, t);
        setErrors(errs);
        if (Object.keys(errs).length) return;
        setBusy(true);
        try {
          await api.updateBoard(token, value);
          device.rememberBoard({ slug: data.board.slug, familyName: value.familyName.trim(), manageToken: token });
          toast(t.saved);
          reload();
        } catch {
          toast(t.error, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      {sections.map((s) => (
        <Card key={s.title} className="p-5 sm:p-6">
          <h2 className="mb-5 text-2xl font-bold">{s.title}</h2>
          {s.body}
        </Card>
      ))}
      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end border-t border-line/70 bg-bg/90 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" disabled={busy}>
          {busy && <Spinner />}
          {busy ? t.saving : t.save}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- team

function Team({ data, token, reload, onDeleted }: { data: ManageData; token: string; reload: () => void; onDeleted: () => void }) {
  const { t, f } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; url: string } | null>(null);
  const isOwner = data.me.role === 'owner';

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <SectionTitle>{t.team}</SectionTitle>
        <ul className="divide-y divide-line">
          {data.managers.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-3">
              <span className="flex flex-wrap items-center gap-2">
                <strong className="font-medium">{m.name || t.none}</strong>
                <Badge tone={m.role === 'owner' ? 'primary' : 'neutral'}>{m.role === 'owner' ? t.owner : t.coOrganizer}</Badge>
                {m.id === data.me.id && <span className="text-sm text-muted">({t.you})</span>}
              </span>
              {isOwner && m.role === 'co' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onClick={async () => {
                    if (!(await confirm({ title: t.revoke, body: f('revokeConfirm', { name: m.name }), confirmLabel: t.revoke, danger: true }))) return;
                    try {
                      await api.removeManager(token, m.id);
                      reload();
                    } catch {
                      toast(t.error, 'error');
                    }
                  }}
                >
                  {t.revoke}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {isOwner && (
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <UserPlus className="size-6 text-primary" aria-hidden />
            {t.addCoOrganizer}
          </h2>
          <p className="text-muted">{t.addCoOrganizerHint}</p>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              setBusy(true);
              try {
                const res = await api.addManager(token, name.trim());
                setCreated({ name: name.trim(), url: absoluteUrl(`/m/${res.token}`) });
                setName('');
                reload();
              } catch {
                toast(t.error, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="min-w-48 flex-1">
              <Field id="co-name" label={t.coName}>
                <TextInput id="co-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Spinner />}
              {t.createLink}
            </Button>
          </form>
          {created && (
            <div className="animate-rise space-y-2 rounded-2xl bg-accent-soft p-4">
              <p className="font-medium text-accent">{f('coLinkReady', { name: created.name })}</p>
              <CopyField value={created.url} />
              <a href={whatsappUrl(created.url)} target="_blank" rel="noreferrer" className={buttonClass('whatsapp', 'sm')}>
                {t.shareWhatsapp}
              </a>
            </div>
          )}
        </Card>
      )}

      <Card className="space-y-3 border-danger/30 p-5 sm:p-6">
        <h2 className="text-2xl font-bold text-danger">{t.dangerZone}</h2>
        {isOwner ? (
          <Button
            variant="danger"
            onClick={async () => {
              if (!(await confirm({ title: t.deleteBoard, body: t.deleteConfirm, confirmLabel: t.yesDelete, danger: true }))) return;
              try {
                await api.deleteBoard(token);
                device.forgetBoard(token);
                onDeleted();
              } catch {
                toast(t.error, 'error');
              }
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            {t.deleteBoard}
          </Button>
        ) : (
          <p className="text-muted">{t.onlyOwnerDeletes}</p>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- page

export function Manage() {
  const { token = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { t, f } = useI18n();
  const { data, error, loading, reload } = useAsync(() => api.getManage(token), [token]);
  const [deleted, setDeleted] = useState(false);
  const isNew = params.get('new') === '1';
  const tab = (params.get('tab') as Tab) || 'overview';
  useTitle(data ? f('manageTitle', { name: data.board.familyName }) : undefined);

  // "New" is measured from the moment the page first loaded, then the visit is recorded.
  const seenAt = useRef<string | null>(null);
  useEffect(() => {
    if (data && seenAt.current === null) {
      seenAt.current = data.me.seenAt;
      device.rememberBoard({ slug: data.board.slug, familyName: data.board.familyName, manageToken: token });
      api.markSeen(token).catch(() => {});
    }
  }, [data, token]);

  const days = useMemo(() => (data ? buildBoardDays(data.board, data.signups, todayISO()) : []), [data]);

  if (deleted) {
    return (
      <Page width="sm">
        <Card className="p-8 text-center">
          <p className="mb-6 text-lg">{t.boardDeleted}</p>
          <Link to="/" className={buttonClass()}>
            {t.goHome}
          </Link>
        </Card>
      </Page>
    );
  }
  if (loading && !data) return <LoadingState />;
  if (error || !data) return <NotFoundState />;

  const since = seenAt.current ?? data.me.seenAt;
  const newCount = data.signups.filter((s) => s.createdAt > since).length;
  const tabs: { id: Tab; label: string; icon: typeof Users; badge?: number }[] = [
    { id: 'overview', label: t.tabOverview, icon: LayoutDashboard },
    { id: 'signups', label: t.tabSignups, icon: ClipboardList, badge: data.signups.length },
    { id: 'days', label: t.tabDays, icon: CalendarDays },
    { id: 'details', label: t.tabDetails, icon: Settings2 },
    { id: 'team', label: t.tabTeam, icon: Users },
  ];
  const setTab = (id: Tab) => {
    const next = new URLSearchParams(params);
    next.set('tab', id);
    next.delete('new');
    setParams(next, { replace: true });
  };

  return (
    <Page width="md">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">{f('manageTitle', { name: data.board.familyName })}</h1>
        {data.me.role === 'co' && <Badge tone="neutral">{t.coOrganizerBadge}</Badge>}
      </div>

      <div role="tablist" aria-label={t.manage} className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            type="button"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={cx(
              'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors',
              tab === x.id ? 'bg-primary text-primary-ink shadow-card' : 'text-muted hover:bg-surface-2 hover:text-ink',
            )}
          >
            <x.icon className="size-4" aria-hidden />
            {x.label}
            {!!x.badge && <span className={cx('rounded-full px-1.5 text-xs', tab === x.id ? 'bg-white/25' : 'bg-surface-2')}>{x.badge}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" key={tab}>
        {tab === 'overview' && <Overview data={data} days={days} isNew={isNew} newCount={newCount} />}
        {tab === 'signups' && <Signups data={data} seenAt={since} token={token} reload={reload} />}
        {tab === 'days' && <Days key={JSON.stringify(data.board.details)} data={data} token={token} reload={reload} />}
        {tab === 'details' && <Details data={data} token={token} reload={reload} />}
        {tab === 'team' && <Team data={data} token={token} reload={reload} onDeleted={() => setDeleted(true)} />}
      </div>
    </Page>
  );
}
