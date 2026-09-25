import { useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronUp, Clock3, Coins, Hand, IndianRupee, Pencil, Plus, Trash2, UserMinus, UserPlus, Users, X } from "lucide-react";
import {
  hostTotal,
  inr,
  playerNet,
  sessionDetails,
  signedInr,
  totalBuyIns,
  trackedResults,
  uid,
  type TrackedResult,
  type HandRecord,
  type Player,
  type Session,
} from "../poker";
import { EmptyState, Modal, MoneyInput, PlayerDot, StatCard, formatDate, formatDuration, formatTime } from "../components/bits";
import { PokerHandEditor } from "../components/PokerHandEditor";
import { HandRow } from "../components/HandRow";
import { ReconcileBar, SettleUp } from "../components/Settlement";

type Updater = (id: string, updater: (session: Session) => Session) => void;

export function LiveTable({ session, onUpdate, onFinish, onToast }: { session: Session; onUpdate: Updater; onFinish: () => void; onToast: (message: string, undo?: () => void) => void }) {
  const [editing, setEditing] = useState<HandRecord | null>(null);
  const [showLedger, setShowLedger] = useState(true);
  const update = (fn: (s: Session) => Session) => onUpdate(session.id, fn);

  const renumber = (hands: HandRecord[]) => hands.map((h, i) => ({ ...h, number: i + 1 }));

  const addHand = (hand: HandRecord) => {
    update((s) => ({ ...s, hands: renumber([...s.hands, hand]) }));
    onToast(`Hand #${hand.number} logged${hand.fee ? ` · +${inr(hand.fee)} house` : ""}.`);
  };

  const saveEdit = (hand: HandRecord) => {
    update((s) => ({ ...s, hands: s.hands.map((h) => (h.id === hand.id ? hand : h)) }));
    setEditing(null);
    onToast(`Hand #${hand.number} updated.`);
  };

  const removeHand = (hand: HandRecord) => {
    const index = session.hands.findIndex((h) => h.id === hand.id);
    update((s) => ({ ...s, hands: renumber(s.hands.filter((h) => h.id !== hand.id)) }));
    onToast(`Hand #${hand.number} removed.`, () =>
      update((s) => {
        const hands = [...s.hands];
        hands.splice(Math.min(index, hands.length), 0, hand);
        return { ...s, hands: renumber(hands) };
      }),
    );
  };

  const updatePlayer = (playerId: string, fn: (p: Player) => Player) =>
    update((s) => ({ ...s, players: s.players.map((p) => (p.id === playerId ? fn(p) : p)) }));

  const addPlayer = (name: string) => {
    update((s) => ({ ...s, players: [...s.players, { id: uid("player"), name, buyIns: [], cashOut: null, sittingOut: false }] }));
    onToast(`${name} joined the table.`);
  };

  const removePlayer = (player: Player) => {
    update((s) => ({ ...s, players: s.players.filter((p) => p.id !== player.id) }));
    onToast(`${player.name} removed.`, () => update((s) => ({ ...s, players: [...s.players, player] })));
  };

  const isReferenced = (playerId: string) =>
    session.hands.some((h) => h.dealerPlayerId === playerId || h.actions.some((a) => a.playerId === playerId) || h.pots.some((p) => p.awards.some((a) => a.playerId === playerId)));

  const tracked = trackedResults(session);
  const anyTracked = session.hands.some((h) => Object.keys(h.contributions).length);
  const missingCashOut = session.players.filter((p) => p.cashOut === null && totalBuyIns(p) > 0);
  const cashOutAtStacks = () => {
    const before = session.players;
    update((s) => ({ ...s, players: s.players.map((p) => (p.cashOut === null && totalBuyIns(p) > 0 ? { ...p, cashOut: Math.max(0, tracked.byPlayer[p.id]?.stack ?? 0) } : p)) }));
    onToast("Cash-outs filled from tracked stacks.", () => update((s) => ({ ...s, players: before })));
  };

  const inPlay = session.players.reduce((s, p) => s + totalBuyIns(p), 0);
  const perHour = (() => {
    const hours = (Date.now() - +new Date(session.startedAt)) / 3.6e6;
    return hours > 0.25 && session.hands.length ? Math.round(session.hands.length / hours) : null;
  })();

  return (
    <div className="animate-rise">
      <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="eyebrow mb-3 flex items-center gap-2 text-[hsl(var(--accent))]"><span className="h-2 w-2 animate-[soft-pulse_2s_ease_infinite] rounded-full bg-[hsl(var(--accent))]" /> Live session</div>
          <h1 className="display-font text-[clamp(2.4rem,7vw,3.8rem)] leading-none tracking-[-.05em]">The table is warm.</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[hsl(var(--muted-foreground))]">
            <CalendarDays size={15} /> {formatDate(session.startedAt)} <span className="opacity-40">/</span> <Clock3 size={15} /> {formatTime(session.startedAt)} · {formatDuration(session.startedAt, null)}
            <span className="opacity-40">/</span> {sessionDetails(session)}
          </p>
        </div>
        <button className="btn btn-accent mobile-full" onClick={onFinish} data-testid="button-finish-session"><Check size={15} /> Finish session</button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Hands" value={String(session.hands.length)} detail={perHour ? `${perHour} per hour` : "logged so far"} icon={<Hand size={17} />} accent />
        <StatCard label="House fees" value={inr(hostTotal(session))} detail={session.feePerHand ? `${inr(session.feePerHand)} per hand` : "No fee this session"} icon={<IndianRupee size={17} />} />
        <StatCard label="Bought in" value={inr(inPlay)} detail="Total cash in play" icon={<Coins size={17} />} />
        <StatCard label="Players" value={String(session.players.filter((p) => !p.sittingOut).length)} detail={`${session.players.length} on the ledger`} icon={<Users size={17} />} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] p-5 sm:p-6">
            <div><div className="eyebrow">Log the next hand</div><h2 className="mt-1 text-lg font-bold">Hand #{session.hands.length + 1}</h2></div>
          </div>
          <div className="p-5 sm:p-6">
            {session.players.some((p) => !p.sittingOut) ? (
              <PokerHandEditor session={session} handNumber={session.hands.length + 1} onSave={addHand} />
            ) : (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Everyone is sitting out. Bring someone back in from the ledger.</p>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="surface overflow-hidden">
            <button className="flex w-full items-center justify-between p-5 text-left sm:p-6" onClick={() => setShowLedger((c) => !c)} data-testid="button-toggle-players">
              <span><span className="eyebrow block">Buy-ins & cash-outs</span><span className="mt-1 block text-lg font-bold">Player ledger</span></span>
              {showLedger ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            {showLedger ? (
              <div className="border-t border-[hsl(var(--border))] p-4 sm:p-5">
                {anyTracked || tracked.untracked ? (
                  <div className="mb-4 rounded-xl bg-[hsl(var(--secondary)/.55)] p-3 text-xs">
                    <p className="text-[hsl(var(--muted-foreground))]">
                      <b className="text-[hsl(var(--foreground))]">Live +/−</b> updates from each hand's "who put money in". Final results still come from cash-outs.
                      {tracked.untracked ? <span className="text-[hsl(var(--destructive))]"> {tracked.untracked} hand{tracked.untracked === 1 ? " has" : "s have"} a winner but no one marked as paying — edit {tracked.untracked === 1 ? "it" : "them"} to count.</span> : null}
                    </p>
                    {anyTracked && missingCashOut.length ? (
                      <button className="btn btn-soft mt-2 w-full !py-1.5 !text-xs" onClick={cashOutAtStacks} data-testid="button-cashout-tracked">Cash out {missingCashOut.length === session.players.length ? "everyone" : `${missingCashOut.length} left`} at tracked stacks</button>
                    ) : null}
                  </div>
                ) : null}
                {session.players.map((player) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    defaultBuyIn={session.defaultBuyIn}
                    tracked={anyTracked ? tracked.byPlayer[player.id] : undefined}
                    onUpdate={updatePlayer}
                    onRemove={!isReferenced(player.id) && totalBuyIns(player) === 0 ? () => removePlayer(player) : undefined}
                  />
                ))}
                <AddPlayer existing={session.players.map((p) => p.name)} onAdd={addPlayer} />
              </div>
            ) : null}
          </section>
          <section className="surface space-y-4 p-5 sm:p-6">
            <div><div className="eyebrow">Money check</div><h2 className="mt-1 text-lg font-bold">Settlement</h2></div>
            <ReconcileBar session={session} />
            <SettleUp session={session} />
          </section>
        </div>
      </div>

      <section className="surface mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] p-5 sm:p-6">
          <div><div className="eyebrow">Most recent first</div><h2 className="mt-1 text-lg font-bold">Hand log</h2></div>
          <span className="rounded-full bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--muted-foreground))]">{session.hands.length} {session.hands.length === 1 ? "hand" : "hands"}</span>
        </div>
        {session.hands.length ? (
          <div>{[...session.hands].reverse().map((hand) => <HandRow key={hand.id} hand={hand} players={session.players} onEdit={() => setEditing(hand)} onDelete={() => removeHand(hand)} />)}</div>
        ) : (
          <EmptyState icon={<Hand size={19} />} title="No hands logged yet" body="Tap the winner, type the pot, log it. Everything else is optional." />
        )}
      </section>

      {editing ? (
        <Modal onClose={() => setEditing(null)} labelledBy="edit-hand-title" wide>
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] p-5 sm:p-6">
            <h2 id="edit-hand-title" className="text-lg font-bold">Edit hand #{editing.number}</h2>
            <button className="btn btn-ghost !p-2" onClick={() => setEditing(null)} aria-label="Close"><X size={16} /></button>
          </div>
          <div className="p-5 sm:p-6">
            <PokerHandEditor session={session} handNumber={editing.number} initial={editing} onSave={saveEdit} onCancel={() => setEditing(null)} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function AddPlayer({ existing, onAdd }: { existing: string[]; onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean) return;
    if (existing.some((n) => n.toLowerCase() === clean.toLowerCase())) { setError("Already on the ledger."); return; }
    onAdd(clean);
    setName("");
    setOpen(false);
  };
  if (!open) {
    return <button className="btn btn-ghost mt-3 w-full !justify-start !px-2 !text-xs" onClick={() => setOpen(true)} data-testid="button-late-player"><UserPlus size={14} /> Someone joined late</button>;
  }
  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input className="field !py-2 !text-sm" autoFocus placeholder="Name" value={name} maxLength={24} onChange={(e) => { setName(e.target.value); setError(""); }} onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }} data-testid="input-late-player" />
        <button className="btn btn-primary !px-3 !py-2 !text-xs" onClick={submit} data-testid="button-add-late-player">Add</button>
        <button className="btn btn-ghost !p-2" onClick={() => setOpen(false)} aria-label="Cancel"><X size={14} /></button>
      </div>
      {error ? <p className="mt-1 text-xs text-[hsl(var(--destructive))]">{error}</p> : null}
    </div>
  );
}

