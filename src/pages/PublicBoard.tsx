import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CheckCircle2, Share2 } from 'lucide-react';
import { BoardDays, BoardProgress, BoardSummary } from '../components/BoardView';
import { LoadingState, NotFoundState, Page, useTitle } from '../components/Layout';
import {
  CalendarButtons,
  DeliveryDetails,
  PlannedDishes,
  SignupFields,
  SubmitButton,
  slotDateLabel,
  useSignupForm,
} from '../components/SignupParts';
import { Button, Card, CopyField, Dialog, buttonClass, useToast } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatDate, formatRange, todayISO } from '../lib/dates';
import { device } from '../lib/device';
import { SLOT_LABELS, useI18n } from '../lib/i18n';
import { buildBoardDays, type DaySlots } from '../lib/schedule';
import { absoluteUrl, whatsappUrl } from '../lib/share';
import type { MealSlot, PrivateDetails, PublicBoardData } from '../lib/types';
import { useAsync } from '../lib/useAsync';

interface Picked {
  date: string;
  slot: MealSlot;
}
interface Done extends Picked {
  name: string;
  dish: string;
  editToken: string;
  signupId: string;
  private: PrivateDetails;
}

function SignupDialog({ data, picked, onClose, onDone }: { data: PublicBoardData; picked: Picked | null; onClose: () => void; onDone: (d: Done) => void }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { value, setValue, errors, validate } = useSignupForm({ ...device.getContact(), dish: '', note: '' });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!picked || !validate()) return;
    setBusy(true);
    try {
      const res = await api.signUp(data.board.slug, { ...picked, ...value });
      device.setContact({ name: value.name.trim(), phone: value.phone.trim(), email: value.email.trim() });
      device.rememberSignup({ editToken: res.editToken, slug: data.board.slug, familyName: data.board.familyName, date: picked.date });
      void api.notifySignup(res.editToken);
      onDone({ ...picked, name: value.name.trim(), dish: value.dish.trim(), ...res });
      setValue((v) => ({ ...v, dish: '', note: '' }));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'unknown';
      toast(code === 'slot_full' ? t.slotFull : code === 'day_closed' ? t.dayClosed : t.error, 'error');
      if (code === 'slot_full' || code === 'day_closed') onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!picked} onClose={onClose} title={t.signUpTitle} wide>
      {picked && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
          className="space-y-5"
        >
          <p className="rounded-2xl bg-primary-soft px-4 py-3 font-medium text-primary">{slotDateLabel(lang, picked.slot, picked.date)}</p>
          <PlannedDishes signups={data.signups} />
          <SignupFields value={value} onChange={setValue} errors={errors} />
          <div className="flex justify-end">
            <SubmitButton busy={busy} label={t.confirm} busyLabel={t.signingUp} />
          </div>
        </form>
      )}
    </Dialog>
  );
}

function ThanksDialog({ done, data, onClose }: { done: Done | null; data: PublicBoardData; onClose: () => void }) {
  const { t, f, lang } = useI18n();
  const editUrl = done ? absoluteUrl(`/s/${done.editToken}`) : '';
  return (
    <Dialog open={!!done} onClose={onClose} title={done ? f('thanksTitle', { name: done.name.split(' ')[0] }) : ''} wide>
      {done && (
        <div className="space-y-5">
          <p className="flex items-start gap-2 text-lg">
            <CheckCircle2 className="mt-1 size-5 shrink-0 text-accent" aria-hidden />
            {f('thanksText', { slot: SLOT_LABELS[lang][done.slot], date: formatDate(done.date, lang) })}
          </p>
          <DeliveryDetails board={data.board} date={done.date} priv={done.private} />
          <CalendarButtons board={data.board} date={done.date} slot={done.slot} priv={done.private} dish={done.dish} uid={done.signupId} editUrl={editUrl} />
          <div>
            <p className="mb-1 text-sm font-semibold">{t.yourLink}</p>
            <p className="mb-2 text-[13px] text-muted">{t.yourLinkHint}</p>
            <CopyField value={editUrl} label={t.yourLink} />
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>{t.done}</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export function PublicBoard() {
  const { slug = '' } = useParams();
  const { t, f, lang } = useI18n();
  const { data, error, loading, reload } = useAsync(() => api.getPublicBoard(slug), [slug]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  useTitle(data ? f('boardFor', { name: data.board.familyName }) : undefined);

  const days = useMemo(() => (data ? buildBoardDays(data.board, data.signups, todayISO()) : []), [data]);

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <NotFoundState />;

  const url = absoluteUrl(`/b/${slug}`);
  const shareText = `${f('shareText', { name: data.board.familyName })}\n${url}`;

  return (
    <Page width="lg">
      <div className="grid gap-8 lg:grid-cols-[340px_1fr] lg:items-start">
        <aside className="space-y-5 lg:sticky lg:top-24">
          <div>
            <p className="mb-1 text-sm text-muted">{formatRange(data.board.startDate, data.board.endDate, lang)}</p>
            <h1 className="text-3xl font-bold sm:text-4xl">{f('boardFor', { name: data.board.familyName })}</h1>
          </div>
          <BoardSummary board={data.board} />
          <Card className="space-y-4 p-4">
            <BoardProgress days={days} />
            <div className="flex flex-wrap gap-2">
              <a href={whatsappUrl(shareText)} target="_blank" rel="noreferrer" className={buttonClass('whatsapp', 'sm')}>
                <Share2 className="size-4" aria-hidden />
                {t.shareWhatsapp}
              </a>
            </div>
          </Card>
        </aside>
        <section aria-label={t.viewCalendar}>
          <BoardDays board={data.board} days={days} onTake={(d: DaySlots, slot) => setPicked({ date: d.date, slot })} />
        </section>
      </div>

      <SignupDialog
        data={data}
        picked={picked}
        onClose={() => {
          setPicked(null);
          reload();
        }}
        onDone={(d) => {
          setPicked(null);
          setDone(d);
          reload();
        }}
      />
      <ThanksDialog done={done} data={data} onClose={() => setDone(null)} />
      <p className="mt-12 text-center text-sm text-muted">
        <Link to="/new" className="underline underline-offset-4 hover:text-ink">
          {t.startBoard}
        </Link>
      </p>
    </Page>
  );
}
