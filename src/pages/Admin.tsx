import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Check, ExternalLink, Info, LogOut, Mail, Phone, ShieldCheck, Trash2, Undo2, UserPlus, X } from 'lucide-react';
import { BoardSummary } from '../components/BoardView';
import { GoogleButton, OrDivider } from '../components/GoogleButton';
import { LoadingState, Page, useTitle } from '../components/Layout';
import { Badge, Button, Card, Dialog, Field, Spinner, TextArea, TextInput, buttonClass, cx, useConfirm, useToast } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatDate, formatRange } from '../lib/dates';
import { SLOT_LABELS, useI18n } from '../lib/i18n';
import { computeDays } from '../lib/schedule';
import { absoluteUrl } from '../lib/share';
import type { AdminEntry, AdminRequest, BoardStatus } from '../lib/types';

type Tab = BoardStatus | 'admins';

// ---------------------------------------------------------------- sign-in

function SignIn() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<{ message: string; detail: string } | null>(null);
  return (
    <Page width="sm">
      <Card className="space-y-4 p-6 sm:p-8">
        <ShieldCheck className="size-10 text-primary" aria-hidden />
        <h1 className="text-3xl font-bold">{t.adminSignInTitle}</h1>
        <p className="text-muted">{t.adminSignInText}</p>
        {!sent && (
          <>
            <GoogleButton returnPath="/admin" />
            <OrDivider />
          </>
        )}
        {sent ? (
          <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-accent">
            {t.linkSent}
          </p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!email.trim()) return;
              setBusy(true);
              setError(null);
              try {
                await api.admin.requestLink(email, absoluteUrl('/admin'));
                setSent(true);
              } catch (err) {
                const code = err instanceof ApiError ? err.code : 'unknown';
                setError({
                  message: code === 'rate_limited' ? t.linkErrorRate : code === 'signup_disabled' ? t.linkErrorNoAccount : t.linkErrorGeneric,
                  detail: err instanceof Error ? err.message : '',
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field id="admin-email" label={t.email}>
              <TextInput id="admin-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            {error && (
              <div role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
                <p className="font-medium">{error.message}</p>
                {error.detail && (
                  <p dir="ltr" className="mt-1 text-xs opacity-80">
                    {error.detail}
                  </p>
                )}
              </div>
            )}
            <Button type="submit" disabled={busy || !email.trim()} className="w-full">
              {busy ? <Spinner /> : <Mail className="size-4" aria-hidden />}
              {t.sendLink}
            </Button>
          </form>
        )}
      </Card>
    </Page>
  );
}

// ---------------------------------------------------------------- one request

function RequestCard({ r, onChanged }: { r: AdminRequest; onChanged: () => void }) {
  const { t, f, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState(r.reviewNote);
  const days = computeDays(r);
  const openDays = days.filter((d) => !r.blockedDates.includes(d.date)).length;

  const review = async (status: BoardStatus, reviewNote: string, message: string) => {
    setBusy(true);
    try {
      await api.admin.review(r.slug, status, reviewNote);
      if (status !== 'pending') void api.notifyDecision(r.slug);
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

      {r.reviewNote && r.status !== 'approved' && (
        <p className="rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
          <strong className="font-semibold">{t.adminNote}: </strong>
          {r.reviewNote}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {r.status !== 'approved' && (
          <Button disabled={busy} onClick={() => review('approved', '', t.approvedToast)}>
            <Check className="size-4" aria-hidden />
            {t.approve}
          </Button>
        )}
        {r.status !== 'declined' && (
          <Button variant="secondary" disabled={busy} onClick={() => setDeclining(true)}>
            <X className="size-4" aria-hidden />
            {t.decline}
          </Button>
        )}
        {r.status !== 'pending' && (
          <Button variant="ghost" disabled={busy} onClick={() => review('pending', r.reviewNote, t.movedToast)}>
            <Undo2 className="size-4" aria-hidden />
            {t.moveToPending}
          </Button>
        )}
        {r.status === 'approved' && (
          <Link to={`/b/${r.slug}`} className={buttonClass('ghost', 'md')}>
            <ExternalLink className="size-4" aria-hidden />
            {t.viewBoard}
          </Link>
        )}
        {r.manageToken && (
          <Link to={`/m/${r.manageToken}`} className={buttonClass('ghost', 'md')}>
            {t.organizerPage}
          </Link>
        )}
        <Button
          variant="ghost"
          className="ms-auto text-danger"
          disabled={busy}
          onClick={async () => {
            if (!(await confirm({ title: t.deleteBoard, body: t.adminDeleteConfirm, confirmLabel: t.yesDelete, danger: true }))) return;
            try {
              await api.admin.deleteBoard(r.slug);
              onChanged();
            } catch {
              toast(t.error, 'error');
            }
          }}
        >
          <Trash2 className="size-4" aria-hidden />
          {t.remove}
        </Button>
      </div>

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
  if (!state.email) return <SignIn />;

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
