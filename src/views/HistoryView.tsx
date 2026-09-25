import { useRef } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Download, Hand, History, IndianRupee, RotateCcw, Trash2, Upload, Users } from "lucide-react";
import { hostTotal, inr, playerNet, reconcile, sessionDetails, signedInr, totalBuyIns, type Player, type Session } from "../poker";
import { EmptyState, PlayerDot, StatCard, formatDate, formatDuration, formatTime } from "../components/bits";
import { HandRow } from "../components/HandRow";
import { ReconcileBar, SettleUp } from "../components/Settlement";

export function HistoryView({
  sessions,
  selectedSession,
  canReopen,
  onSelect,
  onBack,
  onDelete,
  onReopen,
  onExport,
  onImport,
}: {
  sessions: Session[];
  selectedSession: Session | null;
  canReopen: boolean;
  onSelect: (session: Session) => void;
  onBack: () => void;
  onDelete: (session: Session) => void;
  onReopen: (session: Session) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  if (selectedSession) {
    return <PastDetail session={selectedSession} canReopen={canReopen} onBack={onBack} onDelete={() => onDelete(selectedSession)} onReopen={() => onReopen(selectedSession)} />;
  }
  return (
    <div className="animate-rise">
      <div className="mb-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="eyebrow mb-3">The paper trail</div>
          <h1 className="display-font text-[clamp(2.4rem,7vw,3.8rem)] leading-none tracking-[-.05em]">Past sessions.</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-[hsl(var(--muted-foreground))]">Open a night for its hand log and settle-up list. Data lives only in this browser — export a backup now and then.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-soft !text-xs" onClick={onExport} disabled={!sessions.length} data-testid="button-export"><Download size={14} /> Export backup</button>
          <button className="btn btn-soft !text-xs" onClick={() => fileRef.current?.click()} data-testid="button-import"><Upload size={14} /> Import</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
        </div>
      </div>
      {sessions.length ? (
        <div className="grid gap-3">{sessions.map((s, i) => <SessionRow key={s.id} session={s} index={i} onClick={() => onSelect(s)} />)}</div>
      ) : (
        <div className="surface"><EmptyState icon={<History size={20} />} title="Nothing to review yet" body="Finish your first live session and it lands here automatically." /></div>
      )}
    </div>
  );
}

export function SessionRow({ session, index, onClick }: { session: Session; index: number; onClick: () => void }) {
  const settled = session.players.filter((p) => p.cashOut !== null).length;
  const rec = reconcile(session);
  const top = [...session.players].sort((a, b) => (playerNet(b) ?? -Infinity) - (playerNet(a) ?? -Infinity))[0];
  const topNet = top ? playerNet(top) : null;
  return (
    <button className="surface surface-lift group flex w-full items-center gap-4 p-4 text-left sm:p-5" onClick={onClick} data-testid={`button-open-session-${session.id}`}>
      <span className="mono-font hidden text-xs text-[hsl(var(--muted-foreground))] sm:block">{String(index + 1).padStart(2, "0")}</span>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><CalendarDays size={17} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{formatDate(session.startedAt)}</span>
        <span className="mt-1 block truncate text-xs text-[hsl(var(--muted-foreground))]">
          {session.players.length} players · {session.hands.length} hands · {settled}/{session.players.length} settled
          {settled === session.players.length && rec.difference !== 0 ? <span className="text-[hsl(var(--destructive))]"> · off by {inr(Math.abs(rec.difference))}</span> : null}
          {top && topNet !== null && topNet > 0 ? ` · ${top.name} ${signedInr(topNet)}` : ""}
        </span>
      </span>
      <span className="hidden text-right sm:block"><span className="eyebrow block">House</span><span className="mono-font mt-1 block text-sm">{inr(hostTotal(session))}</span></span>
      <ChevronRight size={17} className="shrink-0 text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-1" />
    </button>
  );
}

function PastDetail({ session, canReopen, onBack, onDelete, onReopen }: { session: Session; canReopen: boolean; onBack: () => void; onDelete: () => void; onReopen: () => void }) {
  const ranked = [...session.players].sort((a, b) => (playerNet(b) ?? -Infinity) - (playerNet(a) ?? -Infinity));
  return (
    <div className="animate-rise">
      <button className="btn btn-ghost !-ml-3 mb-6 !px-3" onClick={onBack} data-testid="button-back-history"><ChevronLeft size={15} /> Back to sessions</button>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="eyebrow mb-3">Session record</div>
          <h1 className="display-font text-[clamp(2.4rem,7vw,3.8rem)] leading-none tracking-[-.05em]">{formatDate(session.startedAt)}.</h1>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><Clock3 size={14} /> {formatTime(session.startedAt)} – {session.endedAt ? formatTime(session.endedAt) : "now"} · {formatDuration(session.startedAt, session.endedAt)} · {sessionDetails(session)}</p>
        </div>
        <div className="flex gap-2">
          {canReopen ? <button className="btn btn-soft flex-1 sm:flex-none" onClick={onReopen} data-testid="button-reopen-session"><RotateCcw size={15} /> Reopen</button> : null}
          <button className="btn btn-danger flex-1 sm:flex-none" onClick={onDelete} data-testid="button-delete-session"><Trash2 size={15} /> Delete</button>
        </div>
      </div>
      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Hands" value={String(session.hands.length)} icon={<Hand size={17} />} />
        <StatCard label="House fees" value={inr(hostTotal(session))} icon={<IndianRupee size={17} />} accent />
        <StatCard label="Players" value={String(session.players.length)} detail={`${session.players.filter((p) => p.cashOut !== null).length} settled`} icon={<Users size={17} />} />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[.85fr_1.15fr]">
        <div className="space-y-6">
          <section className="surface p-5 sm:p-6">
            <div className="eyebrow">Final results</div>
            <h2 className="mt-1 text-lg font-bold">Who won, who lost</h2>
            <div className="mt-4">{ranked.map((p) => <PastPlayerRow key={p.id} player={p} />)}</div>
          </section>
          <section className="surface space-y-4 p-5 sm:p-6">
            <ReconcileBar session={session} />
            <SettleUp session={session} />
          </section>
        </div>
        <section className="surface overflow-hidden">
          <div className="border-b border-[hsl(var(--border))] p-5 sm:p-6"><div className="eyebrow">Complete record</div><h2 className="mt-1 text-lg font-bold">Hand log</h2></div>
          {session.hands.length ? <div>{[...session.hands].reverse().map((h) => <HandRow key={h.id} hand={h} players={session.players} />)}</div> : <EmptyState icon={<Hand size={19} />} title="No hands logged" body="This session only tracked money." />}
        </section>
      </div>
    </div>
  );
}

function PastPlayerRow({ player }: { player: Player }) {
  const buyIns = totalBuyIns(player);
  const net = playerNet(player);
  return (
    <div className="flex items-center gap-3 border-b border-[hsl(var(--border))] py-3 last:border-0">
      <PlayerDot name={player.name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{player.name}</div>
        <div className="text-xs text-[hsl(var(--muted-foreground))]">{inr(buyIns)} in · {player.cashOut === null ? "cash-out missing" : `${inr(player.cashOut)} out`}</div>
      </div>
      <div className={`mono-font text-sm ${net === null ? "text-[hsl(var(--muted-foreground))]" : net < 0 ? "text-[hsl(var(--destructive))]" : "text-[hsl(var(--success))]"}`}>{net === null ? "—" : signedInr(net)}</div>
    </div>
  );
}
