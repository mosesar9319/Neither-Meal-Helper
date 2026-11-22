import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { FamilySection, FoodSection, PrivateSection, ScheduleSection, validateBoard, type Errors } from '../components/BoardForm';
import { BoardSummary } from '../components/BoardView';
import { Page, useTitle } from '../components/Layout';
import { Button, Card, Spinner, cx, useToast } from '../components/ui';
import { api } from '../lib/api';
import { addDays, formatRange, todayISO } from '../lib/dates';
import { device } from '../lib/device';
import { SLOT_LABELS, useI18n } from '../lib/i18n';
import { computeDays } from '../lib/schedule';
import { defaultDetails, type BoardInput } from '../lib/types';

function initialInput(): BoardInput {
  const start = addDays(todayISO(), 1);
  return {
    familyName: '',
    startDate: start,
    endDate: addDays(start, 13),
    slots: ['dinner'],
    perSlot: 1,
    details: defaultDetails(),
    private: { address: '', instructions: '', phone: '', organizerEmail: '' },
  };
}

const STEP_FIELDS: (keyof Errors)[][] = [['familyName'], [], ['dates', 'slots'], []];

export function NewBoard() {
  const { t, f, lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  useTitle(t.newBoard);
  const [value, setValue] = useState<BoardInput>(initialInput);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const steps = [t.stepFamily, t.stepFood, t.stepSchedule, t.stepPrivate];
  const BackIcon = lang === 'he' ? ArrowRight : ArrowLeft;
  const NextIcon = lang === 'he' ? ArrowLeft : ArrowRight;

  const update = (next: BoardInput) => {
    setValue(next);
    // Clear errors as soon as the field is fixed.
    if (Object.keys(errors).length) setErrors(validateBoard(next, t, STEP_FIELDS[step]));
  };

  const go = (target: number) => {
    if (target > step) {
      for (let s = step; s < target; s++) {
        const e = validateBoard(value, t, STEP_FIELDS[s]);
        if (Object.keys(e).length) {
          setStep(s);
          setErrors(e);
          return;
        }
      }
    }
    setErrors({});
    setStep(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    const e = validateBoard(value, t);
    if (Object.keys(e).length) {
      setErrors(e);
      setStep(e.familyName ? 0 : 2);
      return;
    }
    setBusy(true);
    try {
      const { slug, manageToken } = await api.createBoard(value);
      device.rememberBoard({ slug, familyName: value.familyName.trim(), manageToken });
      void api.notifyRequest(manageToken);
      navigate(`/m/${manageToken}?new=1`);
    } catch {
      toast(t.error, 'error');
      setBusy(false);
    }
  };

  const days = computeDays(value);
  const open = days.filter((d) => !d.blocked).length;

  return (
    <Page width="md">
      <h1 className="mb-2 text-3xl font-bold sm:text-4xl">{t.newBoard}</h1>
      <p className="mb-6 text-sm text-muted">{f('stepOf', { n: step + 1, total: steps.length })}</p>

      <nav aria-label={t.newBoard} className="mb-8">
        <ol className="grid grid-cols-4 gap-2">
          {steps.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === step ? 'step' : undefined}
                className="group flex w-full flex-col gap-2 text-start"
              >
                <span className={cx('h-1.5 rounded-full transition-colors', i <= step ? 'bg-primary' : 'bg-line')} />
                <span className={cx('flex items-center gap-1 text-xs font-medium sm:text-sm', i === step ? 'text-ink' : 'text-muted')}>
                  {i < step && <Check className="size-3.5 text-accent" aria-hidden />}
                  {label}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step < steps.length - 1) go(step + 1);
          else submit();
        }}
        noValidate
      >
        <Card className="p-5 sm:p-7">
          <div key={step} className="animate-rise">
            <h2 className="mb-6 text-2xl font-bold">{steps[step]}</h2>
            {step === 0 && <FamilySection value={value} onChange={update} errors={errors} />}
            {step === 1 && <FoodSection value={value} onChange={update} />}
            {step === 2 && <ScheduleSection value={value} onChange={update} errors={errors} />}
            {step === 3 && (
              <div className="space-y-8">
                <PrivateSection value={value} onChange={update} />
                <section aria-labelledby="review" className="space-y-3 rounded-3xl bg-surface-2/60 p-4 sm:p-5">
                  <h3 id="review" className="text-xl font-bold">
                    {t.review}
                  </h3>
                  <p className="text-lg font-semibold">{f('boardFor', { name: value.familyName || '…' })}</p>
                  <p className="text-sm text-muted">
                    {formatRange(value.startDate, value.endDate, lang)} · {open} {t.days} · {value.slots.map((s) => SLOT_LABELS[lang][s]).join(', ')}
                    {value.perSlot > 1 && ` × ${value.perSlot}`}
                  </p>
                  <BoardSummary board={{ slug: '', status: 'pending', reviewNote: '', ...value, blockedDates: [] }} />
                </section>
              </div>
            )}
          </div>
        </Card>

        <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-line/70 bg-bg/90 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0} className={cx(step === 0 && 'invisible')}>
            <BackIcon className="size-4" aria-hidden />
            {t.back}
          </Button>
          {step < steps.length - 1 ? (
            <Button type="submit">
              {t.next}
              <NextIcon className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : <Check className="size-4" aria-hidden />}
              {busy ? t.creating : t.create}
            </Button>
          )}
        </div>
      </form>
    </Page>
  );
}
