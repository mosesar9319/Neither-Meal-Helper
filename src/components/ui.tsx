import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, type LinkProps } from 'react-router';
import { Check, Copy, Minus, Plus, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { copyText } from '../lib/share';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'whatsapp';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink hover:bg-primary-hover shadow-card',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90',
  whatsapp: 'bg-[#1f8f4e] text-white hover:bg-[#187a42]',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-[15px] gap-2',
  lg: 'h-13 px-7 text-base gap-2.5',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cx(
    'inline-flex items-center justify-center rounded-full font-medium transition-colors select-none',
    'disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant, size, className, ...props }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'li' }) {
  return <As className={cx('rounded-3xl border border-line bg-surface shadow-card', className)}>{children}</As>;
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'accent' | 'primary' | 'warn' | 'danger'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent',
    primary: 'bg-primary-soft text-primary',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

// ---------------------------------------------------------------- form fields

const inputBase =
  'w-full rounded-2xl border border-line bg-surface px-4 py-2.5 text-[15px] text-ink placeholder:text-muted/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 aria-[invalid=true]:border-danger';

export function Field({
  label,
  hint,
  error,
  optional,
  children,
  id,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | false;
  optional?: boolean;
  id: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline gap-2 text-sm font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-muted">({t.optional})</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ invalid, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cx(inputBase, 'h-11', className)}
      aria-invalid={invalid || undefined}
      aria-describedby={props.id ? `${props.id}-${invalid ? 'err' : 'hint'}` : undefined}
      {...props}
    />
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={3}
      className={cx(inputBase, 'resize-y', className)}
      aria-describedby={props.id ? `${props.id}-hint` : undefined}
      {...props}
    />
  );
}

export function ChipToggle({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors',
        selected ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-ink hover:bg-surface-2',
      )}
    >
      {selected && <Check className="size-4" aria-hidden />}
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-10 rounded-full border px-4 text-sm font-medium transition-colors',
            value === o.value ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:bg-surface-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  label,
  id,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  label: string;
  id: string;
}) {
  return (
    <div className="flex h-11 items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-1.5">
      <button
        type="button"
        className="grid size-8 place-items-center rounded-full text-ink hover:bg-surface-2 disabled:opacity-30"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`${label} −`}
      >
        <Minus className="size-4" />
      </button>
      <output id={id} aria-live="polite" className="min-w-8 text-center text-base font-semibold tabular-nums">
        {value}
      </output>
      <button
        type="button"
        className="grid size-8 place-items-center rounded-full text-ink hover:bg-surface-2 disabled:opacity-30"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`${label} +`}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div>
        <label htmlFor={id} className="text-[15px] font-medium">
          {label}
        </label>
        {hint && <p className="text-[13px] text-muted">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line')}
      >
        <span
          className={cx(
            'absolute top-1 size-5 rounded-full bg-white shadow transition-all',
            checked ? 'start-6' : 'start-1',
          )}
        />
      </button>
    </div>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 p-1.5 ps-4">
      <span dir="ltr" className="min-w-0 flex-1 truncate text-sm text-muted" title={value}>
        {value}
      </span>
      <Button
        size="sm"
        variant="secondary"
        aria-label={label ? `${t.copy}: ${label}` : t.copy}
        onClick={async () => {
          if (await copyText(value)) {
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          }
        }}
      >
        {done ? <Check className="size-4" /> : <Copy className="size-4" />}
        {done ? t.copied : t.copy}
      </Button>
    </div>
  );
}

export function Spinner() {
  return <span className="inline-block size-5 animate-spin rounded-full border-2 border-current border-e-transparent" aria-hidden />;
}

// ---------------------------------------------------------------- dialog

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        'm-auto max-h-[92dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-3xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]',
        wide ? 'max-w-xl' : 'max-w-md',
      )}
    >
      {open && (
        <div className="animate-rise p-5 sm:p-7">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-2xl font-bold">{title}</h2>
            <button type="button" onClick={onClose} className="-m-1 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label={t.close}>
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);
const ToastCtx = createContext<(msg: string, tone?: 'ok' | 'error') => void>(() => {});

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'error'; id: number } | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...o, resolve })), []);
  const notify = useCallback((msg: string, tone: 'ok' | 'error' = 'ok') => setToast({ msg, tone, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(h);
  }, [toast]);

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      <ToastCtx.Provider value={notify}>
        {children}
        <Dialog open={!!confirmState} onClose={() => close(false)} title={confirmState?.title ?? ''}>
          {confirmState?.body && <p className="mb-6 text-muted">{confirmState.body}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => close(false)}>
              {confirmState?.cancelLabel ?? t.cancel}
            </Button>
            <Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {confirmState?.confirmLabel}
            </Button>
          </div>
        </Dialog>
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          {toast && (
            <div
              key={toast.id}
              className={cx(
                'animate-rise pointer-events-auto rounded-full px-5 py-3 text-sm font-medium shadow-2xl',
                toast.tone === 'ok' ? 'bg-ink text-bg' : 'bg-danger text-white',
              )}
            >
              {toast.msg}
            </div>
          )}
        </div>
      </ToastCtx.Provider>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);
export const useToast = () => useContext(ToastCtx);