function PlayerCard({ player, defaultBuyIn, tracked, onUpdate, onRemove }: { player: Player; defaultBuyIn: number | null; tracked?: TrackedResult; onUpdate: (playerId: string, fn: (p: Player) => Player) => void; onRemove?: () => void }) {
  const [buyIn, setBuyIn] = useState("");
  const [expanded, setExpanded] = useState(false);
  const net = playerNet(player);
  const inTotal = totalBuyIns(player);

  const addBuyIn = (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    onUpdate(player.id, (p) => ({ ...p, buyIns: [...p.buyIns, amount] }));
    setBuyIn("");
  };
  const commitCashOut = (value: string) => {
    onUpdate(player.id, (p) => ({ ...p, cashOut: value === "" ? null : Number(value) }));
  };

  return (
    <div className={`border-b border-[hsl(var(--border))] py-3.5 first:pt-0 last:border-0 ${player.sittingOut ? "opacity-60" : ""}`} data-testid={`card-player-${player.id}`}>
      <div className="flex items-center justify-between gap-2">
        <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => setExpanded((c) => !c)} aria-expanded={expanded} data-testid={`button-edit-player-${player.id}`}>
          <PlayerDot name={player.name} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate text-sm font-bold">{player.name}{player.sittingOut ? <span className="text-[10px] font-normal uppercase tracking-wide text-[hsl(var(--muted-foreground))]">sitting out</span> : null}</div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {inTotal ? `In ${inr(inTotal)}${player.buyIns.length > 1 ? ` (${player.buyIns.length}×)` : ""}` : "No buy-in yet"}
              {player.cashOut !== null ? ` · out ${inr(player.cashOut)}` : tracked ? ` · stack ${inr(tracked.stack)}` : ""}
            </div>
          </div>
        </button>
        {defaultBuyIn && !expanded ? (
          <button className="btn btn-soft !px-2.5 !py-1.5 !text-xs" onClick={() => addBuyIn(defaultBuyIn)} aria-label={`Add ${inr(defaultBuyIn)} buy-in for ${player.name}`} data-testid={`button-quick-buyin-${player.id}`}>
            <Plus size={12} /> {inr(defaultBuyIn)}
          </button>
        ) : null}
        {(() => {
          const shown = net ?? tracked?.net ?? null;
          const live = net === null && tracked !== undefined;
          return (
            <div className={`mono-font w-20 shrink-0 text-right text-sm ${shown === null ? "text-[hsl(var(--muted-foreground))]" : shown < 0 ? "text-[hsl(var(--destructive))]" : shown > 0 ? "text-[hsl(var(--success))]" : ""}`} data-testid={`text-net-${player.id}`}>
              {shown === null ? "—" : signedInr(shown)}
              {live ? <span className="block text-[9px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">live</span> : null}
            </div>
          );
        })()}
      </div>
      {expanded ? (
        <div className="mt-3 rounded-xl bg-[hsl(var(--secondary)/.55)] p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {player.buyIns.length ? player.buyIns.map((amount, index) => (
              <span className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--card))] px-2 py-1 text-xs" key={`${amount}-${index}`} data-testid={`chip-buyin-${player.id}-${index}`}>
                {inr(amount)}
                <button className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]" onClick={() => onUpdate(player.id, (p) => ({ ...p, buyIns: p.buyIns.filter((_, i) => i !== index) }))} aria-label={`Remove buy-in ${index + 1}`}><X size={11} /></button>
              </span>
            )) : <span className="text-xs text-[hsl(var(--muted-foreground))]">No buy-ins yet</span>}
          </div>
          <div className="flex gap-2">
            <div className="flex-1"><MoneyInput id={`buyin-${player.id}`} label="Buy-in amount" placeholder={defaultBuyIn ? String(defaultBuyIn) : "Buy-in"} value={buyIn} onChange={setBuyIn} onEnter={() => addBuyIn(Number(buyIn || defaultBuyIn || 0))} size="sm" testId={`input-buyin-${player.id}`} /></div>
            <button className="btn btn-soft !px-3 !py-2 !text-xs" onClick={() => addBuyIn(Number(buyIn || defaultBuyIn || 0))} data-testid={`button-add-buyin-${player.id}`}><Plus size={13} /> Buy-in</button>
          </div>
          {tracked && player.cashOut === null ? (
            <button className="mt-2 w-full rounded-lg border border-dashed border-[hsl(var(--border))] py-1.5 text-xs font-bold text-[hsl(var(--accent))]" onClick={() => onUpdate(player.id, (p) => ({ ...p, cashOut: Math.max(0, tracked.stack) }))} data-testid={`button-cashout-stack-${player.id}`}>
              Cash out at tracked stack {inr(Math.max(0, tracked.stack))}
            </button>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <label className="eyebrow w-[74px] shrink-0" htmlFor={`cashout-${player.id}`}>Cash-out</label>
            <div className="flex-1"><MoneyInput id={`cashout-${player.id}`} placeholder="Chips at the end" value={player.cashOut === null ? "" : String(player.cashOut)} onChange={commitCashOut} size="sm" testId={`input-cashout-${player.id}`} /></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-ghost !px-2 !py-1.5 !text-xs" onClick={() => onUpdate(player.id, (p) => ({ ...p, sittingOut: !p.sittingOut }))} data-testid={`button-sitout-${player.id}`}>
              {player.sittingOut ? <><UserPlus size={13} /> Deal back in</> : <><UserMinus size={13} /> Sit out</>}
            </button>
            {onRemove ? <button className="btn btn-ghost !px-2 !py-1.5 !text-xs" onClick={onRemove}><Trash2 size={13} /> Remove</button> : null}
            <button className="btn btn-ghost ml-auto !px-2 !py-1.5 !text-xs" onClick={() => setExpanded(false)}><Pencil size={12} /> Done</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
