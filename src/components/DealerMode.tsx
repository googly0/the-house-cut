import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Crown, Layers, Undo2, X } from "lucide-react";
import {
  blindSeats,
  buildPots,
  dealerState,
  inr,
  nextDealerId,
  potSizedRaiseTo,
  splitEvenly,
  totalBuyIns,
  trackedResults,
  uid,
  type BettingAction,
  type HandAction,
  type HandContext,
  type HandRecord,
  type PotResult,
  type Session,
} from "../poker";
import { CardPicker } from "./CardPicker";
import { MoneyInput, PlayingCard } from "./bits";

/** Keep the phone screen on while the dealer is running hands. */
function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    let sentinel: Sentinel | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    const acquire = async () => {
      try { sentinel = (await nav.wakeLock?.request("screen")) ?? null; } catch { /* not supported / denied */ }
    };
    acquire();
    const onVis = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      sentinel?.release().catch(() => {});
    };
  }, []);
}

function buzz(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
}

export function DealerMode(props: Parameters<typeof DealerModeInner>[0]) {
  return createPortal(<DealerModeInner {...props} />, document.body);
}

function DealerModeInner({ session, onSave, onClose }: { session: Session; onSave: (hand: HandRecord) => void; onClose: () => void }) {
  useWakeLock();
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handNumber = session.hands.length + 1;
  const nameOf = (id: string) => session.players.find((p) => p.id === id)?.name ?? "Player";

  // Chips each player has at the start of this hand (buy-ins ± tracked results).
  const tracked = useMemo(() => trackedResults(session), [session]);
  const stackTracking = session.players.some((p) => totalBuyIns(p) > 0);
  const startStack = (id: string) => (stackTracking ? tracked.byPlayer[id]?.stack ?? 0 : Infinity);

  const seated = session.players.filter((p) => !p.sittingOut);
  const busted = stackTracking ? seated.filter((p) => startStack(p.id) <= 0) : [];
  const dealtIn = seated.filter((p) => !busted.includes(p)).map((p) => p.id);

  const [dealerId, setDealerId] = useState(() => {
    const suggested = nextDealerId(session);
    return suggested && dealtIn.includes(suggested) ? suggested : dealtIn[0] ?? "";
  });
  const [actions, setActions] = useState<HandAction[]>([]);
  const [board, setBoard] = useState<string[]>([]);
  const [showBoard, setShowBoard] = useState(false);
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [winners, setWinners] = useState<Record<number, string[]>>({});
  const [feeOverride, setFeeOverride] = useState<boolean | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);

  const ctx: HandContext = { playerIds: dealtIn, dealerId, smallBlind: session.smallBlind, bigBlind: session.bigBlind, ante: session.ante };
  const st = dealerState(actions, ctx);
  const { sb, bb } = blindSeats(ctx);
  const step = session.smallBlind || session.bigBlind || 10;
  const behind = (id: string) => startStack(id) - (st.contributions[id] ?? 0);

  const actor = st.toAct;
  const actorCommit = actor ? st.commit[actor] ?? 0 : 0;
  const toCall = actor ? Math.max(0, st.currentBet - actorCommit) : 0;
  const actorAllInTo = actor ? actorCommit + behind(actor) : 0;

  const push = (action: BettingAction, amount: number | null) => {
    if (!actor) return;
    buzz();
    setActions((c) => [...c, { id: uid("action"), street: st.actionStreet, playerId: actor, action, amount }]);
    setShowCustom(false);
    setCustom("");
  };

  const call = () => {
    if (!actor) return;
    if (Number.isFinite(actorAllInTo) && actorAllInTo <= st.currentBet) push("All-in", actorAllInTo);
    else push("Call", st.currentBet);
  };

  const raiseTo = (to: number) => {
    if (!actor) return;
    if (Number.isFinite(actorAllInTo) && to >= actorAllInTo) push("All-in", actorAllInTo);
    else push(st.currentBet === 0 ? "Bet" : "Raise", to);
  };

  const presets = useMemo(() => {
    if (!actor) return [] as { label: string; to: number }[];
    const out: { label: string; to: number }[] = [];
    const add = (label: string, to: number) => {
      if (Number.isFinite(actorAllInTo) && to >= actorAllInTo) return;
      if (to <= st.currentBet || out.some((o) => o.to === to)) return;
      out.push({ label, to });
    };
    add("Min", st.minRaiseTo);
    add("½ pot", potSizedRaiseTo(st, actor, 0.5, step));
    add("¾ pot", potSizedRaiseTo(st, actor, 0.75, step));
    add("Pot", potSizedRaiseTo(st, actor, 1, step));
    return out;
  }, [actor, st, actorAllInTo, step]);

  // Showdown / result
  const pots = useMemo(() => (st.phase === "betting" ? null : buildPots(st.contributions, st.folded)), [st]);
  // "No flop, no drop": a hand that ends pre-flop defaults to no house fee.
  const noFlopNoDrop = st.phase === "folded" && st.street === "Pre-flop";
  const chargeFee = feeOverride ?? (session.feePerHand > 0 && !noFlopNoDrop);
  const fee = chargeFee ? session.feePerHand : 0;
  const potsReady = pots ? pots.pots.every((p, i) => p.eligibleIds.length === 1 || (winners[i]?.length ?? 0) > 0) : false;

  const finish = () => {
    if (!pots) return;
    const results: PotResult[] = pots.pots.map((p, i) => {
      const w = p.eligibleIds.length === 1 ? p.eligibleIds : winners[i] ?? [];
      const payout = Math.max(0, p.amount - (i === 0 ? fee : 0));
      const shares = splitEvenly(payout, w, session.players.map((x) => x.id));
      return { id: uid("pot"), label: i === 0 ? "Main pot" : `Side pot ${i}`, amount: p.amount, eligibleIds: p.eligibleIds, awards: w.map((id) => ({ playerId: id, amount: shares[id] ?? 0 })) };
    });
    const contributions = { ...st.contributions };
    if (pots.returned) contributions[pots.returned.playerId] -= pots.returned.amount;
    onSave({
      id: uid("hand"),
      number: handNumber,
      loggedAt: new Date().toISOString(),
      fee: results[0] && results[0].amount !== null && results[0].amount >= fee ? fee : 0,
      note: null,
      dealerPlayerId: dealerId || null,
      board,
      actions,
      pots: results,
      contributions: Object.fromEntries(Object.entries(contributions).filter(([, v]) => v > 0)),
    });
    buzz(30);
    // Next hand: button moves one seat.
    const idx = dealtIn.indexOf(dealerId);
    setDealerId(dealtIn[(idx + 1) % dealtIn.length] ?? dealerId);
    setActions([]);
    setBoard([]);
    setWinners({});
    setShowBoard(false);
    setFeeOverride(null);
  };

  const boardTarget = st.street === "Flop" ? 3 : st.street === "Turn" ? 4 : st.street === "River" ? 5 : 0;
  const needCards = st.phase === "betting" && board.length < boardTarget;

  const exit = () => { if (actions.length) setConfirmExit(true); else onClose(); };

  if (dealtIn.length < 2) {
    return (
      <div className="dealer-shell grid place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">Need at least two players with chips.</p>
          {busted.length ? <p className="mt-2 text-sm opacity-70">{busted.map((p) => p.name).join(", ")} {busted.length === 1 ? "has" : "have"} no chips left — add a buy-in.</p> : null}
          <button className="btn btn-accent mt-6" onClick={onClose}>Back to the table</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dealer-shell" role="dialog" aria-modal="true" aria-label="Dealer mode" data-testid="dealer-mode">
      {/* Header */}
      <header className="dealer-top">
        <button className="dealer-icon" onClick={exit} aria-label="Close dealer mode" data-testid="button-dealer-close"><X size={20} /></button>
        <div className="min-w-0 flex-1 text-center">
          <div className="mono-font text-[10px] uppercase tracking-[.18em] opacity-60">Hand #{handNumber} · {st.phase === "betting" ? st.street : st.phase === "folded" ? "Won uncontested" : "Showdown"}</div>
          <div className="mono-font text-[28px] leading-tight" data-testid="text-dealer-pot">{inr(st.potTotal)}</div>
        </div>
        <button className="dealer-icon" disabled={!actions.length} onClick={() => { buzz(); setActions((c) => c.slice(0, -1)); setWinners({}); setFeeOverride(null); }} aria-label="Undo last action" data-testid="button-dealer-undo"><Undo2 size={20} /></button>
      </header>

      {/* Board */}
      <button className="dealer-board" onClick={() => setShowBoard((s) => !s)} aria-expanded={showBoard} data-testid="button-dealer-board">
        {board.length ? board.map((c) => <PlayingCard key={c} code={c} />) : <span className="text-xs opacity-60"><Layers size={13} className="mr-1 inline" />Board (optional)</span>}
        {needCards ? <span className="dealer-pill">add {st.street.toLowerCase()}</span> : null}
        <ChevronDown size={14} className={`ml-auto opacity-60 transition-transform ${showBoard ? "rotate-180" : ""}`} />
      </button>
      {showBoard ? <div className="dealer-sheet"><CardPicker cards={board} onChange={setBoard} /></div> : null}

      {/* Seats */}
      <div className="dealer-seats">
        {!actions.length ? (
          <label className="mb-2 flex items-center justify-between gap-2 text-xs opacity-80">
            <span>Button</span>
            <select className="dealer-select" value={dealerId} onChange={(e) => setDealerId(e.target.value)} data-testid="select-dealer-button">
              {dealtIn.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
            </select>
          </label>
        ) : null}
        {dealtIn.map((id) => {
          const isTurn = id === actor;
          const out = st.folded.has(id);
          const shove = st.allIn.has(id);
          const last = st.lastAction[id];
          const stack = behind(id);
          return (
            <div key={id} className={`dealer-seat ${isTurn ? "is-turn" : ""} ${out ? "is-out" : ""}`} data-testid={`seat-${id}`}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-bold">{nameOf(id)}</span>
                {id === dealerId ? <span className="seat-tag">D</span> : null}
                {id === sb && st.street === "Pre-flop" && session.smallBlind ? <span className="seat-tag">SB</span> : null}
                {id === bb && st.street === "Pre-flop" && session.bigBlind ? <span className="seat-tag">BB</span> : null}
              </div>
              <div className="flex items-center gap-3 text-right">
                <span className="text-[11px] opacity-70">
                  {out ? "folded" : shove ? "ALL-IN" : last ? label(last) : ""}
                </span>
                <span className="mono-font w-16 text-sm">{st.commit[id] ? inr(st.commit[id]) : ""}</span>
                {Number.isFinite(stack) ? <span className="mono-font w-16 text-[11px] opacity-60">{inr(Math.max(0, stack))}</span> : null}
              </div>
            </div>
          );
        })}
        {busted.length ? <p className="mt-2 text-[11px] opacity-60">Not dealt in (no chips): {busted.map((p) => p.name).join(", ")}</p> : null}
      </div>

      {/* Action bar */}
      <footer className="dealer-bar">
        {st.phase === "betting" && actor ? (
          <>
            <div className="mb-2 flex items-baseline justify-between">
              <div className="text-lg font-bold" data-testid="text-dealer-actor">{nameOf(actor)}</div>
              <div className="text-xs opacity-70">{toCall ? `${inr(toCall)} to call` : "nothing to call"}{Number.isFinite(behind(actor)) ? ` · ${inr(behind(actor))} behind` : ""}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="dealer-btn is-fold" onClick={() => push("Fold", null)} data-testid="button-dealer-fold">Fold</button>
              {toCall > 0 ? (
                <button className="dealer-btn is-call" onClick={call} data-testid="button-dealer-call">
                  {Number.isFinite(actorAllInTo) && actorAllInTo <= st.currentBet ? `Call all-in ${inr(actorAllInTo - actorCommit)}` : `Call ${inr(toCall)}`}
                </button>
              ) : (
                <button className="dealer-btn is-call" onClick={() => push("Check", null)} data-testid="button-dealer-check">Check</button>
              )}
            </div>
            {!(Number.isFinite(actorAllInTo) && actorAllInTo <= st.currentBet) ? (
              <div key={`${st.street}-${actor}-${actions.length}`} className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                {presets.map((p) => (
                  <button key={p.label} className="dealer-chip" onClick={() => raiseTo(p.to)} data-testid={`button-dealer-preset-${p.label}`}>
                    <span className="block text-[10px] opacity-70">{p.label}</span>
                    <span className="mono-font">{inr(p.to)}</span>
                  </button>
                ))}
                {Number.isFinite(actorAllInTo) ? (
                  <button className="dealer-chip is-shove" onClick={() => push("All-in", actorAllInTo)} data-testid="button-dealer-allin">
                    <span className="block text-[10px] opacity-80">All-in</span>
                    <span className="mono-font">{inr(actorAllInTo)}</span>
                  </button>
                ) : null}
                <button className={`dealer-chip ${showCustom ? "is-on" : ""}`} onClick={() => setShowCustom((s) => !s)} data-testid="button-dealer-custom">
                  <span className="block text-[10px] opacity-70">{st.currentBet ? "Raise to" : "Bet"}</span>
                  <span>…</span>
                </button>
              </div>
            ) : null}
            {showCustom ? (
              <div className="mt-2 flex gap-2">
                <div className="flex-1"><MoneyInput id="dealer-custom" label="Amount" placeholder={String(st.minRaiseTo)} value={custom} onChange={setCustom} autoFocus onEnter={() => Number(custom) >= st.minRaiseTo && raiseTo(Number(custom))} testId="input-dealer-custom" /></div>
                <button className="dealer-btn is-call !min-h-0 !px-4" disabled={!custom || Number(custom) < Math.min(st.minRaiseTo, actorAllInTo)} onClick={() => raiseTo(Number(custom))} data-testid="button-dealer-custom-go">
                  {st.currentBet ? "Raise" : "Bet"} {custom ? inr(Number(custom)) : ""}
                </button>
              </div>
            ) : null}
          </>
        ) : pots ? (
          <>
            {st.winnerByFold ? (
              <div className="mb-3 flex items-center gap-2 text-lg font-bold"><Crown size={18} className="text-[hsl(var(--felt-accent))]" /> {nameOf(st.winnerByFold)} takes it</div>
            ) : (
              <div className="mb-2 text-sm font-bold">{st.runout ? "All-in — deal it out, then tap the winner" : "Showdown — tap the winner"}{pots.pots.length > 1 ? "s" : ""}</div>
            )}
            {pots.returned ? <p className="mb-2 text-[11px] opacity-70">{inr(pots.returned.amount)} uncalled goes back to {nameOf(pots.returned.playerId)}.</p> : null}
            <div className="max-h-[34dvh] space-y-2 overflow-y-auto">
              {pots.pots.map((p, i) => (
                <div key={i} className="rounded-xl bg-white/5 p-2.5">
                  <div className="mb-1.5 flex justify-between text-xs"><span className="font-bold">{i === 0 ? "Main pot" : `Side pot ${i}`}</span><span className="mono-font">{inr(p.amount)}{i === 0 && fee ? ` − ${inr(fee)} fee` : ""}</span></div>
                  {p.eligibleIds.length === 1 ? (
                    <div className="text-sm">{nameOf(p.eligibleIds[0])}</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {p.eligibleIds.map((id) => {
                        const on = winners[i]?.includes(id);
                        return (
                          <button key={id} className={`dealer-chip !min-w-0 !px-3 ${on ? "is-win" : ""}`} aria-pressed={on} onClick={() => { buzz(); setWinners((w) => ({ ...w, [i]: on ? (w[i] ?? []).filter((x) => x !== id) : [...(w[i] ?? []), id] })); }} data-testid={`button-dealer-winner-${i}-${id}`}>
                            {nameOf(id)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {(winners[i]?.length ?? 0) > 1 ? <p className="mt-1 text-[10px] opacity-60">Split evenly</p> : null}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              {session.feePerHand > 0 ? (
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--felt-accent))]" checked={chargeFee} onChange={(e) => setFeeOverride(e.target.checked)} data-testid="toggle-dealer-fee" />
                  Fee {inr(session.feePerHand)}{noFlopNoDrop && !chargeFee ? <span className="opacity-60"> (no flop)</span> : null}
                </label>
              ) : null}
              <button className="dealer-btn is-call flex-1" disabled={!potsReady} onClick={finish} data-testid="button-dealer-finish">
                <Check size={18} /> Log hand · next deal
              </button>
            </div>
          </>
        ) : null}
      </footer>

      {confirmExit ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/60 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-[hsl(var(--felt-2))] p-5">
            <p className="font-bold">Leave this hand?</p>
            <p className="mt-1 text-sm opacity-70">The {actions.length} actions so far won't be saved.</p>
            <div className="mt-4 flex gap-2">
              <button className="dealer-btn flex-1 !min-h-[44px]" onClick={() => setConfirmExit(false)}>Keep dealing</button>
              <button className="dealer-btn is-fold flex-1 !min-h-[44px]" onClick={onClose} data-testid="button-dealer-discard">Discard</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function label(a: HandAction) {
  switch (a.action) {
    case "Fold": return "folded";
    case "Check": return "check";
    case "Call": return "call";
    case "Bet": return "bet";
    case "Raise": return "raise";
    case "All-in": return "ALL-IN";
  }
}
