import { useState } from "react";
import { Minus, Plus, Settings2, Trash2, X } from "lucide-react";
import { DEFAULT_CHIPS, chipTotal, inr, uid, type ChipDenom } from "../poker";
import { Modal, MoneyInput } from "./bits";

/**
 * Count a stack by colour: tap +/− (or type) per chip colour, get the rupee
 * value, and use it as the cash-out. Chip values are saved on the session.
 */
export function ChipCounter({
  playerName,
  chips: initialChips,
  onSaveChips,
  onApply,
  onClose,
}: {
  playerName: string;
  chips: ChipDenom[] | null;
  onSaveChips: (chips: ChipDenom[]) => void;
  onApply: (total: number) => void;
  onClose: () => void;
}) {
  const [chips, setChips] = useState<ChipDenom[]>(initialChips ?? DEFAULT_CHIPS);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(!initialChips);
  const total = chipTotal(chips, counts);

  const bump = (id: string, delta: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + delta) }));
  const updateChip = (id: string, patch: Partial<ChipDenom>) => setChips((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const apply = () => {
    const clean = chips.filter((c) => c.value > 0);
    onSaveChips(clean);
    onApply(total);
  };

  return (
    <Modal onClose={onClose} labelledBy="chip-counter-title">
      <div className="p-5 sm:p-6" data-testid="chip-counter">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <div className="eyebrow">Count chips</div>
            <h2 id="chip-counter-title" className="mt-1 text-lg font-bold">{playerName}'s stack</h2>
          </div>
          <div className="flex gap-1">
            <button className={`btn btn-ghost !p-2 ${editing ? "!text-[hsl(var(--accent))]" : ""}`} onClick={() => setEditing((e) => !e)} aria-label="Edit chip values" aria-pressed={editing} data-testid="button-edit-chips"><Settings2 size={16} /></button>
            <button className="btn btn-ghost !p-2" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
        </div>

        {editing ? <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">Set what each colour is worth at your table. This is remembered for next time.</p> : null}

        <div className="space-y-2">
          {chips.map((chip) => (
            <div key={chip.id} className="flex items-center gap-2.5 rounded-xl bg-[hsl(var(--secondary)/.5)] p-2">
              {editing ? (
                <input type="color" className="h-9 w-9 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0" value={chip.color} onChange={(e) => updateChip(chip.id, { color: e.target.value })} aria-label={`${chip.name} colour`} />
              ) : (
                <span className="chip-swatch" style={{ background: chip.color }} aria-hidden="true" />
              )}
              {editing ? (
                <>
                  <input className="field !w-24 !py-2 !text-sm" value={chip.name} maxLength={12} onChange={(e) => updateChip(chip.id, { name: e.target.value })} aria-label="Chip name" />
                  <div className="w-24"><MoneyInput id={`chip-val-${chip.id}`} label={`${chip.name} value`} value={chip.value ? String(chip.value) : ""} onChange={(v) => updateChip(chip.id, { value: Number(v) || 0 })} size="sm" /></div>
                  <button className="btn btn-ghost ml-auto !p-2" onClick={() => setChips((c) => c.filter((x) => x.id !== chip.id))} aria-label={`Remove ${chip.name}`}><Trash2 size={14} /></button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{chip.name}</div>
                    <div className="mono-font text-[11px] text-[hsl(var(--muted-foreground))]">{inr(chip.value)} each</div>
                  </div>
                  <button className="count-btn" onClick={() => bump(chip.id, -1)} aria-label={`One fewer ${chip.name}`}><Minus size={16} /></button>
                  <input
                    className="field mono-font !w-14 !px-1 !py-2 text-center"
                    inputMode="numeric"
                    value={counts[chip.id] ?? ""}
                    placeholder="0"
                    onChange={(e) => setCounts((c) => ({ ...c, [chip.id]: Number(e.target.value.replace(/\D/g, "")) || 0 }))}
                    aria-label={`${chip.name} count`}
                    data-testid={`input-chip-count-${chip.name.toLowerCase()}`}
                  />
                  <button className="count-btn" onClick={() => bump(chip.id, 1)} aria-label={`One more ${chip.name}`} data-testid={`button-chip-plus-${chip.name.toLowerCase()}`}><Plus size={16} /></button>
                </>
              )}
            </div>
          ))}
        </div>
        {editing ? (
          <button className="btn btn-ghost mt-2 !px-2 !text-xs" onClick={() => setChips((c) => [...c, { id: uid("chip"), name: "New", color: "#3b6fb6", value: 0 }])}><Plus size={13} /> Add a colour</button>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Stack value</div>
            <div className="stat-number !text-3xl" data-testid="text-chip-total">{inr(total)}</div>
          </div>
          <button className="btn btn-primary" disabled={editing ? false : total === 0} onClick={editing ? () => setEditing(false) : apply} data-testid="button-chip-apply">
            {editing ? "Done" : "Use as cash-out"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
