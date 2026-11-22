import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LogOut, UserRound } from 'lucide-react';
import { GoogleButton } from '../components/GoogleButton';
import { LoadingState, Page, useTitle } from '../components/Layout';
import { Badge, Button, Card, buttonClass } from '../components/ui';
import { useAccount } from '../lib/account';
import { api } from '../lib/api';
import { formatDate, formatRange, todayISO } from '../lib/dates';
import { SLOT_LABELS, useI18n } from '../lib/i18n';
import type { MyActivity } from '../lib/types';

/** "My requests and my meals" for someone signed in with Google. */
export function MyAccount() {
  const { t, f, lang } = useI18n();
  useTitle(t.myTitle);
  const { loading, user } = useAccount();
  const [activity, setActivity] = useState<MyActivity | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Give device-link merging a moment to land before the first read.
    const h = setTimeout(() => api.account.activity().then(setActivity, () => setError(true)), 400);
    return () => clearTimeout(h);
  }, [user]);

  if (loading) return <LoadingState />;

  if (!user) {
    return (
      <Page width="sm">
        <Card className="space-y-5 p-6 sm:p-8">
          <UserRound className="size-10 text-primary" aria-hidden />
          <h1 className="text-3xl font-bold">{t.myTitle}</h1>
          <p className="text-muted">{api.googleEnabled ? t.mySignedOutText : t.googleUnavailable}</p>
          <GoogleButton returnPath="/me" />
          <p className="text-sm text-muted">
            <Link to="/links" className="underline underline-offset-4">
              {t.findLinks}
            </Link>
          </p>
        </Card>
      </Page>
    );
  }

  const today = todayISO();
  const statusTone = { pending: 'primary', approved: 'accent', declined: 'warn' } as const;
  const statusLabel = { pending: t.tabPending, approved: t.tabApproved, declined: t.tabDeclined };

  return (
    <Page width="md">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-12 rounded-full" />
          ) : (
            <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
              <UserRound className="size-6" aria-hidden />
            </span>
          )}
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">{t.myTitle}</h1>
            <p className="text-sm text-muted">{f('signedInAs', { email: user.email })}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => api.account.signOut()}>
          <LogOut className="size-4" aria-hidden />
          {t.signOut}
        </Button>
      </div>

      {error && <p className="mb-6 text-danger">{t.error}</p>}
      {!activity && !error && <LoadingState />}

      {activity && (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">{t.myRequests}</h2>
              <Link to="/new" className={buttonClass('secondary', 'sm')}>
                {t.startBoard}
              </Link>
            </div>
            {activity.boards.length === 0 ? (
              <Card className="p-6 text-muted">{t.nothingYet}</Card>
            ) : (
              <ul className="space-y-2">
                {activity.boards.map((b) => (
                  <Card as="li" key={b.slug} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-semibold">{f('boardFor', { name: b.familyName })}</p>
                      <p className="text-sm text-muted">{formatRange(b.startDate, b.endDate, lang)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone[b.status]}>{statusLabel[b.status]}</Badge>
                      {b.manageToken && (
                        <Link to={`/m/${b.manageToken}`} className={buttonClass('secondary', 'sm')}>
                          {t.manage}
                        </Link>
                      )}
                    </div>
                  </Card>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold">{t.myMeals}</h2>
            {activity.signups.length === 0 ? (
              <Card className="p-6 text-muted">{t.nothingYet}</Card>
            ) : (
              <ul className="space-y-2">
                {[...activity.signups]
                  .sort((a, b) => (a.date >= today) === (b.date >= today) ? a.date.localeCompare(b.date) : a.date >= today ? -1 : 1)
                  .map((s) => (
                    <Card as="li" key={s.editToken} className={`flex flex-wrap items-center justify-between gap-3 p-4 ${s.date < today ? 'opacity-60' : ''}`}>
                      <div>
                        <p className="font-semibold">
                          {formatDate(s.date, lang)} · {SLOT_LABELS[lang][s.slot]}
                        </p>
                        <p className="text-sm text-muted">
                          {f('boardFor', { name: s.familyName })}
                          {s.dish && ` · ${s.dish}`}
                        </p>
                      </div>
                      <Link to={`/s/${s.editToken}`} className={buttonClass('secondary', 'sm')}>
                        {t.open}
                      </Link>
                    </Card>
                  ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}
