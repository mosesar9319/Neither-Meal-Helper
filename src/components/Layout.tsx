import { useEffect, type ReactNode } from 'react';
import { Link, Outlet, ScrollRestoration } from 'react-router';
import { Info, SearchX, UserRound } from 'lucide-react';
import { useAccount } from '../lib/account';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { LinkButton, Spinner } from './ui';

export function Logo({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="32" r="32" fill="var(--primary)" />
      <path d="M16 30h32v4a14 14 0 0 1-14 14h-4a14 14 0 0 1-14-14z" fill="var(--bg)" />
      <rect x="12" y="27" width="40" height="5" rx="2.5" fill="var(--bg)" />
      <path d="M26 22c0-3 3-3 3-6M35 22c0-3 3-3 3-6" stroke="var(--bg)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function AccountLink() {
  const { t } = useI18n();
  const { loading, user } = useAccount();
  if (!api.googleEnabled || loading) return null;
  return (
    <Link to="/me" className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-medium hover:bg-surface-2" aria-label={t.myTitle}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-6 rounded-full" />
      ) : (
        <UserRound className="size-4" aria-hidden />
      )}
      <span className="hidden max-w-28 truncate sm:inline">{user ? user.name.split(' ')[0] || user.email : t.signIn}</span>
    </Link>
  );
}

export function Layout() {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">
        {t.skipToContent}
      </a>
      {api.mode === 'local' && (
        <div className="flex items-center justify-center gap-2 bg-warn-soft px-4 py-1.5 text-center text-xs text-warn">
          <Info className="size-3.5 shrink-0" aria-hidden />
          {t.demoMode}
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 rounded-full">
            <Logo />
            <span className="font-display text-lg font-bold sm:text-xl">{t.appName}</span>
          </Link>
          <div className="flex items-center gap-2">
          <AccountLink />
          <button
            type="button"
            onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
            className="h-9 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
            lang={lang === 'he' ? 'en' : 'he'}
          >
            {t.switchLang}
          </button>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <span className="flex items-center gap-2">
            <Logo className="size-5" /> {t.footer}
          </span>
          <span className="flex items-center gap-4">
            <Link to="/links" className="underline-offset-4 hover:underline">
              {t.findLinks}
            </Link>
            <Link to="/admin" className="underline-offset-4 hover:underline">
              {t.adminLink}
            </Link>
          </span>
        </div>
      </footer>
      <ScrollRestoration />
    </div>
  );
}

export function Page({ children, width = 'md' }: { children: ReactNode; width?: 'sm' | 'md' | 'lg' }) {
  const w = { sm: 'max-w-xl', md: 'max-w-3xl', lg: 'max-w-6xl' }[width];
  return <div className={`mx-auto w-full ${w} px-4 py-8 sm:px-6 sm:py-12`}>{children}</div>;
}

export function LoadingState() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-3 py-32 text-muted" role="status">
      <Spinner /> {t.loading}
    </div>
  );
}

export function NotFoundState() {
  const { t } = useI18n();
  return (
    <Page width="sm">
      <div className="py-16 text-center">
        <SearchX className="mx-auto mb-4 size-12 text-muted" aria-hidden />
        <h1 className="mb-2 text-3xl font-bold">{t.notFound}</h1>
        <p className="mb-8 text-muted">{t.notFoundText}</p>
        <LinkButton to="/">{t.goHome}</LinkButton>
      </div>
    </Page>
  );
}

export function useTitle(title: string | undefined) {
  const { t } = useI18n();
  useEffect(() => {
    document.title = title ? `${title} · ${t.appName}` : t.appName;
  }, [title, t.appName]);
}
