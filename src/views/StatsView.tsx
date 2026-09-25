import { Trophy } from "lucide-react";
import { inr, lifetimeStats, signedInr, type Session } from "../poker";
import { EmptyState, PlayerDot } from "../components/bits";

export function StatsView({ sessions }: { sessions: Session[] }) {
  const finished = sessions.filter((s) => s.endedAt);
  const rows = lifetimeStats(finished);
  const totalFees = finished.reduce((s, x) => s + x.hands.reduce((a, h) => a + h.fee, 0), 0);
  const totalHands = finished.reduce((s, x) => s + x.hands.length, 0);
  return (
    <div className="animate-rise">
      <div className="mb-8">
        <div className="eyebrow mb-3">All sessions · players matched by name</div>
        <h1 className="display-font text-[clamp(2.4rem,7vw,3.8rem)] leading-none tracking-[-.05em]">The long run.</h1>
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">{finished.length} nights · {totalHands} hands · {inr(totalFees)} in house fees</p>
      </div>
      <section className="surface overflow-hidden">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm" data-testid="table-stats">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] text-left">
                  {["#", "Player", "Nights", "Net", "Best night", "Worst night", "Hands won"].map((h, i) => (
                    <th key={h} className={`eyebrow px-4 py-3 font-normal ${i >= 2 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className="border-b border-[hsl(var(--border))] last:border-0">
                    <td className="mono-font px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{i === 0 && r.net > 0 ? <Trophy size={14} className="text-[hsl(var(--accent))]" /> : i + 1}</td>
                    <td className="px-4 py-3"><span className="flex items-center gap-2 font-bold"><PlayerDot name={r.name} size="sm" /> {r.name}</span></td>
                    <td className="mono-font px-4 py-3 text-right">{r.sessions}</td>
                    <td className={`mono-font px-4 py-3 text-right font-bold ${r.net < 0 ? "text-[hsl(var(--destructive))]" : r.net > 0 ? "text-[hsl(var(--success))]" : ""}`}>{signedInr(r.net)}</td>
                    <td className="mono-font px-4 py-3 text-right">{r.bestNight > 0 ? signedInr(r.bestNight) : "—"}</td>
                    <td className="mono-font px-4 py-3 text-right">{r.worstNight < 0 ? signedInr(r.worstNight) : "—"}</td>
                    <td className="mono-font px-4 py-3 text-right">{r.handsWon}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Trophy size={19} />} title="No finished sessions yet" body="Lifetime results show up after your first finished night." />
        )}
      </section>
    </div>
  );
}
