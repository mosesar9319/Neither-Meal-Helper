import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { HeartHandshake, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { LoadingState, Page, useTitle } from '../components/Layout';
import { LoginPanel, safeNext } from '../components/LoginPanel';
import { Button, Card, buttonClass } from '../components/ui';
import { useAccount } from '../lib/account';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';

/** The single sign-in page for admins, people requesting meals, and people cooking. */
export function Login() {
  const { t, f } = useI18n();
  useTitle(t.loginTitle);
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { loading, user } = useAccount();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.admin.me().then((m) => setIsAdmin(m.isAdmin), () => setIsAdmin(false));
  }, [user]);

  if (loading) return <LoadingState />;

  if (user) {
    return (
      <Page width="sm">
        <Card className="space-y-5 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-12 rounded-full" />
            ) : (
              <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
                <UserRound className="size-6" aria-hidden />
              </span>
            )}
            <div>
              <h1 className="text-2xl font-bold">{t.loginWelcome}</h1>
              <p className="text-sm text-muted">{f('signedInAs', { email: user.email })}</p>
            </div>
          </div>
          <div className="grid gap-2">
            {next !== '/me' && next !== '/login' && (
              <Link to={next} className={buttonClass('primary', 'md')}>
                {t.loginContinue}
              </Link>
            )}
            <Link to="/me" className={buttonClass(next === '/me' ? 'primary' : 'secondary', 'md')}>
              <HeartHandshake className="size-4" aria-hidden />
              {t.myTitle}
            </Link>
            {isAdmin && (
              <Link to="/admin" className={buttonClass('secondary', 'md')}>
                <ShieldCheck className="size-4" aria-hidden />
                {t.adminTitle}
              </Link>
            )}
            <Button variant="ghost" onClick={() => api.account.signOut()}>
              <LogOut className="size-4" aria-hidden />
              {t.signOut}
            </Button>
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page width="sm">
      <Card className="space-y-5 p-6 sm:p-8">
        <div>
          <h1 className="mb-2 text-3xl font-bold">{t.loginTitle}</h1>
          <p className="text-muted">{t.loginText}</p>
        </div>
        <LoginPanel next={next} />
      </Card>
    </Page>
  );
}
