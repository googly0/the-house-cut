import { useState } from "react";
import { X } from "lucide-react";
import { RANKS, SUITS, SUIT_SYMBOL, boardStreetLabel } from "../poker";
import { PlayingCard } from "./bits";

/**
 * Two-tap card entry that works on a phone: tap a rank, then a suit.
 * Duplicate cards are impossible.
 */
export function CardPicker({ cards, onChange, max = 5 }: { cards: string[]; onChange: (cards: string[]) => void; max?: number }) {
  const [rank, setRank] = useState<string | null>(null);
  const full = cards.length >= max;

  const pickSuit = (suit: string) => {
    if (!rank) return;
    const code = `${rank}${suit}`;
    if (cards.includes(code) || full) return;
    onChange([...cards, code]);
    setRank(null);
  };

  return (
    <div data-testid="card-picker">
      <div className="mb-3 flex min-h-[46px] flex-wrap items-center gap-1.5">
        {Array.from({ length: max }).map((_, i) => {
          const code = cards[i];
          return code ? (
            <button
              key={code}
              className="group relative"
              onClick={() => onChange(cards.filter((c) => c !== code))}
              aria-label={`Remove card ${i + 1}`}
              data-testid={`button-board-card-${i}`}
            >
              <PlayingCard code={code} />
              <span className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 place-items-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] group-hover:grid"><X size={10} /></span>
            </button>
          ) : (
            <span key={`slot-${i}`} className={`card-slot ${i === 3 || i === 4 ? "ml-1.5" : ""}`} aria-hidden="true" />
          );
        })}
        <span className="ml-auto text-[11px] text-[hsl(var(--muted-foreground))]">{boardStreetLabel(cards.length)}</span>
      </div>

      {!full ? (
        <>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Rank">
            {RANKS.map((r) => (
              <button
                key={r}
                className={`chip-btn mono-font !min-w-[34px] !px-0 ${rank === r ? "is-on" : ""}`}
                onClick={() => setRank(rank === r ? null : r)}
                aria-pressed={rank === r}
                data-testid={`button-rank-${r}`}
              >
                {r === "T" ? "10" : r}
              </button>
            ))}
          </div>
          <div className={`mt-2 flex gap-1.5 transition-opacity ${rank ? "" : "pointer-events-none opacity-40"}`} role="group" aria-label="Suit">
            {SUITS.map((s) => {
              const taken = rank ? cards.includes(`${rank}${s}`) : false;
              return (
                <button
                  key={s}
                  className={`chip-btn flex-1 !text-lg ${s === "h" || s === "d" ? "text-[hsl(var(--suit-red))]" : ""}`}
                  disabled={!rank || taken}
                  onClick={() => pickSuit(s)}
                  aria-label={{ s: "Spades", h: "Hearts", d: "Diamonds", c: "Clubs" }[s]}
                  data-testid={`button-suit-${s}`}
                >
                  {SUIT_SYMBOL[s]}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">{rank ? `Now the suit for ${rank === "T" ? "10" : rank}.` : "Tap a rank, then a suit. Tap a card to remove it."}</p>
        </>
      ) : null}
    </div>
  );
}
