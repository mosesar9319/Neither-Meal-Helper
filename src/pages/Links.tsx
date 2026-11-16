import { useState } from 'react';
import { Link } from 'react-router';
import { Mail, X } from 'lucide-react';
import { Page, useTitle } from '../components/Layout';
import { Button, Card, Field, Spinner, TextInput, buttonClass, useToast } from '../components/ui';
import { api } from '../lib/api';
import { formatDate } from '../lib/dates';
import { device } from '../lib/device';
import { useI18n } from '../lib/i18n';

export function Links() {
  const { t, lang } = useI18n();
  const toast = useToast();
  useTitle(t.recoverTitle);
  const [boards, setBoards] = useState(device.boards);
  const [signups, setSignups] = useState(device.signups);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <Page width="sm">
      <h1 className="mb-8 text-3xl font-bold sm:text-4xl">{t.recoverTitle}</h1>

      <Card className="mb-5 p-5 sm:p-6">
        <h2 className="mb-4 text-xl font-bold">{t.recoverOnDevice}</h2>
        {boards.length === 0 && signups.length === 0 ? (
          <p className="text-muted">{t.recoverNothing}</p>
        ) : (
          <ul className="divide-y divide-line">
            {boards.map((b) => (
              <li key={b.manageToken} className="flex items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1 truncate font-medium">{b.familyName}</span>
                <Link to={`/m/${b.manageToken}`} className={buttonClass('secondary', 'sm')}>
                  {t.manage}
                </Link>
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2"
                  aria-label={`${t.forget}: ${b.familyName}`}
                  onClick={() => {
                    device.forgetBoard(b.manageToken);
                    setBoards(device.boards());
                  }}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
            {signups.map((s) => (
              <li key={s.editToken} className="flex items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1 truncate">
                  <strong className="font-medium">{s.familyName}</strong> · {formatDate(s.date, lang)}
                </span>
                <Link to={`/s/${s.editToken}`} className={buttonClass('secondary', 'sm')}>
                  {t.open}
                </Link>
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2"
                  aria-label={`${t.forget}: ${s.familyName}`}
                  onClick={() => {
                    device.forgetSignup(s.editToken);
                    setSignups(device.signups());
                  }}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Mail className="size-5 text-primary" aria-hidden />
          {t.recoverEmailTitle}
        </h2>
        <p className="text-muted">{t.recoverEmailText}</p>
        {api.mode === 'local' ? (
          <p className="rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">{t.recoverUnavailable}</p>
        ) : sent ? (
          <p className="rounded-2xl bg-accent-soft px-4 py-3 text-accent">{t.recoverSent}</p>
        ) : (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!email.trim()) return;
              setBusy(true);
              try {
                await api.recoverLinks(email.trim());
                setSent(true);
              } catch {
                toast(t.error, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="min-w-56 flex-1">
              <Field id="rec-email" label={t.email}>
                <TextInput id="rec-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
            </div>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner />}
              {t.send}
            </Button>
          </form>
        )}
      </Card>
    </Page>
  );
}
