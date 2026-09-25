import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, Trash2 } from "lucide-react";
import { cardLabel, isRedCard } from "../poker";

export function MoneyInput({
  id,
  label,
  placeholder = "0",
  value,
  onChange,
  onEnter,
  testId,
  size = "md",
  autoFocus,
}: {
  id: string;
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  testId?: string;
  size?: "sm" | "md";
  autoFocus?: boolean;
}) {
  return (
    <div className="money-field min-w-0" data-size={size}>
      {label ? <label className="sr-only" htmlFor={id}>{label}</label> : null}
      <span className="money-prefix" aria-hidden="true">₹</span>
      <input
        id={id}
        className="field money-input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onEnter) {
            event.preventDefault();
            onEnter();
          }
        }}
        data-testid={testId}
      />
    </div>
  );
}

export function StatCard({ label, value, detail, icon, accent = false }: { label: string; value: string; detail?: string; icon: ReactNode; accent?: boolean }) {
  return (
    <div className={`surface p-4 sm:p-5 ${accent ? "!border-[hsl(var(--accent)/.45)]" : ""}`} data-testid={`stat-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="eyebrow">{label}</span>
        <span className={accent ? "text-[hsl(var(--accent))]" : "text-[hsl(var(--muted-foreground))]"}>{icon}</span>
      </div>
      <div className="stat-number">{value}</div>
      {detail ? <div className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">{detail}</div> : null}
    </div>
  );
}

export function PlayerDot({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return <span className={`player-dot ${size === "sm" ? "!h-6 !w-6 !text-[10px]" : ""}`} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
}

export function PlayingCard({ code, size = "md" }: { code: string; size?: "sm" | "md" }) {
  return (
    <span className={`playing-card ${isRedCard(code) ? "is-red" : ""}`} data-size={size} aria-label={cardLabel(code)}>
      {cardLabel(code)}
    </span>
  );
}

export function Modal({ children, onClose, labelledBy, wide = false }: { children: ReactNode; onClose: () => void; labelledBy: string; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} className={`modal-card outline-none ${wide ? "!w-[min(760px,100%)]" : ""}`}>{children}</div>
    </div>,
    document.body,
  );
}

export function ConfirmModal({ title, body, confirmLabel, danger, onCancel, onConfirm, children }: { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onCancel: () => void; onConfirm: () => void; children?: ReactNode }) {
  return (
    <Modal onClose={onCancel} labelledBy="confirm-title">
      <div className="p-6 sm:p-7">
        <div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl ${danger ? "bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]" : "bg-[hsl(var(--accent)/.12)] text-[hsl(var(--accent))]"}`}>
          {danger ? <Trash2 size={19} /> : <Check size={19} />}
        </div>
        <h2 id="confirm-title" className="display-font text-2xl tracking-[-.03em]">{title}</h2>
        <div className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{body}</div>
        {children}
        <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn btn-soft" onClick={onCancel} data-testid="button-cancel-confirm">Go back</button>
          <button className={`btn ${danger ? "btn-danger-solid" : "btn-accent"}`} onClick={onConfirm} data-testid="button-confirm-action">{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">{icon}</div>
      <h3 className="font-bold">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-[hsl(var(--muted-foreground))]">{body}</p>
    </div>
  );
}

export function formatDate(value: string | null, withYear = true) {
  if (!value) return "Not finished";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function formatDuration(fromIso: string, toIso: string | null) {
  const ms = (toIso ? +new Date(toIso) : Date.now()) - +new Date(fromIso);
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
