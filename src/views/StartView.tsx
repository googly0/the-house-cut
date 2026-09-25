import { useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, ChevronRight, Hand, History, Play, Plus, RotateCcw, Scale, WalletCards, X } from "lucide-react";
import { GAME_VARIANTS, hostTotal, inr, parseAmount, sessionDetails, type Session, type SessionSetup } from "../poker";
import { MoneyInput, PlayerDot, formatDate, formatTime } from "../components/bits";
import { SessionRow } from "./HistoryView";

function localDateValue() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function StartView({
  activeSession,
  pastSessions,
  onStart,
  onResume,
  onHistory,
  onSelectPast,
}: {
  activeSession: Session | null;
  pastSessions: Session[];
  onStart: (date: string, names: string[], setup: SessionSetup) => void;
  onResume: () => void;
  onHistory: () => void;
  onSelectPast: (session: Session) => void;
}) {
  const last = pastSessions[0] ?? null;
  return (
    <div className="animate-rise">
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-center">
        <section className="max-w-2xl">
          <div className="eyebrow mb-5 flex items-center gap-2 text-[hsl(var(--accent))]"><span className="h-px w-8 bg-[hsl(var(--accent))]" /> One host. One clean ledger.</div>
          <h1 className="display-font text-[clamp(2.9rem,8vw,6.4rem)] leading-[.92] tracking-[-.055em]">
            Keep the table<br /><span className="text-[hsl(var(--accent))]">in the room.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-7 text-[hsl(var(--muted-foreground))]">
            Buy-ins, rebuys, every hand, side pots and splits, then a settle-up list the group can pay from. Built for home games, not for play money or online poker.
          </p>
          <div className="mt-7 flex flex-wrap gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="pill"><Scale size={12} /> Chip check before anyone pays</span>
            <span className="pill"><WalletCards size={12} /> Fewest transfers to settle</span>
            <span className="pill"><Hand size={12} /> Auto side pots</span>
          </div>
        </section>
        <StartCard activeSession={activeSession} lastSession={last} onStart={onStart} onResume={onResume} />
      </div>

      <section className="mt-16">
        <div className="mb-5 flex items-end justify-between">
          <div><div className="eyebrow">Your paper trail</div><h2 className="display-font mt-1 text-3xl tracking-[-.04em]">Recent sessions</h2></div>
          {pastSessions.length ? <button className="btn btn-ghost !px-2" onClick={onHistory} data-testid="button-view-history">View all <ChevronRight size={15} /></button> : null}
        </div>
        {pastSessions.length ? (
          <div className="grid gap-3">
            {pastSessions.slice(0, 3).map((session, index) => <SessionRow key={session.id} session={session} index={index} onClick={() => onSelectPast(session)} />)}
          </div>
        ) : (
          <div className="surface flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"><History size={19} /></div>
            <h3 className="font-bold">No past sessions yet</h3>
            <p className="mt-1 max-w-xs text-sm text-[hsl(var(--muted-foreground))]">Finished games land here with their settle-up list.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function StartCard({ activeSession, lastSession, onStart, onResume }: { activeSession: Session | null; lastSession: Session | null; onStart: (date: string, names: string[], setup: SessionSetup) => void; onResume: () => void }) {
  const [date, setDate] = useState(localDateValue);
  const [names, setNames] = useState<string[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState("");
  const [gameVariant, setGameVariant] = useState<SessionSetup["gameVariant"]>(lastSession?.gameVariant ?? "Texas Hold'em");
  const [smallBlind, setSmallBlind] = useState(lastSession?.smallBlind != null ? String(lastSession.smallBlind) : "");
  const [bigBlind, setBigBlind] = useState(lastSession?.bigBlind != null ? String(lastSession.bigBlind) : "");
  const [ante, setAnte] = useState(lastSession?.ante ? String(lastSession.ante) : "");
  const [fee, setFee] = useState(String(lastSession?.feePerHand ?? 20));
  const [defaultBuyIn, setDefaultBuyIn] = useState(lastSession?.defaultBuyIn != null ? String(lastSession.defaultBuyIn) : "");

  const addName = () => {
    const clean = nameInput.trim().replace(/\s+/g, " ");
    if (!clean) return;
    if (names.some((n) => n.toLowerCase() === clean.toLowerCase())) { setNameError(`${clean} is already at the table.`); return; }
    if (names.length >= 12) { setNameError("12 players max."); return; }
    setNames((c) => [...c, clean]);
    setNameInput("");
    setNameError("");
  };
  const move = (index: number, delta: number) => setNames((c) => {
    const next = [...c];
    const [item] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, item);
    return next;
  });

  const sb = parseAmount(smallBlind);
  const bb = parseAmount(bigBlind);
  const blindsBackwards = sb !== null && bb !== null && sb > bb;

  const submit = () => {
    const pending = nameInput.trim();
    const finalNames = pending && !names.some((n) => n.toLowerCase() === pending.toLowerCase()) ? [...names, pending] : names;
    if (!finalNames.length || !date || blindsBackwards) return;
    onStart(date, finalNames, {
      gameVariant,
      smallBlind: sb,
      bigBlind: bb,
      ante: parseAmount(ante) || null,
      feePerHand: parseAmount(fee) ?? 0,
      defaultBuyIn: parseAmount(defaultBuyIn) || null,
    });
  };

  if (activeSession) {
    return (
      <section className="surface overflow-hidden !border-[hsl(var(--accent)/.35)]">
        <div className="bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] sm:p-7">
          <div className="eyebrow !text-[hsl(var(--primary-foreground)/.6)]">A session is live</div>
          <h2 className="display-font mt-2 text-3xl tracking-[-.04em]">Back to the felt.</h2>
          <p className="mt-2 text-sm text-[hsl(var(--primary-foreground)/.75)]">{formatDate(activeSession.startedAt)} · {activeSession.players.length} players · {activeSession.hands.length} hands</p>
          <p className="mt-1 text-xs text-[hsl(var(--primary-foreground)/.6)]">{sessionDetails(activeSession)}</p>
        </div>
        <div className="p-6 sm:p-7">
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[hsl(var(--secondary)/.7)] p-3"><div className="eyebrow">House fees</div><div className="mono-font mt-1 text-lg">{inr(hostTotal(activeSession))}</div></div>
            <div className="rounded-xl bg-[hsl(var(--secondary)/.7)] p-3"><div className="eyebrow">Started</div><div className="mono-font mt-1 text-lg">{formatTime(activeSession.startedAt)}</div></div>
          </div>
          <button className="btn btn-accent w-full" onClick={onResume} data-testid="button-resume-session"><Play size={15} /> Resume live session</button>
        </div>
      </section>
    );
  }

  return (
    <section className="surface p-5 sm:p-7">
      <div className="mb-5 flex items-start justify-between">
        <div><div className="eyebrow">Open a new session</div><h2 className="display-font mt-1 text-3xl tracking-[-.04em]">Deal in.</h2></div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--accent)/.12)] text-[hsl(var(--accent))]"><Play size={18} /></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="eyebrow mb-1.5 block" htmlFor="session-date">Date</label>
          <div className="relative">
            <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <input id="session-date" className="field !pl-9" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-session-date" />
          </div>
        </div>
        <div>
          <label className="eyebrow mb-1.5 block" htmlFor="game-variant">Game</label>
          <select id="game-variant" className="field" value={gameVariant} onChange={(e) => setGameVariant(e.target.value as SessionSetup["gameVariant"])} data-testid="select-game-variant">
            {GAME_VARIANTS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <label className="eyebrow mb-1.5 block" htmlFor="small-blind">Small blind</label>
          <MoneyInput id="small-blind" value={smallBlind} onChange={setSmallBlind} testId="input-small-blind" />
        </div>
        <div>
          <label className="eyebrow mb-1.5 block" htmlFor="big-blind">Big blind</label>
          <MoneyInput id="big-blind" value={bigBlind} onChange={setBigBlind} testId="input-big-blind" />
        </div>
        <div>
          <label className="eyebrow mb-1.5 block" htmlFor="game-ante">Ante</label>
          <MoneyInput id="game-ante" value={ante} onChange={setAnte} testId="input-game-ante" />
        </div>
      </div>
      {blindsBackwards ? <p className="mt-1.5 text-xs text-[hsl(var(--destructive))]">Small blind is bigger than the big blind.</p> : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label className="eyebrow mb-1.5 block" htmlFor="fee-per-hand">House fee / hand</label>
          <MoneyInput id="fee-per-hand" value={fee} onChange={setFee} testId="input-fee-per-hand" />
        </div>
        <div>
          <label className="eyebrow mb-1.5 block" htmlFor="default-buyin">Standard buy-in</label>
          <MoneyInput id="default-buyin" placeholder="e.g. 500" value={defaultBuyIn} onChange={setDefaultBuyIn} testId="input-default-buyin" />
        </div>
      </div>

      <div className="mb-1.5 mt-5 flex items-center justify-between">
        <label className="eyebrow" htmlFor="player-name">Players · seat order</label>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{names.length} added</span>
      </div>
      <div className="flex gap-2">
        <input id="player-name" className="field" placeholder="Type a name, press Enter" value={nameInput} maxLength={24} onChange={(e) => { setNameInput(e.target.value); setNameError(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addName(); } }} data-testid="input-player-name" />
        <button className="btn btn-soft !px-3" onClick={addName} aria-label="Add player" data-testid="button-add-player"><Plus size={17} /></button>
      </div>
      {nameError ? <p className="mt-1.5 text-xs text-[hsl(var(--destructive))]">{nameError}</p> : null}
      {lastSession && !names.length ? (
        <button className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[hsl(var(--accent))] hover:underline" onClick={() => setNames(lastSession.players.map((p) => p.name))} data-testid="button-same-players">
          <RotateCcw size={12} /> Same table as {formatDate(lastSession.startedAt, false)} ({lastSession.players.map((p) => p.name).join(", ")})
        </button>
      ) : null}

      <div className="mb-5 mt-3 space-y-1.5">
        {names.map((name, index) => (
          <div key={name} className="flex items-center gap-2 rounded-lg bg-[hsl(var(--secondary)/.65)] py-1.5 pl-3 pr-1 text-sm" data-testid={`row-player-${index}`}>
            <span className="mono-font w-4 text-[10px] text-[hsl(var(--muted-foreground))]">{index + 1}</span>
            <PlayerDot name={name} size="sm" />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <button className="btn btn-ghost !p-1.5" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${name} up`}><ArrowUp size={13} /></button>
            <button className="btn btn-ghost !p-1.5" disabled={index === names.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${name} down`}><ArrowDown size={13} /></button>
            <button className="btn btn-ghost !p-1.5" onClick={() => setNames((c) => c.filter((_, i) => i !== index))} aria-label={`Remove ${name}`} data-testid={`button-remove-player-${index}`}><X size={14} /></button>
          </div>
        ))}
        {!names.length ? <p className="pt-1 text-xs text-[hsl(var(--muted-foreground))]">Add players in the order they sit — the dealer button moves that way.</p> : null}
      </div>
      <button className="btn btn-primary w-full" disabled={(!names.length && !nameInput.trim()) || !date || blindsBackwards} onClick={submit} data-testid="button-start-session"><Play size={15} /> Start session</button>
      <p className="mt-3 text-center text-[11px] text-[hsl(var(--muted-foreground))]">Saved in this browser. Export a backup from History.</p>
    </section>
  );
}
