import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { CalendarClock, CalendarDays, Check, ChevronDown, EyeOff, ExternalLink, Info, LogOut, Phone, RotateCcw, Trash2, Undo2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { DatesFields, DaysFields, validateBoard, type Errors } from '../components/BoardForm';
import { BoardSummary } from '../components/BoardView';
import { LoadingState, Page, useTitle } from '../components/Layout';
import {
  Badge,
  Button,
  Card,
  Dialog,
  Field,
  Segmented,
  Select,
  Spinner,
  TextArea,
  TextInput,
  buttonClass,
  cx,
  useConfirm,
  useToast,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatDate, formatRange, todayISO } from '../lib/dates';
import { SLOT_LABELS, useI18n } from '../lib/i18n';
import { computeBlockedDates, computeDays } from '../lib/schedule';
import type { AdminEntry, AdminRequest, BoardInput, BoardStatus, MealSlot, Signup } from '../lib/types';

type Tab = BoardStatus | 'admins';

// ---------------------------------------------------------------- dates and open days (admins only once a request is sent)

function CalendarDialog({ r, onClose, onSaved }: { r: AdminRequest; onClose: () => void; onSaved: () => void }) {
  const { t, f, lang } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<BoardInput>(() => ({
    familyName: r.familyName,
    startDate: r.startDate,
    endDate: r.endDate,
    slots: r.slots,
    perSlot: r.perSlot,
    details: r.details,
    private: r.private,
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [affected, setAffected] = useState<Signup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const warning = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (affected) warning.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [affected]);
  const change = (next: BoardInput) => {
    setDraft(next);
    setAffected(null);
    setErrors(validateBoard(next, t, ['dates']));
  };

  const save = async () => {
    const errs = validateBoard(draft, t, ['dates']);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      // Warn once about people who are signed up on days that close or fall outside the new dates.
      if (!affected) {
        // Only people this change affects; ones already on a closed day were warned about before.
        const closed = new Set(computeBlockedDates(draft));
        const wasOpen = (s: Signup) => s.date >= r.startDate && s.date <= r.endDate && !r.blockedDates.includes(s.date);
        const hit = (await api.admin.listSignups(r.slug)).filter(
          (s) => s.date >= todayISO() && wasOpen(s) && (s.date < draft.startDate || s.date > draft.endDate || closed.has(s.date)),
        );
        if (hit.length) {
          setAffected(hit);
          return;
        }
      }
      await api.admin.updateCalendar(r.slug, draft);
      toast(t.calendarSaved);
      onSaved();
    } catch {
      toast(t.error, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open wide onClose={onClose} title={t.editCalendar}>
      <form
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="text-muted">
          <strong className="font-medium text-ink">{f('boardFor', { name: r.familyName })}</strong> · {t.editCalendarHint}
        </p>
        <DatesFields value={draft} onChange={change} errors={errors} />
        <DaysFields value={draft} onChange={change} errors={errors} />
        {affected && (
          <div ref={warning} role="alert" className="space-y-2 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
            <p>{t.calendarAffects}</p>
            <ul className="list-disc ps-5">
              {affected.map((s) => (
                <li key={s.id}>
                  {formatDate(s.date, lang)} · {SLOT_LABELS[lang][s.slot]} · {s.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="sticky bottom-0 -mx-5 flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-5 pt-3 sm:-mx-7 sm:px-7">
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={busy || Object.keys(errors).length > 0}>
            {busy && <Spinner />}
            {affected ? t.saveAnyway : t.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- who cooks when (admins can move or remove)

function MoveDialog({ r, s, list, onClose, onMoved }: { r: AdminRequest; s: Signup; list: Signup[]; onClose: () => void; onMoved: () => void }) {
  const { t, f, lang } = useI18n();
  const toast = useToast();
  const [date, setDate] = useState(s.date);
  const [slot, setSlot] = useState<MealSlot>(s.slot);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const days = computeDays(r);
  const closed = new Set(r.blockedDates);
  const taken = list.filter((x) => x.date === date && x.slot === slot && x.id !== s.id).length;
  const same = date === s.date && slot === s.slot;

  const move = async (force: boolean) => {
    setBusy(true);
    try {
      await api.admin.moveSignup(s.id, date, slot, force);
      toast(t.movedSignupToast);
      onMoved();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'slot_full') setFull(true);
      else toast(t.error, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={f('moveTitle', { name: s.name })}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!same) void move(full);
        }}
      >
        <Field id={`move-day-${s.id}`} label={t.moveDay}>
          <Select
            id={`move-day-${s.id}`}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setFull(false);
            }}
          >
            {days.map((d) => (
              <option key={d.date} value={d.date}>
                {formatDate(d.date, lang)}
                {closed.has(d.date) ? ` (${t.closed})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t.moveMeal}</p>
          <Segmented
            label={t.moveMeal}
            value={slot}
            options={r.slots.map((x) => ({ value: x, label: SLOT_LABELS[lang][x] }))}
            onChange={(v) => {
              setSlot(v);
              setFull(false);
            }}
          />
          <p className="text-sm text-muted">{same ? t.sameSpot : f('placesTaken', { taken, max: r.perSlot })}</p>
        </div>
        {full && (
          <p role="alert" className="rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
            {f('moveFullWarn', { taken, max: r.perSlot })}
          </p>
        )}
        <p className="text-sm text-muted">{t.noEmailNote}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={busy || same}>
            {busy && <Spinner />}
            {full ? t.moveAnyway : t.moveSubmit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function SignupsSection({ r, onChanged }: { r: AdminRequest; onChanged: () => void }) {
  const { t, f, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Signup[] | null>(null);
  const [moving, setMoving] = useState<Signup | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api.admin.listSignups(r.slug));
    } catch {
      toast(t.error, 'error');
    }
  }, [r.slug, t.error, toast]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const changed = () => {
    void load();
    onChanged();
  };

  return (
    <div className="rounded-2xl border border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-start font-medium hover:bg-surface-2/60"
      >
        <span className="flex items-center gap-2">
          <Users className="size-4 text-primary" aria-hidden />
          {f('signupsTitle', { n: r.signupCount })}
        </span>
        <span className="flex items-center gap-1 text-sm text-muted">
          {open ? t.hideSignups : t.showSignups}
          <ChevronDown className={cx('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
        </span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          {!list ? (
            <div className="py-4 text-center">
              <Spinner />
            </div>
          ) : list.length === 0 ? (
            <p className="py-2 text-muted">{t.noSignupsYet}</p>
          ) : (
            <ul className="divide-y divide-line">
              {list.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {formatDate(s.date, lang)} · {SLOT_LABELS[lang][s.slot]}
                    </p>
                    {(s.date < r.startDate || s.date > r.endDate || r.blockedDates.includes(s.date) || !r.slots.includes(s.slot)) && (
                      <Badge tone="warn" className="my-1">
                        {t.outsideSchedule}
                      </Badge>
                    )}
                    <p className="text-[15px]">
                      {s.name}
                      {s.phone && (
                        <>
                          {' · '}
                          <a href={`tel:${s.phone}`} dir="ltr" className="underline underline-offset-4">
                            {s.phone}
                          </a>
                        </>
                      )}
                    </p>
                    {s.dish && <p className="text-sm text-muted">{s.dish}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setMoving(s)}>
                      <CalendarClock className="size-4" aria-hidden />
                      {t.moveSignup}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      onClick={async () => {
                        const ok = await confirm({
                          title: t.remove,
                          body: f('removeSignupConfirm', { name: s.name, date: formatDate(s.date, lang) }),
                          confirmLabel: t.remove,
                          danger: true,
                        });
                        if (!ok) return;
                        try {
                          await api.admin.removeSignup(s.id);
                          toast(t.removedSignupToast);
                          changed();
                        } catch {
                          toast(t.error, 'error');
                        }
                      }}
                    >
                      <UserMinus className="size-4" aria-hidden />
                      {t.remove}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {moving && list && (
        <MoveDialog
          r={r}
          s={moving}
          list={list}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null);
            changed();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- one request

function RequestCard({ r, onChanged }: { r: AdminRequest; onChanged: () => void }) {
  const { t, f, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState(false);
  const [note, setNote] = useState(r.reviewNote);
  const days = computeDays(r);
  const openDays = days.filter((d) => !r.blockedDates.includes(d.date)).length;

  const review = async (status: BoardStatus, reviewNote: string, message: string) => {
    setBusy(true);
    try {
      await api.admin.review(r.slug, status, reviewNote);
      // Approval and decline emails go to the organizer; taking offline is quiet.
      if (status === 'approved' || status === 'declined') void api.notifyDecision(r.slug);
      toast(message);
      onChanged();
    } catch {
      toast(t.error, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="li" className="space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold">{f('boardFor', { name: r.familyName })}</h3>
          <p className="mt-1 text-sm text-muted">
            {f('sentOn', { date: formatDate(r.createdAt.slice(0, 10), lang) })}
            {r.reviewedBy && ` · ${f('reviewedBy', { email: r.reviewedBy })}`}
          </p>
        </div>
        {r.status === 'approved' && <Badge tone="accent">{f('signupCount', { n: r.signupCount })}</Badge>}
      </div>

      <p className="text-[15px]">
        <strong className="font-medium">{formatRange(r.startDate, r.endDate, lang)}</strong> · {openDays} {t.days} ·{' '}
        {r.slots.map((s) => SLOT_LABELS[lang][s]).join(', ')}
        {r.perSlot > 1 && ` × ${r.perSlot}`}
      </p>

      <BoardSummary board={r} />

      <dl className="grid gap-x-6 gap-y-2 rounded-2xl bg-surface-2/70 p-4 text-[15px] sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">{t.organizer}</dt>
          <dd>
            {r.details.organizerName || t.none}
            {r.private.organizerEmail && (
              <>
                {' · '}
                <a href={`mailto:${r.private.organizerEmail}`} className="underline underline-offset-4">
                  {r.private.organizerEmail}
                </a>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t.contactPhone}</dt>
          <dd>
            {r.private.phone ? (
              <a href={`tel:${r.private.phone}`} dir="ltr" className="inline-flex items-center gap-1 underline underline-offset-4">
                <Phone className="size-3.5" aria-hidden />
                {r.private.phone}
              </a>
            ) : (
              t.none
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted">{t.address}</dt>
          <dd>{r.private.address || t.none}</dd>
          {r.private.instructions && <dd className="mt-1 text-sm whitespace-pre-line text-muted">{r.private.instructions}</dd>}
        </div>
      </dl>

      {(r.status === 'approved' || r.status === 'offline' || r.signupCount > 0) && <SignupsSection r={r} onChanged={onChanged} />}

      {r.reviewNote && r.status !== 'approved' && (
        <p className="rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
          <strong className="font-semibold">{t.adminNote}: </strong>
          {r.reviewNote}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {(r.status === 'pending' || r.status === 'declined') && (
          <Button disabled={busy} onClick={() => review('approved', '', t.approvedToast)}>
            <Check className="size-4" aria-hidden />
            {t.approve}
          </Button>
        )}
        {r.status === 'offline' && (
          <Button disabled={busy} onClick={() => review('approved', '', t.backOnlineToast)}>
            <RotateCcw className="size-4" aria-hidden />
            {t.putBackOnline}
          </Button>
        )}
        {r.status === 'pending' && (
          <Button variant="secondary" disabled={busy} onClick={() => setDeclining(true)}>
            <X className="size-4" aria-hidden />
            {t.decline}
          </Button>
        )}
        {r.status === 'declined' && (
          <Button variant="ghost" disabled={busy} onClick={() => review('pending', r.reviewNote, t.movedToast)}>
            <Undo2 className="size-4" aria-hidden />
            {t.moveToPending}
          </Button>
        )}
        {r.status === 'approved' && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              if (!(await confirm({ title: t.takeOffline, body: t.takeOfflineConfirm, confirmLabel: t.takeOffline }))) return;
              await review('offline', r.reviewNote, t.offlineToast);
            }}
          >
            <EyeOff className="size-4" aria-hidden />
            {t.takeOffline}
          </Button>
        )}
        {r.status === 'approved' && (
          <Link to={`/b/${r.slug}`} className={buttonClass('ghost', 'md')}>
            <ExternalLink className="size-4" aria-hidden />
            {t.viewBoard}
          </Link>
        )}
        <Button variant="secondary" disabled={busy} onClick={() => setEditingCalendar(true)}>
          <CalendarDays className="size-4" aria-hidden />
          {t.editCalendar}
        </Button>
        {r.manageToken && (
          <Link to={`/m/${r.manageToken}`} className={buttonClass('ghost', 'md')}>
            {t.organizerPage}
          </Link>
        )}
        <Button
          variant="secondary"
          className="ms-auto border-danger/40 text-danger hover:bg-danger-soft"
          disabled={busy}
          onClick={async () => {
            if (!(await confirm({ title: t.deletePermanently, body: f('deletePermanentlyConfirm', { n: r.signupCount }), confirmLabel: t.yesDelete, danger: true }))) return;
            try {
              await api.admin.deleteBoard(r.slug);
              toast(t.deletedToast);
              onChanged();
            } catch {
              toast(t.error, 'error');
            }
          }}
        >
          <Trash2 className="size-4" aria-hidden />
          {t.deletePermanently}
        </Button>
      </div>

      {editingCalendar && (
        <CalendarDialog
          r={r}
          onClose={() => setEditingCalendar(false)}
          onSaved={() => {
            setEditingCalendar(false);
            onChanged();
          }}
        />
      )}

      <Dialog open={declining} onClose={() => setDeclining(false)} title={t.declineTitle}>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setDeclining(false);
            await review('declined', note, t.declinedToast);
          }}
        >
          <Field id={`note-${r.slug}`} label={t.declineNote} hint={t.declineNoteHint} optional>
            <TextArea id={`note-${r.slug}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeclining(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" variant="danger">
              {t.decline}
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}

function RequestList({ status, onCount }: { status: BoardStatus; onCount: (n: number) => void }) {
  const { t } = useI18n();
  const [list, setList] = useState<AdminRequest[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      const rows = await api.admin.listRequests(status);
      setList(rows);
      onCount(rows.length);
      setError(false);
    } catch {
      setError(true);
    }
  }, [status, onCount]);
  useEffect(() => {
    setList(null);
    load();
  }, [load]);

  if (error) return <p className="py-10 text-center text-danger">{t.error}</p>;
  if (!list) return <LoadingState />;
  if (list.length === 0) return <Card className="p-10 text-center text-muted">{t.noRequests}</Card>;
  return (
    <ul className="space-y-5">
      {list.map((r) => (
        <RequestCard key={r.slug} r={r} onChanged={load} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- admins

function Admins({ me }: { me: string }) {
  const { t, f } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<AdminEntry[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api.admin.listAdmins().then(setList, () => toast(t.error, 'error'));
  }, [t.error, toast]);
  useEffect(load, [load]);

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <h2 className="mb-3 text-2xl font-bold">{t.adminsTitle}</h2>
        <ul className="divide-y divide-line">
          {list.map((a) => (
            <li key={a.email} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0 truncate" dir="ltr">
                {a.email}
                {a.email === me && <span className="ms-2 text-sm text-muted">({t.you})</span>}
              </span>
              {a.email !== me && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onClick={async () => {
                    if (!(await confirm({ title: t.remove, body: f('removeAdminConfirm', { email: a.email }), confirmLabel: t.remove, danger: true }))) return;
                    try {
                      await api.admin.removeAdmin(a.email);
                      load();
                    } catch {
                      toast(t.error, 'error');
                    }
                  }}
                >
                  {t.remove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <UserPlus className="size-6 text-primary" aria-hidden />
          {t.addAdmin}
        </h2>
        <p className="text-muted">{t.addAdminHint}</p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!email.trim()) return;
            setBusy(true);
            try {
              await api.admin.addAdmin(email);
              setEmail('');
              load();
            } catch (err) {
              toast(err instanceof ApiError && err.code === 'invalid' ? t.invalidEmail : t.error, 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="min-w-56 flex-1">
            <Field id="new-admin" label={t.email}>
              <TextInput id="new-admin" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
          </div>
          <Button type="submit" disabled={busy || !email.trim()}>
            {busy && <Spinner />}
            {t.add}
          </Button>
        </form>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- page

export function Admin() {
  const { t, f } = useI18n();
  useTitle(t.adminTitle);
  const [state, setState] = useState<{ loading: boolean; email: string | null; isAdmin: boolean }>({ loading: true, email: null, isAdmin: false });
  const [tab, setTab] = useState<Tab>('pending');
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const email = await api.admin.session();
      if (!email) return setState({ loading: false, email: null, isAdmin: false });
      const me = await api.admin.me();
      setState({ loading: false, email: me.email || email, isAdmin: me.isAdmin });
    } catch {
      setState({ loading: false, email: null, isAdmin: false });
    }
  }, []);

  useEffect(() => {
    refresh();
    return api.admin.onChange(refresh);
  }, [refresh]);

  const onPendingCount = useCallback((n: number) => setPendingCount(n), []);
  const onOtherCount = useCallback(() => {}, []);

  if (state.loading) return <LoadingState />;
  if (!state.email) return <Navigate to="/login?next=/admin" replace />;

  const signOut = async () => {
    await api.admin.signOut();
    refresh();
  };

  if (!state.isAdmin) {
    return (
      <Page width="sm">
        <Card className="space-y-5 p-8 text-center">
          <p className="text-lg">{f('notAdmin', { email: state.email })}</p>
          <Button variant="secondary" onClick={signOut}>
            <LogOut className="size-4" aria-hidden />
            {t.signOut}
          </Button>
        </Card>
      </Page>
    );
  }

  const tabs: { id: Tab; label: string; badge?: number | null }[] = [
    { id: 'pending', label: t.tabPending, badge: pendingCount },
    { id: 'approved', label: t.tabApproved },
    { id: 'declined', label: t.tabDeclined },
    { id: 'offline', label: t.tabOffline },
    { id: 'admins', label: t.tabAdmins },
  ];

  return (
    <Page width="md">
      {api.mode === 'local' && (
        <p className="mb-5 flex items-center gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
          <Info className="size-4 shrink-0" aria-hidden />
          {t.demoAdmin}
        </p>
      )}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">{t.adminTitle}</h1>
          <p className="mt-1 text-sm text-muted">{f('signedInAs', { email: state.email })}</p>
        </div>
        {api.mode !== 'local' && (
          <Button variant="secondary" size="sm" onClick={signOut}>
            <LogOut className="size-4" aria-hidden />
            {t.signOut}
          </Button>
        )}
      </div>

      <div role="tablist" aria-label={t.adminTitle} className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
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
            {x.label}
            {!!x.badge && <span className={cx('rounded-full px-1.5 text-xs', tab === x.id ? 'bg-white/25' : 'bg-primary-soft text-primary')}>{x.badge}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'admins' ? (
          <Admins me={state.email} />
        ) : (
          <RequestList key={tab} status={tab} onCount={tab === 'pending' ? onPendingCount : onOtherCount} />
        )}
      </div>
    </Page>
  );
}
