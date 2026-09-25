import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, Copy, MessageCircle, Scale } from "lucide-react";
import { inr, nameOf, reconcile, sessionShareText, settlementTransfers, type Session } from "../poker";

export function ReconcileBar({ session }: { session: Session }) {
  const rec = reconcile(session);
  const everyoneCashedOut = rec.unsettled.length === 0 && session.players.some((p) => p.cashOut !== null);
  const ok = rec.difference === 0;
  return (
    <div className={`rounded-xl p-3 text-xs ${everyoneCashedOut ? (ok ? "bg-[hsl(var(--success)/.1)]" : "bg-[hsl(var(--destructive)/.08)]") : "bg-[hsl(var(--secondary)/.6)]"}`} data-testid="status-reconcile">
      <div className="mb-2 flex items-center gap-1.5 font-bold">
        <Scale size={14} />
        {!everyoneCashedOut
          ? `Chip check · ${rec.unsettled.length} still to cash out`
          : ok
            ? "Chips add up"
            : `Chips don't add up — ${inr(Math.abs(rec.difference))} ${rec.difference > 0 ? "missing" : "extra"}`}
      </div>
      <div className="mono-font grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[hsl(var(--muted-foreground))]">
        <span>Bought in</span><span className="text-right">{inr(rec.buyIns)}</span>
        <span>Cashed out</span><span className="text-right">− {inr(rec.cashOuts)}</span>
        <span>House fees</span><span className="text-right">− {inr(rec.fees)}</span>
        <span className="font-bold text-[hsl(var(--foreground))]">{everyoneCashedOut ? "Difference" : "Still on the table"}</span>
        <span className="text-right font-bold text-[hsl(var(--foreground))]">{inr(rec.difference)}</span>
      </div>
      {everyoneCashedOut && !ok ? (
        <p className="mt-2 flex items-start gap-1.5 text-[hsl(var(--destructive))]"><AlertTriangle size={13} className="mt-px shrink-0" /> Recount stacks or check for a missed buy-in before anyone pays.</p>
      ) : null}
    </div>
  );
}

export function SettleUp({ session }: { session: Session }) {
  const transfers = settlementTransfers(session);
  const [copied, setCopied] = useState(false);
  const text = sessionShareText(session);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this summary:", text);
    }
  };

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* cancelled */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <div data-testid="panel-settle-up">
      <div className="eyebrow mb-2">Settle up · fewest payments</div>
      {transfers.length ? (
        <ul className="space-y-1.5">
          {transfers.map((t, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg bg-[hsl(var(--secondary)/.55)] px-3 py-2 text-sm" data-testid={`row-transfer-${i}`}>
              <span className="min-w-0 truncate font-bold">{nameOf(session, t.from)}</span>
              <ArrowRight size={14} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
              <span className="min-w-0 flex-1 truncate">{nameOf(session, t.to)}</span>
              <span className="mono-font shrink-0">{inr(t.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Nothing to pay yet — enter cash-outs to see who owes whom.</p>
      )}
      <div className="mt-3 flex gap-2">
        <button className="btn btn-soft flex-1 !py-2 !text-xs" onClick={copy} data-testid="button-copy-summary">{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy summary"}</button>
        <button className="btn btn-accent flex-1 !py-2 !text-xs" onClick={share} data-testid="button-share-summary"><MessageCircle size={13} /> Share</button>
      </div>
    </div>
  );
}
