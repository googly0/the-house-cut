import { useState } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { handPotTotal, inr, type HandRecord, type Player } from "../poker";
import { PlayingCard, formatTime } from "./bits";
import { describeAction } from "./PokerHandEditor";

export function HandRow({ hand, players, onDelete, onEdit }: { hand: HandRecord; players: Player[]; onDelete?: () => void; onEdit?: () => void }) {
  const [open, setOpen] = useState(false);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? "Player";
  const winners = [...new Set(hand.pots.flatMap((p) => p.awards.map((a) => a.playerId)))];
  const pot = handPotTotal(hand);
  const paidIds = Object.keys(hand.contributions);
  const hasDetail = hand.actions.length > 0 || hand.pots.length > 1 || hand.dealerPlayerId || paidIds.length > 0;
  const soleWinner = winners.length === 1 ? winners[0] : null;
  const soleNet = soleWinner && paidIds.length
    ? hand.pots.flatMap((p) => p.awards).filter((a) => a.playerId === soleWinner).reduce((s, a) => s + (a.amount ?? 0), 0) - (hand.contributions[soleWinner] ?? 0)
    : null;

  return (
    <div className="group border-b border-[hsl(var(--border))] last:border-0" data-testid={`row-hand-${hand.id}`}>
      <div className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
        <span className="mono-font grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--primary))] text-xs text-[hsl(var(--primary-foreground))]">{hand.number}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-bold">{winners.length ? winners.map(name).join(" & ") : "Winner not recorded"}</span>
            {winners.length > 1 ? <span className="rounded bg-[hsl(var(--accent)/.14)] px-1.5 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--accent))]">split</span> : null}
            {soleNet !== null ? <span className="mono-font text-[hsl(var(--success))]">+{inr(soleNet)}</span> : null}
            {pot !== null ? <span className="text-[hsl(var(--muted-foreground))]">· {inr(pot)} pot</span> : null}
            {hand.fee === 0 ? <span className="text-[11px] text-[hsl(var(--muted-foreground))]">· no fee</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {hand.board.map((c) => <PlayingCard key={c} code={c} size="sm" />)}
            <span className="truncate text-xs text-[hsl(var(--muted-foreground))]">{hand.board.length ? " " : ""}{hand.note || formatTime(hand.loggedAt)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          {hasDetail ? <button className="btn btn-ghost !p-2" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Hand details"><ChevronDown size={15} className={open ? "rotate-180" : ""} /></button> : null}
          {onEdit ? <button className="btn btn-ghost !p-2" onClick={onEdit} aria-label={`Edit hand ${hand.number}`} data-testid={`button-edit-hand-${hand.id}`}><Pencil size={14} /></button> : null}
          {onDelete ? <button className="btn btn-ghost !p-2" onClick={onDelete} aria-label={`Delete hand ${hand.number}`} data-testid={`button-delete-hand-${hand.id}`}><Trash2 size={14} /></button> : null}
        </div>
      </div>
      {open ? (
        <div className="space-y-2 px-5 pb-4 pl-[68px] text-xs text-[hsl(var(--muted-foreground))] sm:px-6 sm:pl-[68px]">
          {hand.dealerPlayerId ? <div>Button: <b className="text-[hsl(var(--foreground))]">{name(hand.dealerPlayerId)}</b></div> : null}
          {paidIds.length ? <div>Paid in: {paidIds.map((id) => `${name(id)} ${inr(hand.contributions[id])}`).join(", ")}</div> : null}
          {hand.pots.map((p) => (
            <div key={p.id}>
              <b className="text-[hsl(var(--foreground))]">{p.label}</b> {p.amount !== null ? inr(p.amount) : ""} →{" "}
              {p.awards.length ? p.awards.map((a) => `${name(a.playerId)}${a.amount !== null ? ` ${inr(a.amount)}` : ""}`).join(", ") : "no winner"}
            </div>
          ))}
          {hand.actions.length ? (
            <div className="space-y-0.5 leading-5">
              {[...new Set(hand.actions.map((a) => a.street))].map((street) => (
                <div key={street}>
                  <b className="mono-font text-[10px] uppercase">{street}: </b>
                  {hand.actions.filter((a) => a.street === street).map((a) => `${name(a.playerId)} ${describeAction(a)}`).join(", ")}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
