import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Pencil, UtensilsCrossed } from 'lucide-react';
import { LoadingState, NotFoundState, Page, useTitle } from '../components/Layout';
import { CalendarButtons, DeliveryDetails, SignupFields, SubmitButton, slotDateLabel, useSignupForm } from '../components/SignupParts';
import { Button, Card, LinkButton, useConfirm, useToast } from '../components/ui';
import { api } from '../lib/api';
import { device } from '../lib/device';
import { useI18n } from '../lib/i18n';
import { absoluteUrl } from '../lib/share';
import type { MySignupData } from '../lib/types';
import { useAsync } from '../lib/useAsync';

function EditForm({ data, token, onSaved, onCancel }: { data: MySignupData; token: string; onSaved: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const s = data.signup;
  const { value, setValue, errors, validate } = useSignupForm({ name: s.name, phone: s.phone, email: s.email, dish: s.dish, note: s.note });
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setBusy(true);
        try {
          await api.updateMySignup(token, value);
          toast(t.saved);
          onSaved();
        } catch {
          toast(t.error, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <SignupFields value={value} onChange={setValue} errors={errors} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t.cancel}
        </Button>
        <SubmitButton busy={busy} label={t.save} busyLabel={t.saving} />
      </div>
    </form>
  );
}

export function MySignup() {
  const { token = '' } = useParams();
  const { t, f, lang } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.getMySignup(token), [token]);
  const [editing, setEditing] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  useTitle(data ? f('mySignupTitle', { name: data.board.familyName }) : undefined);

  useEffect(() => {
    if (data) device.rememberSignup({ editToken: token, slug: data.board.slug, familyName: data.board.familyName, date: data.signup.date });
  }, [data, token]);

  if (cancelled) {
    return (
      <Page width="sm">
        <Card className="p-8 text-center">
          <p className="mb-6 text-lg">{t.cancelled}</p>
          {data && <LinkButton to={`/b/${data.board.slug}`}>{t.viewBoard}</LinkButton>}
        </Card>
      </Page>
    );
  }
  if (loading && !data) return <LoadingState />;
  if (error || !data) return <NotFoundState />;

  const s = data.signup;
  const cancel = async () => {
    const ok = await confirm({ title: t.cancelSignup, body: t.cancelSignupConfirm, confirmLabel: t.yesCancel, cancelLabel: t.keep, danger: true });
    if (!ok) return;
    try {
      await api.cancelMySignup(token);
      device.forgetSignup(token);
      setCancelled(true);
    } catch {
      toast(t.error, 'error');
    }
  };

  return (
    <Page width="sm">
      <h1 className="mb-2 text-3xl font-bold">{f('mySignupTitle', { name: data.board.familyName })}</h1>
      <p className="mb-6 text-lg font-medium text-primary">{slotDateLabel(lang, s.slot, s.date)}</p>

      <Card className="space-y-5 p-5 sm:p-6">
        {editing ? (
          <EditForm
            data={data}
            token={token}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              reload();
            }}
          />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-lg font-semibold">
                  <UtensilsCrossed className="size-5 text-primary" aria-hidden />
                  {s.dish || t.none}
                </p>
                <p className="mt-1 text-muted">
                  {s.name}
                  {s.phone && <> · <span dir="ltr">{s.phone}</span></>}
                  {s.email && <> · {s.email}</>}
                </p>
                {s.note && <p className="mt-2 text-[15px]">{s.note}</p>}
              </div>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="size-4" aria-hidden />
                {t.editSignup}
              </Button>
            </div>
            <DeliveryDetails board={data.board} date={s.date} priv={data.private} />
            <CalendarButtons board={data.board} date={s.date} slot={s.slot} priv={data.private} dish={s.dish} uid={s.id} editUrl={absoluteUrl(`/s/${token}`)} />
          </>
        )}
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/b/${data.board.slug}`} className="text-sm underline underline-offset-4">
          {t.viewBoard}
        </Link>
        <Button variant="ghost" className="text-danger" onClick={cancel}>
          {t.cancelSignup}
        </Button>
      </div>
    </Page>
  );
}
