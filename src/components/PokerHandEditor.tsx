import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, ChevronDown, Plus, Trash2, X } from "lucide-react";
import {
  STREETS,
  blindSeats,
  buildPots,
  inr,
  nextDealerId,
  replayHand,
  splitEvenly,
  uid,
  type BettingAction,
  type HandAction,
  type HandContext,
  type HandRecord,
  type PotResult,
  type Session,
  type Street,
} from "../poker";
import { CardPicker } from "./CardPicker";
import { MoneyInput } from "./bits";

type DraftPot = {
  id: string;
  label: string;
  amount: string;
  eligibleIds: string[];
  winnerIds: string[];
  splitMode: "even" | "custom";
  customAmounts: Record<string, string>;
};

function createPot(label: string): DraftPot {
  return { id: uid("pot"), label, amount: "", eligibleIds: [], winnerIds: [], splitMode: "even", customAmounts: {} };
}

function draftFromResult(pot: PotResult): DraftPot {
  const amounts = pot.awards.map((a) => a.amount ?? 0);
  const allEqual = amounts.every((a) => Math.abs(a - amounts[0]) <= 1);
  return {
    id: pot.id,
    label: pot.label,
    amount: pot.amount === null ? "" : String(pot.amount),
    eligibleIds: pot.eligibleIds,
    winnerIds: pot.awards.map((a) => a.playerId),
    splitMode: allEqual ? "even" : "custom",
    customAmounts: Object.fromEntries(pot.awards.map((a) => [a.playerId, a.amount === null ? "" : String(a.amount)])),
  };
}

/** The amount actually paid to winners: main pot has the house fee taken out. */
function payable(pot: DraftPot, fee: number): number | null {
  if (pot.amount.trim() === "") return null;
  return Math.max(0, Number(pot.amount) - fee);
}

function shares(pot: DraftPot, fee: number, seatOrder: string[]): Record<string, number> {
  const net = payable(pot, fee);
  if (net === null) return {};
  if (pot.splitMode === "custom") {
    return Object.fromEntries(pot.winnerIds.map((id) => [id, Number(pot.customAmounts[id]) || 0]));
  }
  return splitEvenly(net, pot.winnerIds, seatOrder);
}

function customMismatch(pot: DraftPot, fee: number): number | null {
  if (pot.splitMode !== "custom" || !pot.winnerIds.length) return null;
  const net = payable(pot, fee);
  if (net === null) return null;
  const total = pot.winnerIds.reduce((s, id) => s + (Number(pot.customAmounts[id]) || 0), 0);
  return total === net ? null : total - net;
}

