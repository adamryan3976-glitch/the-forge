import { Loader2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-stone-500" role="status">
      <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">{label}</span>
    </div>
  );
}

export function Card({ children, className = '' }) {
  return <div className={'bg-white border border-stone-200 rounded-xl p-4 sm:p-5 ' + className}>{children}</div>;
}

const variants = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 border-brand-600',
  secondary: 'bg-white text-stone-700 hover:bg-stone-100 border-stone-300',
  danger: 'bg-white text-rose-700 hover:bg-rose-50 border-rose-300',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50 border-transparent',
};

export function Button({ variant = 'secondary', className = '', children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={'inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium min-h-10 ' +
        'disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-brand-300 ' +
        variants[variant] + ' ' + className}
    >
      {children}
    </button>
  );
}

export function ErrorBox({ children }) {
  if (!children) return null;
  return <div role="alert" className="rounded-lg bg-rose-50 text-rose-800 px-3 py-2 text-sm whitespace-pre-line">{children}</div>;
}

export function OkBox({ children }) {
  if (!children) return null;
  return <div role="status" className="rounded-lg bg-emerald-50 text-emerald-800 px-3 py-2 text-sm whitespace-pre-line">{children}</div>;
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={'flex flex-col gap-1 text-xs font-medium text-stone-600 ' + className}>
      {label}
      {children}
    </label>
  );
}

export const inputCls = 'rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 min-h-10 focus:outline-none focus:ring-2 focus:ring-brand-300';

export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const onCancel = (e) => { e.preventDefault(); onClose(); };
    d?.addEventListener('cancel', onCancel);
    return () => d?.removeEventListener('cancel', onCancel);
  }, [onClose]);
  return (
    <dialog ref={ref} className={'rounded-2xl p-0 backdrop:bg-stone-900/40 w-[calc(100%-2rem)] m-auto ' + (wide ? 'max-w-3xl' : 'max-w-lg')}>
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h2 className="text-lg font-semibold text-stone-800">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-stone-100"><X className="w-5 h-5" /></button>
      </div>
      <div className="px-5 pb-5 max-h-[75vh] overflow-y-auto">{children}</div>
    </dialog>
  );
}

const pillCls = {
  strength: 'bg-emerald-50 text-emerald-700',
  developing: 'bg-amber-50 text-amber-800',
  gap: 'bg-rose-50 text-rose-700',
  neutral: 'bg-stone-100 text-stone-600',
  brand: 'bg-brand-50 text-brand-700',
};
export function Pill({ kind = 'neutral', children }) {
  return <span className={'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ' + (pillCls[kind] || pillCls.neutral)}>{children}</span>;
}

export const fmtPct = (p) => (p === null || p === undefined ? '—' : `${p}%`);
export const flagLabel = (f) => ({ strength: 'Strength', developing: 'Developing', gap: 'Gap' }[f] || '');
