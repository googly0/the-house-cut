import { describe, expect, it } from "vitest";
import {
  blindSeats,
  buildPots,
  normalizeSessions,
  parseBoard,
  reconcile,
  replayHand,
  settlementTransfers,
  splitEvenly,
  trackedResults,
  type HandAction,
  type HandContext,
  type Session,
} from "../src/poker";

let n = 0;
const act = (street: HandAction["street"], playerId: string, action: HandAction["action"], amount: number | null = null): HandAction => ({
  id: `a${n++}`,
  street,
  playerId,
  action,
  amount,
});

const ctx: HandContext = { playerIds: ["a", "b", "c", "d"], dealerId: "a", smallBlind: 10, bigBlind: 20, ante: null };

describe("blinds", () => {
  it("posts SB/BB left of the button", () => {
    expect(blindSeats(ctx)).toEqual({ sb: "b", bb: "c" });
  });
  it("heads-up: button is the small blind", () => {
    expect(blindSeats({ ...ctx, playerIds: ["a", "b"] })).toEqual({ sb: "a", bb: "b" });
  });
});

describe("betting replay + side pots", () => {
  it("builds main and side pots from all-ins", () => {
    const r = replayHand(
      [
        act("Pre-flop", "d", "Raise", 60),
        act("Pre-flop", "a", "Fold"),
        act("Pre-flop", "b", "Call"),
        act("Pre-flop", "c", "All-in", 200),
        act("Pre-flop", "d", "Call"),
        act("Pre-flop", "b", "All-in", 100),
      ],
      ctx,
    );
    expect(r.issues).toEqual([]);
    expect(r.contributions).toEqual({ a: 0, b: 100, c: 200, d: 200 });
    expect(buildPots(r.contributions, r.folded)).toEqual({
      pots: [
        { amount: 300, eligibleIds: ["b", "c", "d"] },
        { amount: 200, eligibleIds: ["c", "d"] },
      ],
      returned: null,
    });
  });

  it("returns an uncalled raise when everyone folds", () => {
    const r = replayHand([act("Pre-flop", "d", "Raise", 100), act("Pre-flop", "a", "Fold"), act("Pre-flop", "b", "Fold"), act("Pre-flop", "c", "Fold")], ctx);
    expect(buildPots(r.contributions, r.folded)).toEqual({
      pots: [{ amount: 50, eligibleIds: ["d"] }],
      returned: { playerId: "d", amount: 80 },
    });
  });

  it("returns the excess when a big stack over-shoves a short all-in", () => {
    const r = replayHand([act("Pre-flop", "d", "Fold"), act("Pre-flop", "a", "Fold"), act("Pre-flop", "b", "All-in", 100), act("Pre-flop", "c", "All-in", 500)], ctx);
    expect(buildPots(r.contributions, r.folded)).toEqual({
      pots: [{ amount: 200, eligibleIds: ["b", "c"] }],
      returned: { playerId: "c", amount: 400 },
    });
  });

  it("flags checking into a bet", () => {
    const r = replayHand([act("Flop", "b", "Bet", 50), act("Flop", "c", "Check")], ctx);
    expect(r.issues).toHaveLength(1);
  });

  it("adds antes for everyone dealt in", () => {
    const r = replayHand([], { ...ctx, ante: 5 });
    expect(r.contributions).toEqual({ a: 5, b: 15, c: 25, d: 5 });
  });
});

describe("splits", () => {
  it("gives the odd rupee to the earliest seat", () => {
    expect(splitEvenly(101, ["c", "a"], ["a", "b", "c"])).toEqual({ a: 51, c: 50 });
  });
});

describe("settlement", () => {
  const session: Session = {
    id: "s",
    version: 2,
    startedAt: new Date().toISOString(),
    endedAt: null,
    feePerHand: 20,
    defaultBuyIn: null,
    gameVariant: "Texas Hold'em",
    smallBlind: null,
    bigBlind: null,
    ante: null,
    players: [
      { id: "a", name: "A", buyIns: [500], cashOut: 1700, sittingOut: false },
      { id: "b", name: "B", buyIns: [500, 500], cashOut: 0, sittingOut: false },
      { id: "c", name: "C", buyIns: [500], cashOut: 260, sittingOut: false },
    ],
    hands: [1, 2].map((i) => ({ id: `h${i}`, number: i, loggedAt: "", fee: 20, note: null, dealerPlayerId: null, board: [], actions: [], pots: [], contributions: {} })),
  };

  it("reconciles buy-ins against cash-outs and fees", () => {
    expect(reconcile(session).difference).toBe(0);
  });

  it("produces transfers that square every balance", () => {
    const balance: Record<string, number> = {};
    for (const t of settlementTransfers(session)) {
      balance[t.from] = (balance[t.from] ?? 0) - t.amount;
      balance[t.to] = (balance[t.to] ?? 0) + t.amount;
    }
    expect(balance).toEqual({ a: 1200, b: -1000, c: -240, __house__: 40 });
  });
});

describe("data", () => {
  it("parses free-text boards", () => {
    expect(parseBoard("A♠ K♦ 7♣ | J♥ | 10♦")).toEqual(["As", "Kd", "7c", "Jh", "Td"]);
  });

  it("migrates v1 data and keeps only one live session", () => {
    const m = normalizeSessions([
      { id: "x", startedAt: "2026-09-01T10:00:00Z", endedAt: null, hands: [{ id: "h", winnerPlayerId: "p", potAmount: 300 }], players: [{ id: "p", name: "P", buyIns: [100], cashOut: null }] },
      { id: "y", startedAt: "2026-09-02T10:00:00Z", endedAt: null },
    ]);
    expect(m[0].endedAt).not.toBeNull();
    expect(m[1].endedAt).toBeNull();
    expect(m[0].hands[0].pots[0].awards[0].amount).toBe(300);
    expect(m[0].hands[0].fee).toBe(20);
  });
});

describe("live tracking", () => {
  it("moves money from payers to the winner, net of the house fee", () => {
    const s: Session = {
      id: "t", version: 2, startedAt: new Date().toISOString(), endedAt: null, feePerHand: 20, defaultBuyIn: 500,
      gameVariant: "Texas Hold'em", smallBlind: null, bigBlind: null, ante: null,
      players: ["a", "b", "c"].map((id) => ({ id, name: id.toUpperCase(), buyIns: [500], cashOut: null, sittingOut: false })),
      hands: [
        // a, b, c each put in 100; pot 300; fee 20; a wins 280
        { id: "h1", number: 1, loggedAt: "", fee: 20, note: null, dealerPlayerId: null, board: [], actions: [],
          pots: [{ id: "p", label: "Main pot", amount: 300, eligibleIds: [], awards: [{ playerId: "a", amount: 280 }] }],
          contributions: { a: 100, b: 100, c: 100 } },
        // legacy hand: winner but no contributions -> untracked
        { id: "h2", number: 2, loggedAt: "", fee: 20, note: null, dealerPlayerId: null, board: [], actions: [],
          pots: [{ id: "q", label: "Main pot", amount: 200, eligibleIds: [], awards: [{ playerId: "b", amount: 180 }] }],
          contributions: {} },
      ],
    };
    const { byPlayer, untracked } = trackedResults(s);
    expect(byPlayer.a.net).toBe(180);
    expect(byPlayer.b.net).toBe(-100);
    expect(byPlayer.c.stack).toBe(400);
    expect(untracked).toBe(1);
    // stacks + fees of tracked hands == buy-ins
    const stacks = Object.values(byPlayer).reduce((x, r) => x + r.stack, 0);
    expect(stacks + 20).toBe(1500);
  });
});