export function PokerHandEditor({
  session,
  handNumber,
  initial,
  onSave,
  onCancel,
}: {
  session: Session;
  handNumber: number;
  initial?: HandRecord;
  onSave: (hand: HandRecord) => void;
  onCancel?: () => void;
}) {
  const players = session.players;
  const seatOrder = players.map((p) => p.id);
  const dealtIn = useMemo(() => {
    const ids = players.filter((p) => !p.sittingOut).map((p) => p.id);
    // When editing an old hand, anyone who appears in it counts as dealt in.
    const involved = new Set([...(initial?.actions.map((a) => a.playerId) ?? []), ...(initial?.pots.flatMap((p) => p.awards.map((a) => a.playerId)) ?? [])]);
    return seatOrder.filter((id) => ids.includes(id) || involved.has(id));
  }, [players, initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "Player";

  const [dealerId, setDealerId] = useState(initial ? initial.dealerPlayerId ?? "" : nextDealerId(session) ?? "");
  const [board, setBoard] = useState<string[]>(initial?.board ?? []);
  const [actions, setActions] = useState<HandAction[]>(initial?.actions ?? []);
  const [pots, setPots] = useState<DraftPot[]>(() => (initial?.pots.length ? initial.pots.map(draftFromResult) : [createPot("Main pot")]));
  const [chargeFee, setChargeFee] = useState(initial ? initial.fee > 0 : session.feePerHand > 0);
  const [note, setNote] = useState(initial?.note ?? "");
  const [openBoard, setOpenBoard] = useState(Boolean(initial?.board.length));
  const [openActions, setOpenActions] = useState(Boolean(initial?.actions.length));
  const [error, setError] = useState("");
  const [paid, setPaid] = useState<Record<string, string>>(() =>
    initial && !initial.actions.length ? Object.fromEntries(Object.entries(initial.contributions).map(([k, v]) => [k, String(v)])) : {},
  );
  const [potTouched, setPotTouched] = useState(Boolean(initial));
  const [sameFor, setSameFor] = useState("");

  const fee = chargeFee ? (initial && initial.fee > 0 ? initial.fee : session.feePerHand) : 0;
  const showBoard = session.gameVariant !== "Seven-card stud";

  const ctx: HandContext = {
    playerIds: dealtIn,
    dealerId: dealerId || null,
    smallBlind: session.smallBlind,
    bigBlind: session.bigBlind,
    ante: session.ante,
  };
  const replay = replayHand(actions, ctx);
  const issueById = new Map(replay.issues.map((i) => [i.actionId, i.message]));
  const computed = actions.length ? buildPots(replay.contributions, replay.folded) : null;
  const { sb, bb } = blindSeats(ctx);

  // Money in: from betting actions when logged (minus any uncalled bet), else typed.
  const actionPaid: Record<string, number> | null = computed
    ? (() => {
        const c = { ...replay.contributions };
        if (computed.returned) c[computed.returned.playerId] -= computed.returned.amount;
        return c;
      })()
    : null;
  const paidMap: Record<string, number> = actionPaid ?? Object.fromEntries(dealtIn.map((id) => [id, Number(paid[id]) || 0]));
  const paidTotal = Object.values(paidMap).reduce((a, b) => a + b, 0);

  const applyPaid = (next: Record<string, string>) => {
    setPaid(next);
    setError("");
    if (!potTouched && pots.length === 1) {
      const total = dealtIn.reduce((sum, id) => sum + (Number(next[id]) || 0), 0);
      setPots((current) => current.map((pot, i) => (i === 0 ? { ...pot, amount: total ? String(total) : "" } : pot)));
    }
  };

  const updatePot = (id: string, updater: (pot: DraftPot) => DraftPot) => {
    setPots((current) => current.map((pot) => (pot.id === id ? updater(pot) : pot)));
    setError("");
  };

  const toggleWinner = (pot: DraftPot, playerId: string) => {
    updatePot(pot.id, (current) => {
      const winnerIds = current.winnerIds.includes(playerId)
        ? current.winnerIds.filter((id) => id !== playerId)
        : [...current.winnerIds, playerId];
      const next = { ...current, winnerIds };
      if (current.splitMode === "custom") {
        const even = splitEvenly(payable(next, pots[0].id === current.id ? fee : 0) ?? 0, winnerIds, seatOrder);
        next.customAmounts = Object.fromEntries(winnerIds.map((id) => [id, String(even[id] ?? 0)]));
      }
      return next;
    });
  };

  const applyComputedPots = () => {
    if (!computed) return;
    setPotTouched(true);
    setPots((current) =>
      computed.pots.map((cp, i) => {
        const previous = current[i];
        const winners = (previous?.winnerIds ?? []).filter((id) => cp.eligibleIds.includes(id));
        return {
          ...(previous ?? createPot("")),
          id: previous?.id ?? uid("pot"),
          label: i === 0 ? "Main pot" : `Side pot ${i}`,
          amount: String(cp.amount),
          eligibleIds: cp.eligibleIds,
          // Only one player left in this pot → they win it.
          winnerIds: cp.eligibleIds.length === 1 ? cp.eligibleIds : winners,
          splitMode: "even",
          customAmounts: {},
        };
      }),
    );
    setError("");
  };

  const save = () => {
    let draftPots = pots;
    const typedTotal = pots.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const anyTyped = pots.some((p) => p.amount.trim() !== "");
    if (paidTotal > 0 && !anyTyped) {
      if (pots.length > 1) { setError("Enter each pot's amount — with side pots I can't guess the split."); return; }
      draftPots = pots.map((p, i) => (i === 0 ? { ...p, amount: String(paidTotal) } : p));
    } else if (paidTotal > 0 && typedTotal !== paidTotal) {
      setError(`Players put in ${inr(paidTotal)} but the pot${pots.length > 1 ? "s add" : " says"} ${inr(typedTotal)}. Fix one of them.`);
      return;
    }
    const winnersPicked = draftPots.some((p) => p.winnerIds.length);
    if (paidTotal > 0 && !winnersPicked) { setError("Money went in, so pick who won it."); return; }
    const pots_ = draftPots;
    const mismatch = pots_.findIndex((pot, i) => customMismatch(pot, i === 0 ? fee : 0) !== null);
    if (mismatch >= 0) {
      setError(`${pots_[mismatch].label}: custom shares must add up to the amount being paid out.`);
      return;
    }
    if (pots_[0] && payable(pots_[0], 0) !== null && Number(pots_[0].amount) < fee) {
      setError(`Main pot is smaller than the ${inr(fee)} fee. Turn the fee off for this hand or fix the amount.`);
      return;
    }
    const results: PotResult[] = pots_
      .filter((pot, i) => i === 0 || pot.amount.trim() !== "" || pot.winnerIds.length)
      .map((pot, i) => {
        const s = shares(pot, i === 0 ? fee : 0, seatOrder);
        const amount = pot.amount.trim() === "" ? null : Number(pot.amount);
        return {
          id: pot.id,
          label: pot.label.trim() || (i === 0 ? "Main pot" : `Side pot ${i}`),
          amount,
          eligibleIds: pot.eligibleIds,
          awards: pot.winnerIds.map((playerId) => ({ playerId, amount: amount === null ? null : s[playerId] ?? 0 })),
        };
      });
    onSave({
      id: initial?.id ?? uid("hand"),
      number: handNumber,
      loggedAt: initial?.loggedAt ?? new Date().toISOString(),
      fee,
      note: note.trim() || null,
      dealerPlayerId: dealerId || null,
      board: showBoard ? board : [],
      actions,
      pots: results,
      contributions: Object.fromEntries(Object.entries(paidMap).filter(([id, v]) => v > 0 && dealtIn.includes(id))),
    });
    if (!initial) {
      setBoard([]);
      setActions([]);
      setPots([createPot("Main pot")]);
      setPaid({});
      setPotTouched(false);
      setSameFor("");
      setNote("");
      setChargeFee(session.feePerHand > 0);
      setDealerId(nextDealerIdAfter(dealerId));
      setOpenBoard(false);
      setOpenActions(false);
    }
    setError("");
  };

  function nextDealerIdAfter(current: string) {
    if (!current) return "";
    const start = seatOrder.indexOf(current);
    for (let step = 1; step <= seatOrder.length; step++) {
      const id = seatOrder[(start + step) % seatOrder.length];
      if (dealtIn.includes(id)) return id;
    }
    return current;
  }

  const hasAnyAmount = pots.some((p) => p.amount.trim() !== "");
  const grossTotal = pots.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return (
    <div className="space-y-5" data-testid="panel-hand-composer">
      {/* Top row: button + fee */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[150px] flex-1">
          <label className="eyebrow mb-1.5 block" htmlFor={`hand-dealer-${handNumber}`}>Dealer button</label>
          <select id={`hand-dealer-${handNumber}`} className="field" value={dealerId} onChange={(e) => setDealerId(e.target.value)} data-testid="select-hand-dealer">
            <option value="">Not tracked</option>
            {dealtIn.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
          </select>
        </div>
        {session.feePerHand > 0 || (initial && initial.fee > 0) ? (
          <label className="toggle-row" data-testid="toggle-hand-fee">
            <input type="checkbox" checked={chargeFee} onChange={(e) => setChargeFee(e.target.checked)} />
            <span>
              <span className="block text-sm font-bold">House fee {inr(initial && initial.fee > 0 ? initial.fee : session.feePerHand)}</span>
              <span className="block text-[11px] text-[hsl(var(--muted-foreground))]">Off for a misdeal or walk</span>
            </span>
          </label>
        ) : null}
      </div>
      {sb && bb && (session.smallBlind || session.bigBlind) ? (
        <p className="-mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">
          Blinds this hand: <b>{nameOf(sb)}</b> {inr(session.smallBlind ?? 0)} · <b>{nameOf(bb)}</b> {inr(session.bigBlind ?? 0)}
        </p>
      ) : null}

      {/* Money in */}
      <div className="space-y-2" data-testid="panel-paid-in">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="eyebrow">Who put money in?</div>
            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
              {actionPaid ? "Worked out from the betting actions below." : "What each player put in this hand, winner included. Leave blank if they folded without paying."}
            </p>
          </div>
          {!actionPaid ? (
            <div className="flex items-center gap-1.5">
              <div className="w-24"><MoneyInput id={`same-for-${handNumber}`} label="Same amount for everyone" placeholder="Each" value={sameFor} onChange={setSameFor} size="sm" onEnter={() => sameFor && applyPaid(Object.fromEntries(dealtIn.map((id) => [id, sameFor])))} testId="input-paid-all" /></div>
              <button className="btn btn-soft !px-2.5 !py-1.5 !text-xs" disabled={!sameFor} onClick={() => applyPaid(Object.fromEntries(dealtIn.map((id) => [id, sameFor])))} data-testid="button-paid-all">Everyone</button>
              {Object.values(paid).some(Boolean) ? <button className="btn btn-ghost !px-2 !py-1.5 !text-xs" onClick={() => applyPaid({})}>Clear</button> : null}
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {dealtIn.map((id) => (
            <div key={id} className="rounded-lg bg-[hsl(var(--secondary)/.45)] p-2">
              <label className="mb-1 block truncate text-xs font-bold" htmlFor={`paid-${handNumber}-${id}`}>{nameOf(id)}</label>
              {actionPaid ? (
                <div className="mono-font px-1 py-1 text-sm">{inr(actionPaid[id] ?? 0)}</div>
              ) : (
                <MoneyInput id={`paid-${handNumber}-${id}`} placeholder="0" value={paid[id] ?? ""} onChange={(v) => applyPaid({ ...paid, [id]: v })} size="sm" testId={`input-paid-${id}`} />
              )}
            </div>
          ))}
        </div>
        {paidTotal > 0 ? (
          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
            Total in: <b className="text-[hsl(var(--foreground))]">{inr(paidTotal)}</b>
            {potTouched && hasAnyAmount && grossTotal !== paidTotal ? <span className="text-[hsl(var(--destructive))]"> · pot says {inr(grossTotal)}</span> : " · the pot below fills in by itself"}
          </p>
        ) : null}
      </div>

      {/* Pots */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="eyebrow">Who won?</div>
            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">Tap more than one name to split a pot.</p>
          </div>
          <button className="btn btn-soft !px-3 !py-2 !text-xs" onClick={() => setPots((c) => [...c, createPot(`Side pot ${c.length}`)])} data-testid="button-add-side-pot">
            <Plus size={13} /> Side pot
          </button>
        </div>
        {pots.map((pot, index) => (
          <PotEditor
            key={pot.id}
            pot={pot}
            fee={index === 0 ? fee : 0}
            playerIds={dealtIn}
            seatOrder={seatOrder}
            nameOf={nameOf}
            removable={index > 0}
            onUpdate={(updater) => updatePot(pot.id, updater)}
            onRemove={() => setPots((c) => c.filter((p) => p.id !== pot.id))}
            onTouch={() => setPotTouched(true)}
            onToggleWinner={(playerId) => toggleWinner(pot, playerId)}
          />
        ))}
      </div>

      {/* Board */}
      {showBoard ? (
        <Collapsible
          title="Community cards"
          meta={board.length ? `${board.length} cards` : "optional"}
          open={openBoard}
          onToggle={setOpenBoard}
          testId="details-board"
        >
          <CardPicker cards={board} onChange={setBoard} />
        </Collapsible>
      ) : null}

      {/* Actions */}
      <Collapsible
        title="Betting actions"
        meta={actions.length ? `${actions.length} logged${replay.issues.length ? ` · ${replay.issues.length} to check` : ""}` : "optional · works out side pots for you"}
        open={openActions}
        onToggle={setOpenActions}
        testId="details-betting-actions"
        warn={replay.issues.length > 0}
      >
        <ActionComposer
          actions={actions}
          setActions={setActions}
          ctx={ctx}
          nameOf={nameOf}
          issueById={issueById}
          bigBlind={session.bigBlind}
        />
        {computed && computed.pots.length ? (
          <div className="mt-4 rounded-xl border border-dashed border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.06)] p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold">
                  From the betting: {computed.pots.map((p, i) => `${i === 0 ? "main" : `side ${i}`} ${inr(p.amount)}`).join(" · ")}
                </div>
                {computed.returned ? (
                  <div className="mt-0.5 text-[hsl(var(--muted-foreground))]">{inr(computed.returned.amount)} uncalled goes back to {nameOf(computed.returned.playerId)}.</div>
                ) : null}
              </div>
              <button className="btn btn-accent !px-3 !py-1.5 !text-xs" onClick={applyComputedPots} data-testid="button-apply-computed-pots">
                <Calculator size={13} /> Use these pots
              </button>
            </div>
          </div>
        ) : null}
      </Collapsible>

      <div>
        <label className="eyebrow mb-1.5 block" htmlFor={`hand-note-${handNumber}`}>Note <span className="normal-case tracking-normal">(optional)</span></label>
        <input id={`hand-note-${handNumber}`} className="field" placeholder="Bad beat, bluff, hero call…" value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-hand-note" />
      </div>

      {error ? <p className="flex items-start gap-1.5 text-xs font-medium text-[hsl(var(--destructive))]" role="alert" data-testid="status-hand-error"><AlertTriangle size={14} className="mt-px shrink-0" /> {error}</p> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {hasAnyAmount ? <>Pot {inr(grossTotal)}{fee ? <> · fee {inr(fee)} · paid out {inr(Math.max(0, grossTotal - fee))}</> : null}</> : fee ? <>Fee {inr(fee)} is recorded even without a pot amount.</> : null}
        </span>
        <div className="flex gap-2">
          {onCancel ? <button className="btn btn-soft flex-1 sm:flex-none" onClick={onCancel}>Cancel</button> : null}
          <button className="btn btn-primary flex-1 sm:flex-none" onClick={save} data-testid="button-log-hand">
            {initial ? "Save changes" : <><Plus size={15} /> Log hand #{handNumber}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Collapsible({ title, meta, open, onToggle, children, testId, warn }: { title: string; meta: string; open: boolean; onToggle: (open: boolean) => void; children: React.ReactNode; testId: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.3)]" data-testid={testId}>
      <button className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left" onClick={() => onToggle(!open)} aria-expanded={open}>
        <span className="text-sm font-bold">
          {title} <span className={`ml-1 text-xs font-normal ${warn ? "text-[hsl(var(--destructive))]" : "text-[hsl(var(--muted-foreground))]"}`}>{meta}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="border-t border-[hsl(var(--border))] p-4">{children}</div> : null}
    </div>
  );
}

function ActionComposer({
  actions,
  setActions,
  ctx,
  nameOf,
  issueById,
  bigBlind,
}: {
  actions: HandAction[];
  setActions: (updater: (current: HandAction[]) => HandAction[]) => void;
  ctx: HandContext;
  nameOf: (id: string) => string;
  issueById: Map<string, string>;
  bigBlind: number | null;
}) {
  const full = replayHand(actions, ctx);
  const [street, setStreet] = useState<Street>(full.street);
  const [actorId, setActorId] = useState("");
  const [sizing, setSizing] = useState<"Bet" | "Raise" | "All-in" | null>(null);
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState("");

  const streetIndex = STREETS.indexOf(street);
  const minStreet = STREETS.indexOf(full.street);
  const effectiveStreet = streetIndex < minStreet ? full.street : street;
  const state = replayHand(actions, ctx, effectiveStreet);
  const canAct = ctx.playerIds.filter((id) => !state.folded.has(id) && !state.allIn.has(id));
  const actor = canAct.includes(actorId) ? actorId : "";
  const committed = actor ? state.streetCommit[actor] ?? 0 : 0;
  const facing = Math.max(0, state.currentBet - committed);
  const liveCount = ctx.playerIds.filter((id) => !state.folded.has(id)).length;

  const nextActor = (after: string) => {
    const start = ctx.playerIds.indexOf(after);
    for (let step = 1; step <= ctx.playerIds.length; step++) {
      const id = ctx.playerIds[(start + step) % ctx.playerIds.length];
      if (canAct.includes(id) && id !== after) return id;
    }
    return "";
  };

  const push = (action: BettingAction, to: number | null) => {
    if (!actor) { setLocalError("Pick who's acting first."); return; }
    setActions((current) => [...current, { id: uid("action"), street: effectiveStreet, playerId: actor, action, amount: to }]);
    setStreet(effectiveStreet);
    setSizing(null);
    setAmount("");
    setLocalError("");
    setActorId(nextActor(actor));
  };

  const confirmSizing = () => {
    if (!sizing) return;
    const to = Number(amount);
    if (!amount || !Number.isFinite(to) || to <= 0) { setLocalError("Enter the total amount on this street."); return; }
    if (sizing !== "All-in" && to <= state.currentBet) { setLocalError(`Must be more than ${inr(state.currentBet)}.`); return; }
    push(sizing, to);
  };

  const minRaise = state.currentBet > 0 ? state.currentBet + (bigBlind ?? state.currentBet) : bigBlind ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Street">
        {STREETS.map((s, i) => (
          <button
            key={s}
            role="tab"
            aria-selected={effectiveStreet === s}
            disabled={i < minStreet}
            className={`chip-btn ${effectiveStreet === s ? "is-on" : ""}`}
            onClick={() => setStreet(s)}
            data-testid={`button-street-${s}`}
          >
            {s}
          </button>
        ))}
      </div>
      {liveCount <= 1 && actions.length ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Everyone else has folded — the hand is over.</p>
      ) : (
        <>
          <div>
            <div className="eyebrow mb-1.5">Who's acting · to call {inr(state.currentBet)}</div>
            <div className="flex flex-wrap gap-1.5">
              {ctx.playerIds.map((id) => {
                const out = state.folded.has(id);
                const shoved = state.allIn.has(id);
                return (
                  <button
                    key={id}
                    disabled={out || shoved}
                    className={`chip-btn ${actor === id ? "is-on" : ""} ${out ? "line-through" : ""}`}
                    onClick={() => { setActorId(id); setSizing(null); setLocalError(""); }}
                    data-testid={`button-actor-${id}`}
                  >
                    {nameOf(id)}
                    {state.streetCommit[id] ? <span className="ml-1 opacity-70">{inr(state.streetCommit[id])}</span> : null}
                    {shoved ? <span className="ml-1 opacity-70">all-in</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
          {actor ? (
            <div className="flex flex-wrap gap-1.5" data-testid="action-buttons">
              <button className="btn btn-soft !px-3 !py-2 !text-xs" onClick={() => push("Fold", null)} data-testid="button-action-fold">Fold</button>
              {facing > 0 ? (
                <button className="btn btn-soft !px-3 !py-2 !text-xs" onClick={() => push("Call", state.currentBet)} data-testid="button-action-call">Call {inr(facing)}</button>
              ) : (
                <button className="btn btn-soft !px-3 !py-2 !text-xs" onClick={() => push("Check", null)} data-testid="button-action-check">Check</button>
              )}
              {state.currentBet === 0 ? (
                <button className={`btn !px-3 !py-2 !text-xs ${sizing === "Bet" ? "btn-primary" : "btn-soft"}`} onClick={() => setSizing("Bet")} data-testid="button-action-bet">Bet…</button>
              ) : (
                <button className={`btn !px-3 !py-2 !text-xs ${sizing === "Raise" ? "btn-primary" : "btn-soft"}`} onClick={() => setSizing("Raise")} data-testid="button-action-raise">Raise…</button>
              )}
              <button className={`btn !px-3 !py-2 !text-xs ${sizing === "All-in" ? "btn-primary" : "btn-soft"}`} onClick={() => setSizing("All-in")} data-testid="button-action-allin">All-in…</button>
            </div>
          ) : null}
          {actor && sizing ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-36">
                <MoneyInput id="action-amount" label={`${sizing} to`} placeholder={sizing === "All-in" ? "Total in" : String(minRaise || "")} value={amount} onChange={setAmount} onEnter={confirmSizing} autoFocus testId="input-action-amount" />
              </div>
              <button className="btn btn-primary !px-3 !py-2 !text-xs" onClick={confirmSizing} data-testid="button-add-action">
                {sizing === "All-in" ? "All-in" : `${sizing} to`} {amount ? inr(Number(amount)) : ""}
              </button>
              <span className="w-full text-[11px] text-[hsl(var(--muted-foreground))]">
                Enter their <b>total</b> for this street{committed ? ` (they already have ${inr(committed)} in)` : ""}.
              </span>
            </div>
          ) : null}
        </>
      )}
      {localError ? <p className="text-xs text-[hsl(var(--destructive))]" role="alert">{localError}</p> : null}

      {actions.length ? (
        <ol className="space-y-1 border-t border-[hsl(var(--border))] pt-3">
          {actions.map((item, i) => {
            const issue = issueById.get(item.id);
            const showStreet = i === 0 || actions[i - 1].street !== item.street;
            return (
              <li key={item.id}>
                {showStreet ? <div className="eyebrow mb-1 mt-2 first:mt-0">{item.street}</div> : null}
                <div className="flex items-center gap-2 text-xs" data-testid={`row-action-${item.id}`}>
                  <span className="font-bold">{nameOf(item.playerId)}</span>
                  <span>{describeAction(item)}</span>
                  {issue ? <span className="flex items-center gap-1 text-[hsl(var(--destructive))]"><AlertTriangle size={12} /> {issue}</span> : null}
                  <button className="ml-auto rounded p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]" onClick={() => setActions((c) => c.filter((a) => a.id !== item.id))} aria-label="Remove action" data-testid={`button-remove-action-${item.id}`}>
                    <X size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

export function describeAction(a: HandAction) {
  switch (a.action) {
    case "Fold": return "folds";
    case "Check": return "checks";
    case "Call": return a.amount !== null ? `calls ${inr(a.amount)}` : "calls";
    case "Bet": return `bets ${inr(a.amount ?? 0)}`;
    case "Raise": return `raises to ${inr(a.amount ?? 0)}`;
    case "All-in": return `all-in for ${inr(a.amount ?? 0)}`;
  }
}

function PotEditor({
  pot,
  fee,
  playerIds,
  seatOrder,
  nameOf,
  removable,
  onUpdate,
  onRemove,
  onToggleWinner,
  onTouch,
}: {
  onTouch: () => void;
  pot: DraftPot;
  fee: number;
  playerIds: string[];
  seatOrder: string[];
  nameOf: (id: string) => string;
  removable: boolean;
  onUpdate: (updater: (pot: DraftPot) => DraftPot) => void;
  onRemove: () => void;
  onToggleWinner: (playerId: string) => void;
}) {
  const net = payable(pot, fee);
  const even = shares({ ...pot, splitMode: "even" }, fee, seatOrder);
  const mismatch = customMismatch(pot, fee);
  const eligible = pot.eligibleIds.length ? pot.eligibleIds : playerIds;

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:p-4" data-testid={`panel-pot-${pot.id}`}>
      <div className="mb-3 flex items-center gap-2">
        <input
          className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
          value={pot.label}
          onChange={(e) => onUpdate((c) => ({ ...c, label: e.target.value }))}
          aria-label="Pot name"
          data-testid={`input-pot-label-${pot.id}`}
        />
        <div className="w-32 sm:w-40">
          <MoneyInput id={`pot-amount-${pot.id}`} label={`${pot.label} amount`} placeholder="Pot" value={pot.amount} onChange={(amount) => { onTouch(); onUpdate((c) => ({ ...c, amount })); }} testId={`input-pot-amount-${pot.id}`} size="sm" />
        </div>
        {removable ? (
          <button className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]" onClick={onRemove} aria-label={`Remove ${pot.label}`} data-testid={`button-remove-pot-${pot.id}`}>
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {playerIds.map((id) => {
          const selected = pot.winnerIds.includes(id);
          const allowed = eligible.includes(id);
          return (
            <button
              key={id}
              className={`chip-btn ${selected ? "is-accent" : ""}`}
              aria-pressed={selected}
              disabled={!allowed && !selected}
              title={allowed ? undefined : "Not in this pot"}
              onClick={() => onToggleWinner(id)}
              data-testid={`button-pot-winner-${pot.id}-${id}`}
            >
              {nameOf(id)}
              {selected && pot.splitMode === "even" && net !== null ? <span className="ml-1.5 mono-font opacity-80">{inr(even[id] ?? 0)}</span> : null}
            </button>
          );
        })}
        {!playerIds.length ? <span className="text-xs text-[hsl(var(--muted-foreground))]">No one is dealt in.</span> : null}
      </div>

      {fee && net !== null ? <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">{inr(Number(pot.amount))} − {inr(fee)} house fee = <b>{inr(net)}</b> to the winner{pot.winnerIds.length > 1 ? "s" : ""}.</p> : null}

      {pot.winnerIds.length > 1 ? (
        <div className="mt-3 border-t border-[hsl(var(--border))] pt-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs">
            <span className="text-[hsl(var(--muted-foreground))]">{pot.splitMode === "even" ? "Split evenly (odd rupee to earliest seat)" : "Custom shares"}</span>
            <button
              className="font-bold text-[hsl(var(--accent))] underline-offset-2 hover:underline"
              onClick={() => onUpdate((c) => ({
                ...c,
                splitMode: c.splitMode === "even" ? "custom" : "even",
                customAmounts: c.splitMode === "even" ? Object.fromEntries(c.winnerIds.map((id) => [id, String(even[id] ?? 0)])) : c.customAmounts,
              }))}
              data-testid={`button-toggle-split-${pot.id}`}
            >
              {pot.splitMode === "even" ? "Customise" : "Split evenly"}
            </button>
          </div>
          {pot.splitMode === "custom" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {pot.winnerIds.map((id) => (
                <div key={id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium">{nameOf(id)}</span>
                  <div className="w-28">
                    <MoneyInput id={`share-${pot.id}-${id}`} label={`${nameOf(id)} share`} value={pot.customAmounts[id] ?? ""} onChange={(v) => onUpdate((c) => ({ ...c, customAmounts: { ...c.customAmounts, [id]: v } }))} size="sm" testId={`input-custom-share-${pot.id}-${id}`} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {mismatch !== null ? (
            <p className="mt-2 text-[11px] text-[hsl(var(--destructive))]" data-testid={`status-split-mismatch-${pot.id}`}>
              Shares are {inr(Math.abs(mismatch))} {mismatch > 0 ? "over" : "under"} the {inr(net ?? 0)} being paid out.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
