import { useState } from 'react';
import { Mail } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { absoluteUrl } from '../lib/share';
import { GoogleButton, OrDivider } from './GoogleButton';
import { PrivacyLink } from './Layout';
import { Button, Field, Spinner, TextInput } from './ui';

/** Only same-site paths, so a crafted link can't send people elsewhere after signing in. */
export function safeNext(raw: string | null | undefined, fallback = '/me'): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : fallback;
}

/**
 * One way in for everyone (admins, people requesting meals, people cooking):
 * Continue with Google, or a one-time link by email. Comes back to `next`.
 */
export function LoginPanel({ next }: { next: string }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<{ message: string; detail: string } | null>(null);

  if (sent) {
    return (
      <div role="status" className="space-y-2 rounded-2xl bg-accent-soft px-4 py-4 text-accent">
        <p className="font-semibold">{t.loginLinkSentTitle}</p>
        <p className="text-sm">{t.loginLinkSentText}</p>
        <button type="button" className="text-sm underline underline-offset-4" onClick={() => setSent(false)}>
          {t.loginUseOtherEmail}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GoogleButton returnPath={next} />
      <OrDivider />
      <form
        className="space-y-3"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!email.trim()) return;
          setBusy(true);
          setError(null);
          try {
            await api.account.requestEmailLink(email, absoluteUrl(next));
            setSent(true);
          } catch (err) {
            const code = err instanceof ApiError ? err.code : 'unknown';
            setError({
              message: code === 'rate_limited' ? t.linkErrorRate : code === 'signup_disabled' ? t.loginSignupDisabled : t.linkErrorGeneric,
              detail: err instanceof Error ? err.message : '',
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field id="login-email" label={t.loginEmailLabel}>
          <TextInput id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
        <Button type="submit" variant={api.googleEnabled ? 'secondary' : 'primary'} disabled={busy || !email.trim()} className="w-full">
          {busy ? <Spinner /> : <Mail className="size-4" aria-hidden />}
          {t.loginSendLink}
        </Button>
      </form>
      <p className="text-xs text-muted">
        {t.loginFinePrint} <PrivacyLink />
      </p>
    </div>
  );
}
