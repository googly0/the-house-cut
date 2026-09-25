/* ──────────────────────────────────────────────────────────────────────────
 * Poker domain model + pure logic. No React in here, so it can be unit-tested.
 * All money is whole rupees (integers).
 * ────────────────────────────────────────────────────────────────────────── */

export const GAME_VARIANTS = [
  "Texas Hold'em",
  "Omaha",
  "Seven-card stud",
  "Other",
] as const;

export type GameVariant = (typeof GAME_VARIANTS)[number];
export type Street = "Pre-flop" | "Flop" | "Turn" | "River";
export type BettingAction = "Fold" | "Check" | "Call" | "Bet" | "Raise" | "All-in";

export const STREETS: Street[] = ["Pre-flop", "Flop", "Turn", "River"];
export const ACTIONS: BettingAction[] = ["Fold", "Check", "Call", "Bet", "Raise", "All-in"];

export const SCHEMA_VERSION = 2;

export type Player = {
  id: string;
  name: string;
  buyIns: number[];
  cashOut: number | null;
  /** Sitting out players are not dealt in (no blinds, not in action lists). */
  sittingOut: boolean;
};

/**
 * `amount` is the player's TOTAL commitment on that street after the action
 * ("raise to ₹200"), not the increment. Calls store the computed call-to level.
 */
export type HandAction = {
  id: string;
  street: Street;
  playerId: string;
  action: BettingAction;
  amount: number | null;
};

export type PotAward = { playerId: string; amount: number | null };

export type PotResult = {
  id: string;
  label: string;
  /** Gross pot size, before the house fee is taken. */
  amount: number | null;
  /** Players who can win this pot (from auto side-pot calc). Empty = anyone. */
  eligibleIds: string[];
  awards: PotAward[];
};

export type HandRecord = {
  id: string;
  number: number;
  loggedAt: string;
  /** House fee taken on this hand (0 for a misdeal / walk). */
  fee: number;
  note: string | null;
  dealerPlayerId: string | null;
  /** Card codes like "As", "Td", "7c". */
  board: string[];
  actions: HandAction[];
  pots: PotResult[];
  /**
   * What each player put into this hand (after any uncalled bet came back).
   * Empty = not tracked for this hand. Winners' net = award − their own contribution.
   */
  contributions: Record<string, number>;
};

export type Session = {
  id: string;
  version: number;
  startedAt: string;
  endedAt: string | null;
  feePerHand: number;
  defaultBuyIn: number | null;
  gameVariant: GameVariant;
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
  hands: HandRecord[];
  players: Player[];
  /** Chip colours → rupee values, used by the chip counter. */
  chipSet: ChipDenom[] | null;
};

export type SessionSetup = Pick<
  Session,
  "gameVariant" | "smallBlind" | "bigBlind" | "ante" | "feePerHand" | "defaultBuyIn"
>;

/* ── ids & money ─────────────────────────────────────────────────────────── */

export function uid(prefix: string) {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

const rupeeNumber = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function inr(value: number) {
  const sign = value < 0 ? "−" : "";
  return `${sign}₹${rupeeNumber.format(Math.abs(Math.round(value)))}`;
}

/** Signed version for results: +₹500 / −₹500 / ₹0 */
export function signedInr(value: number) {
  if (value > 0) return `+${inr(value)}`;
  return inr(value);
}

/** Parse a user-typed amount. Blank → null, garbage/negative → null. */
export function parseAmount(value: string): number | null {
  const trimmed = value.trim().replace(/[,₹\s]/g, "");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/* ── cards ───────────────────────────────────────────────────────────────── */

export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
export const SUITS = ["s", "h", "d", "c"] as const;
export const SUIT_SYMBOL: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

export function cardLabel(code: string) {
  const rank = code[0] === "T" ? "10" : code[0];
  return `${rank}${SUIT_SYMBOL[code[1]] ?? "?"}`;
}

export function isRedCard(code: string) {
  return code[1] === "h" || code[1] === "d";
}

/** Tolerant parser for legacy free-text boards: "A♠ K♦ 7♣ | J♥ | 2♦", "As Kd 7c". */
export function parseBoard(text: string): string[] {
  const symbolToSuit: Record<string, string> = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };
  const cards: string[] = [];
  const re = /(10|[2-9TJQKA])\s*([♠♥♦♣shdc])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const rank = m[1] === "10" ? "T" : m[1].toUpperCase();
    const suitRaw = m[2];
    const suit = symbolToSuit[suitRaw] ?? suitRaw.toLowerCase();
    const code = `${rank}${suit}`;
    if (!cards.includes(code)) cards.push(code);
  }
  return cards.slice(0, 5);
}

export function boardStreetLabel(count: number) {
  if (count === 0) return "No board";
  if (count <= 3) return "Flop";
  if (count === 4) return "Turn";
  return "River";
}

/* ── player / session helpers ────────────────────────────────────────────── */

export function totalBuyIns(player: Player) {
  return player.buyIns.reduce((sum, amount) => sum + amount, 0);
}

export function playerNet(player: Player): number | null {
  return player.cashOut === null ? null : player.cashOut - totalBuyIns(player);
}

export function handPotTotal(hand: HandRecord): number | null {
  if (!hand.pots.length) return null;
  if (hand.pots.some((pot) => pot.amount === null)) return null;
  return hand.pots.reduce((sum, pot) => sum + (pot.amount ?? 0), 0);
}

export function hostTotal(session: Session) {
  return session.hands.reduce((sum, hand) => sum + hand.fee, 0);
}

export function handPaidTotal(hand: HandRecord) {
  return Object.values(hand.contributions).reduce((sum, v) => sum + v, 0);
}

export type TrackedResult = {
  paid: number;
  won: number;
  /** won − paid across hands where money was tracked. */
  net: number;
  /** Chips they should have now: buy-ins + net. */
  stack: number;
};

/**
 * Hand-by-hand running results. Only hands with contributions recorded move
 * money; a hand with a winner but no "who paid in" is counted in `untracked`.
 */
export function trackedResults(session: Session): { byPlayer: Record<string, TrackedResult>; untracked: number } {
  const byPlayer: Record<string, TrackedResult> = {};
  for (const p of session.players) byPlayer[p.id] = { paid: 0, won: 0, net: 0, stack: totalBuyIns(p) };
  let untracked = 0;
  for (const hand of session.hands) {
    if (!Object.keys(hand.contributions).length) {
      if (hand.pots.some((pot) => pot.awards.length)) untracked++;
      continue;
    }
    for (const [id, amount] of Object.entries(hand.contributions)) {
      if (byPlayer[id]) byPlayer[id].paid += amount;
    }
    for (const pot of hand.pots) {
      for (const award of pot.awards) {
        if (byPlayer[award.playerId]) byPlayer[award.playerId].won += award.amount ?? 0;
      }
    }
  }
  for (const r of Object.values(byPlayer)) {
    r.net = r.won - r.paid;
    r.stack += r.net;
  }
  return { byPlayer, untracked };
}

export function handWinnerIds(hand: HandRecord): string[] {
  return [...new Set(hand.pots.flatMap((pot) => pot.awards.map((a) => a.playerId)))];
}

export function sessionDetails(session: Pick<Session, "gameVariant" | "smallBlind" | "bigBlind" | "ante">) {
  const blinds =
    session.smallBlind !== null && session.bigBlind !== null
      ? `${inr(session.smallBlind)}/${inr(session.bigBlind)}`
      : "No blinds set";
  const ante = session.ante ? ` · ${inr(session.ante)} ante` : "";
  return `${session.gameVariant} · ${blinds}${ante}`;
}

export function dealtInIds(session: Session) {
  return session.players.filter((p) => !p.sittingOut).map((p) => p.id);
}

/** Button moves one seat left each hand among players who are dealt in. */
export function nextDealerId(session: Session): string | null {
  const ids = dealtInIds(session);
  if (!ids.length) return null;
  const last = [...session.hands].reverse().find((h) => h.dealerPlayerId)?.dealerPlayerId;
  if (!last) return ids[0];
  const seatOrder = session.players.map((p) => p.id);
  const start = seatOrder.indexOf(last);
  for (let step = 1; step <= seatOrder.length; step++) {
    const candidate = seatOrder[(start + step) % seatOrder.length];
    if (ids.includes(candidate)) return candidate;
  }
  return ids[0];
}

/* ── betting engine ──────────────────────────────────────────────────────── */

export type HandContext = {
  /** Dealt-in players in seat order. */
  playerIds: string[];
  dealerId: string | null;
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
};

export function blindSeats(ctx: HandContext): { sb: string | null; bb: string | null } {
  const n = ctx.playerIds.length;
  const d = ctx.dealerId ? ctx.playerIds.indexOf(ctx.dealerId) : -1;
  if (n < 2 || d < 0) return { sb: null, bb: null };
  if (n === 2) return { sb: ctx.playerIds[d], bb: ctx.playerIds[(d + 1) % n] };
  return { sb: ctx.playerIds[(d + 1) % n], bb: ctx.playerIds[(d + 2) % n] };
}

export type ActionIssue = { actionId: string; message: string };

export type ReplayResult = {
  /** Total chips each player put in this hand (antes + blinds + bets). */
  contributions: Record<string, number>;
  folded: Set<string>;
  allIn: Set<string>;
  issues: ActionIssue[];
  /** State of the street the NEXT action would be on. */
  street: Street;
  currentBet: number;
  streetCommit: Record<string, number>;
};

function streetStart(street: Street, ctx: HandContext) {
  const commit: Record<string, number> = {};
  let currentBet = 0;
  if (street === "Pre-flop") {
    const { sb, bb } = blindSeats(ctx);
    if (sb && ctx.smallBlind) commit[sb] = ctx.smallBlind;
    if (bb && ctx.bigBlind) commit[bb] = ctx.bigBlind;
    currentBet = Math.max(0, ...Object.values(commit));
  }
  return { commit, currentBet };
}

/**
 * Replays the logged actions. `upToStreet` lets the editor ask "what does the
 * table look like if I add an action on the Turn now?".
 */
export function replayHand(actions: HandAction[], ctx: HandContext, upToStreet?: Street): ReplayResult {
  const contributions: Record<string, number> = {};
  for (const id of ctx.playerIds) contributions[id] = ctx.ante ?? 0;
  const folded = new Set<string>();
  const allIn = new Set<string>();
  const issues: ActionIssue[] = [];

  let streetIndex = 0;
  let { commit, currentBet } = streetStart("Pre-flop", ctx);

  const closeStreet = () => {
    for (const [id, amount] of Object.entries(commit)) {
      contributions[id] = (contributions[id] ?? 0) + amount;
    }
  };

  const advanceTo = (target: number) => {
    while (streetIndex < target) {
      closeStreet();
      streetIndex++;
      ({ commit, currentBet } = streetStart(STREETS[streetIndex], ctx));
    }
  };

  for (const a of actions) {
    const idx = STREETS.indexOf(a.street);
    if (idx < streetIndex) {
      issues.push({ actionId: a.id, message: `${a.street} action logged after a later street.` });
      continue;
    }
    advanceTo(idx);
    const p = a.playerId;
    if (folded.has(p)) { issues.push({ actionId: a.id, message: "Player already folded." }); continue; }
    if (allIn.has(p)) { issues.push({ actionId: a.id, message: "Player is already all-in." }); continue; }
    const mine = commit[p] ?? 0;
    switch (a.action) {
      case "Fold":
        folded.add(p);
        break;
      case "Check":
        if (mine < currentBet) issues.push({ actionId: a.id, message: `Can't check facing ${inr(currentBet)}.` });
        break;
      case "Call":
        if (currentBet <= mine) issues.push({ actionId: a.id, message: "Nothing to call — that's a check." });
        commit[p] = Math.max(mine, currentBet);
        break;
      case "Bet":
      case "Raise":
      case "All-in": {
        const to = a.amount ?? 0;
        if (a.action === "Bet" && currentBet > 0 && !(a.street === "Pre-flop" && currentBet === (ctx.bigBlind ?? 0))) {
          issues.push({ actionId: a.id, message: `There's already a bet of ${inr(currentBet)} — use Raise.` });
        }
        if (a.action === "Raise" && to <= currentBet) {
          issues.push({ actionId: a.id, message: `Raise must be above ${inr(currentBet)}.` });
        }
        if (to < mine) {
          issues.push({ actionId: a.id, message: `Amount is below what they already put in (${inr(mine)}).` });
        }
        commit[p] = Math.max(mine, to);
        currentBet = Math.max(currentBet, commit[p]);
        if (a.action === "All-in") allIn.add(p);
        break;
      }
    }
  }

  if (upToStreet) advanceTo(Math.max(streetIndex, STREETS.indexOf(upToStreet)));
  const liveCommit = { ...commit };
  closeStreet();

  return {
    contributions,
    folded,
    allIn,
    issues,
    street: STREETS[streetIndex],
    currentBet,
    streetCommit: liveCommit,
  };
}

/* ── side pots ───────────────────────────────────────────────────────────── */

export type ComputedPot = { amount: number; eligibleIds: string[] };

export function buildPots(
  contributions: Record<string, number>,
  folded: Set<string>,
): { pots: ComputedPot[]; returned: { playerId: string; amount: number } | null } {
  contributions = { ...contributions };
  const ids = Object.keys(contributions);
  const live = ids.filter((id) => !folded.has(id));

  // Uncalled bet: the top live stack's excess over everyone else goes back.
  let returned: { playerId: string; amount: number } | null = null;
  const topLive = [...live].sort((a, b) => contributions[b] - contributions[a])[0];
  if (topLive) {
    const secondHighest = Math.max(0, ...ids.filter((id) => id !== topLive).map((id) => contributions[id]));
    const excess = contributions[topLive] - secondHighest;
    if (excess > 0) {
      returned = { playerId: topLive, amount: excess };
      contributions[topLive] = secondHighest;
    }
  }

  const total = ids.reduce((s, id) => s + contributions[id], 0);
  if (total === 0) return { pots: [], returned };

  const levels = [...new Set(live.map((id) => contributions[id]).filter((v) => v > 0))].sort((a, b) => a - b);
  if (!levels.length) return { pots: [{ amount: total, eligibleIds: live }], returned };

  const pots: ComputedPot[] = [];
  let prev = 0;
  for (const level of levels) {
    const amount = ids.reduce(
      (s, id) => s + Math.min(contributions[id], level) - Math.min(contributions[id], prev),
      0,
    );
    const eligibleIds = live.filter((id) => contributions[id] >= level);
    const last = pots[pots.length - 1];
    if (last && last.eligibleIds.length === eligibleIds.length && last.eligibleIds.every((id) => eligibleIds.includes(id))) {
      last.amount += amount;
    } else {
      pots.push({ amount, eligibleIds });
    }
    prev = level;
  }
  // Chips from folded players above the top live level (shouldn't normally happen).
  const overflow = ids.reduce((s, id) => s + Math.max(0, contributions[id] - prev), 0);
  if (overflow) pots[pots.length - 1].amount += overflow;
  return { pots, returned };
}

/** Even split with odd chips going to the earliest winners in seat order. */
export function splitEvenly(amount: number, winnerIds: string[], seatOrder: string[]): Record<string, number> {
  if (!winnerIds.length) return {};
  const ordered = [...winnerIds].sort((a, b) => seatOrder.indexOf(a) - seatOrder.indexOf(b));
  const base = Math.floor(amount / ordered.length);
  const remainder = amount - base * ordered.length;
  return Object.fromEntries(ordered.map((id, i) => [id, base + (i < remainder ? 1 : 0)]));
}

/* ── settlement ──────────────────────────────────────────────────────────── */

export const HOUSE_ID = "__house__";

export type Reconciliation = {
  buyIns: number;
  cashOuts: number;
  fees: number;
  /** buyIns − cashOuts − fees. 0 means the chips add up. >0 = chips missing. */
  difference: number;
  unsettled: Player[];
};

export function reconcile(session: Session): Reconciliation {
  const buyIns = session.players.reduce((s, p) => s + totalBuyIns(p), 0);
  const cashOuts = session.players.reduce((s, p) => s + (p.cashOut ?? 0), 0);
  const fees = hostTotal(session);
  return {
    buyIns,
    cashOuts,
    fees,
    difference: buyIns - cashOuts - fees,
    unsettled: session.players.filter((p) => p.cashOut === null && totalBuyIns(p) > 0),
  };
}

export type Transfer = { from: string; to: string; amount: number };

/**
 * Minimum-ish set of payments so everyone ends square (greedy largest-first,
 * which is optimal or near-optimal for home-game sizes). The house collects its
 * fees like any other creditor. Only settled players take part.
 */
export function settlementTransfers(session: Session): Transfer[] {
  const balances: { id: string; amount: number }[] = [];
  for (const p of session.players) {
    const net = playerNet(p);
    if (net !== null && net !== 0) balances.push({ id: p.id, amount: net });
  }
  const fees = hostTotal(session);
  if (fees) balances.push({ id: HOUSE_ID, amount: fees });

  const creditors = balances.filter((b) => b.amount > 0).map((b) => ({ ...b }));
  const debtors = balances.filter((b) => b.amount < 0).map((b) => ({ id: b.id, amount: -b.amount }));
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return transfers;
}

export function nameOf(session: Session, id: string) {
  if (id === HOUSE_ID) return "House";
  return session.players.find((p) => p.id === id)?.name ?? "Player";
}

/* ── share text (WhatsApp-friendly) ──────────────────────────────────────── */

export function sessionShareText(session: Session) {
  const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(session.startedAt));
  const rec = reconcile(session);
  const lines: string[] = [];
  lines.push(`♠ Poker night · ${date}`);
  lines.push(`${sessionDetails(session)} · ${session.hands.length} hands`);
  if (rec.fees) lines.push(`House fee: ${inr(rec.fees)}`);
  lines.push("");
  lines.push("*Results*");
  const ranked = [...session.players].sort((a, b) => (playerNet(b) ?? -Infinity) - (playerNet(a) ?? -Infinity));
  for (const p of ranked) {
    const net = playerNet(p);
    lines.push(`${net === null ? "not settled" : signedInr(net)}  ${p.name}  (in ${inr(totalBuyIns(p))})`);
  }
  const transfers = settlementTransfers(session);
  if (transfers.length) {
    lines.push("");
    lines.push("*Settle up*");
    for (const t of transfers) lines.push(`${nameOf(session, t.from)} → ${nameOf(session, t.to)}: ${inr(t.amount)}`);
  }
  if (rec.difference !== 0) {
    lines.push("");
    lines.push(`⚠ Chips don't add up: ${inr(Math.abs(rec.difference))} ${rec.difference > 0 ? "missing" : "extra"}.`);
  }
  return lines.join("\n");
}

/* ── lifetime stats ──────────────────────────────────────────────────────── */

export type PlayerStats = {
  key: string;
  name: string;
  sessions: number;
  net: number;
  bestNight: number;
  worstNight: number;
  handsWon: number;
  potsWon: number;
};

export function lifetimeStats(sessions: Session[]): PlayerStats[] {
  const map = new Map<string, PlayerStats>();
  for (const s of sessions) {
    if (!s.endedAt) continue;
    for (const p of s.players) {
      const key = p.name.trim().toLowerCase();
      const row = map.get(key) ?? { key, name: p.name.trim(), sessions: 0, net: 0, bestNight: 0, worstNight: 0, handsWon: 0, potsWon: 0 };
      row.sessions++;
      const net = playerNet(p);
      if (net !== null) {
        row.net += net;
        row.bestNight = Math.max(row.bestNight, net);
        row.worstNight = Math.min(row.worstNight, net);
      }
      for (const h of s.hands) {
        let wonHand = false;
        for (const pot of h.pots) {
          const award = pot.awards.find((a) => a.playerId === p.id);
          if (award) { wonHand = true; row.potsWon += award.amount ?? 0; }
        }
        if (wonHand) row.handsWon++;
      }
      map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => b.net - a.net);
}

/* ── persistence normalisation / migration ───────────────────────────────── */

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function validVariant(value: unknown): value is GameVariant {
  return typeof value === "string" && (GAME_VARIANTS as readonly string[]).includes(value);
}

function normalizePlayer(value: Record<string, unknown>): Player {
  return {
    id: str(value.id) ?? uid("player"),
    name: (str(value.name) ?? "Player").trim() || "Player",
    buyIns: Array.isArray(value.buyIns) ? value.buyIns.filter((a): a is number => num(a) !== null && a >= 0) : [],
    cashOut: num(value.cashOut),
    sittingOut: value.sittingOut === true,
  };
}

function normalizeAction(value: Record<string, unknown>): HandAction | null {
  const street = str(value.street) as Street | null;
  const action = str(value.action) as BettingAction | null;
  const playerId = str(value.playerId);
  if (!street || !STREETS.includes(street) || !action || !ACTIONS.includes(action) || !playerId) return null;
  return { id: str(value.id) ?? uid("action"), street, action, playerId, amount: num(value.amount) };
}

function normalizeHand(value: Record<string, unknown>, index: number, defaultFee: number): HandRecord {
  const rawPots = Array.isArray(value.pots) ? (value.pots as Record<string, unknown>[]) : null;
  const legacyWinner = str(value.winnerPlayerId);
  const legacyPot = num(value.potAmount);
  const pots: PotResult[] = rawPots
    ? rawPots.map((pot, potIndex) => ({
        id: str(pot.id) ?? `pot-${index}-${potIndex}`,
        label: str(pot.label) ?? (potIndex === 0 ? "Main pot" : `Side pot ${potIndex}`),
        amount: num(pot.amount),
        eligibleIds: Array.isArray(pot.eligibleIds) ? pot.eligibleIds.filter((x): x is string => typeof x === "string") : [],
        awards: Array.isArray(pot.awards)
          ? (pot.awards as Record<string, unknown>[])
              .filter((a) => typeof a.playerId === "string")
              .map((a) => ({ playerId: a.playerId as string, amount: num(a.amount) }))
          : [],
      }))
    : legacyWinner || legacyPot !== null
      ? [{
          id: `legacy-pot-${index}`,
          label: "Main pot",
          amount: legacyPot,
          eligibleIds: [],
          awards: legacyWinner ? [{ playerId: legacyWinner, amount: legacyPot }] : [],
        }]
      : [];

  const rawBoard = value.board;
  const board = Array.isArray(rawBoard)
    ? rawBoard.filter((c): c is string => typeof c === "string" && /^[AKQJT2-9][shdc]$/.test(c)).slice(0, 5)
    : typeof rawBoard === "string"
      ? parseBoard(rawBoard)
      : [];

  return {
    id: str(value.id) ?? `hand-${index}`,
    number: index + 1,
    loggedAt: str(value.loggedAt) ?? new Date().toISOString(),
    fee: num(value.fee) ?? defaultFee,
    note: str(value.note),
    dealerPlayerId: str(value.dealerPlayerId),
    board,
    actions: Array.isArray(value.actions)
      ? (value.actions as Record<string, unknown>[]).map(normalizeAction).filter((a): a is HandAction => a !== null)
      : [],
    pots,
    contributions: normalizeContributions(value.contributions),
  };
}

function normalizeContributions(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [id, amount] of Object.entries(value as Record<string, unknown>)) {
    const n = num(amount);
    if (n !== null && n > 0) out[id] = Math.round(n);
  }
  return out;
}

function normalizeChips(value: unknown): ChipDenom[] | null {
  if (!Array.isArray(value)) return null;
  const chips = value
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({ id: str(c.id) ?? uid("chip"), name: str(c.name) ?? "Chip", color: str(c.color) ?? "#888888", value: num(c.value) ?? 0 }))
    .filter((c) => c.value > 0);
  return chips.length ? chips : null;
}

export function normalizeSessions(value: unknown): Session[] {
  if (!Array.isArray(value)) return [];
  const sessions = value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((session, sessionIndex) => {
      const feePerHand = num(session.feePerHand) ?? 20;
      return {
        id: str(session.id) ?? `session-${sessionIndex}`,
        version: SCHEMA_VERSION,
        startedAt: str(session.startedAt) ?? new Date().toISOString(),
        endedAt: str(session.endedAt),
        feePerHand,
        defaultBuyIn: num(session.defaultBuyIn),
        gameVariant: validVariant(session.gameVariant) ? session.gameVariant : "Texas Hold'em",
        smallBlind: num(session.smallBlind),
        bigBlind: num(session.bigBlind),
        ante: num(session.ante),
        chipSet: normalizeChips(session.chipSet),
        players: Array.isArray(session.players) ? (session.players as Record<string, unknown>[]).map(normalizePlayer) : [],
        hands: Array.isArray(session.hands)
          ? (session.hands as Record<string, unknown>[]).map((h, i) => normalizeHand(h, i, feePerHand))
          : [],
      } satisfies Session;
    });
  // Only one live session is allowed; if data got corrupted, keep the newest live one.
  const live = sessions.filter((s) => !s.endedAt).sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
  for (const extra of live.slice(1)) extra.endedAt = extra.startedAt;
  return sessions;
}

/* ── dealer mode: guided turn order ──────────────────────────────────────── */

export type DealerPhase = "betting" | "showdown" | "folded";

export type DealerState = {
  phase: DealerPhase;
  street: Street;
  /** Whose turn it is (null when the hand is over / at showdown). */
  toAct: string | null;
  currentBet: number;
  /** Smallest legal raise-to (or bet) amount on this street. */
  minRaiseTo: number;
  /** Chips each player has in on the current street. */
  commit: Record<string, number>;
  /** Total each player has in the hand so far (antes + all streets). */
  contributions: Record<string, number>;
  folded: Set<string>;
  allIn: Set<string>;
  /** Last action each player took on the current street (for seat badges). */
  lastAction: Record<string, HandAction>;
  potTotal: number;
  /** Set when everyone else folded. */
  winnerByFold: string | null;
  /** True when betting stopped early because at most one player can still bet. */
  runout: boolean;
  /** The street each generated action should be stamped with. */
  actionStreet: Street;
};

/**
 * Walks the hand in seat order the way a dealer would. Knows who acts first
 * (left of the big blind pre-flop, left of the button after), when a betting
 * round is closed, when to deal the next street, and when the hand is over.
 */
export function dealerState(actions: HandAction[], ctx: HandContext): DealerState {
  const ids = ctx.playerIds;
  const n = ids.length;
  const seat = (i: number) => ids[((i % n) + n) % n];
  const dIdx = Math.max(0, ctx.dealerId ? ids.indexOf(ctx.dealerId) : 0);
  const bigBlind = ctx.bigBlind ?? 0;

  const contributions: Record<string, number> = {};
  for (const id of ids) contributions[id] = ctx.ante ?? 0;
  const folded = new Set<string>();
  const allIn = new Set<string>();

  let streetIdx = 0;
  let { commit, currentBet } = streetStart("Pre-flop", ctx);
  let lastRaiseSize = bigBlind;
  let acted = new Set<string>();
  let lastAction: Record<string, HandAction> = {};
  const { bb } = blindSeats(ctx);
  let pointer = bb ? ids.indexOf(bb) + 1 : dIdx + 1;
  let phase = "betting" as DealerPhase;
  let runout = false;
  let closed = false as boolean;

  const canAct = (id: string) => !folded.has(id) && !allIn.has(id);
  const live = () => ids.filter((id) => !folded.has(id));

  const roundDone = () => {
    if (live().length <= 1) return true;
    const actors = ids.filter(canAct);
    if (actors.length === 0) return true;
    if (actors.every((id) => acted.has(id) && (commit[id] ?? 0) === currentBet)) return true;
    // One player left who can bet, and they've matched everyone: nothing to bet against.
    if (actors.length === 1 && (commit[actors[0]] ?? 0) >= currentBet && ids.every((id) => id === actors[0] || folded.has(id) || allIn.has(id))) {
      return acted.has(actors[0]) || (commit[actors[0]] ?? 0) >= Math.max(0, ...ids.filter((id) => id !== actors[0]).map((id) => commit[id] ?? 0));
    }
    return false;
  };

  const closeStreet = () => {
    for (const [id, amount] of Object.entries(commit)) contributions[id] = (contributions[id] ?? 0) + amount;
    commit = {};
  };

  const settle = () => {
    // Called after every action: resolve round/street/hand transitions.
    while (phase === "betting" && roundDone()) {
      closeStreet();
      if (live().length <= 1) { phase = "folded"; closed = true; break; }
      const actors = ids.filter(canAct);
      if (streetIdx === STREETS.length - 1) { phase = "showdown"; closed = true; break; }
      if (actors.length <= 1) { phase = "showdown"; runout = true; closed = true; streetIdx = STREETS.length - 1; break; }
      streetIdx++;
      currentBet = 0;
      lastRaiseSize = bigBlind;
      acted = new Set();
      lastAction = {};
      pointer = dIdx + 1;
    }
  };

  for (const a of actions) {
    if (phase !== "betting") break;
    const p = a.playerId;
    if (!ids.includes(p) || !canAct(p)) continue;
    const mine = commit[p] ?? 0;
    switch (a.action) {
      case "Fold":
        folded.add(p);
        break;
      case "Check":
        break;
      case "Call":
        commit[p] = Math.max(mine, a.amount ?? currentBet);
        break;
      case "Bet":
      case "Raise":
      case "All-in": {
        const to = Math.max(mine, a.amount ?? 0);
        commit[p] = to;
        if (to > currentBet) {
          lastRaiseSize = Math.max(lastRaiseSize, to - currentBet);
          currentBet = to;
          acted = new Set();
        }
        if (a.action === "All-in") allIn.add(p);
        break;
      }
    }
    acted.add(p);
    lastAction[p] = a;
    pointer = ids.indexOf(p) + 1;
    settle();
  }

  let toAct: string | null = null;
  if (phase === "betting") {
    for (let k = 0; k < n; k++) {
      const id = seat(pointer + k);
      if (canAct(id) && (!acted.has(id) || (commit[id] ?? 0) < currentBet)) { toAct = id; break; }
    }
    if (!toAct) { settle(); }
  }

  const totals = { ...contributions };
  if (!closed) for (const [id, amount] of Object.entries(commit)) totals[id] = (totals[id] ?? 0) + amount;
  const potTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  const liveIds = live();

  return {
    phase,
    street: STREETS[streetIdx],
    toAct: phase === "betting" ? toAct : null,
    currentBet,
    minRaiseTo: currentBet === 0 ? Math.max(1, bigBlind) : currentBet + Math.max(1, lastRaiseSize),
    commit: closed ? {} : commit,
    contributions: totals,
    folded,
    allIn,
    lastAction,
    potTotal,
    winnerByFold: phase === "folded" && liveIds.length === 1 ? liveIds[0] : null,
    runout,
    actionStreet: STREETS[streetIdx],
  };
}

/** Pot-relative raise-to amount, rounded to the smallest sensible chip. */
export function potSizedRaiseTo(state: DealerState, playerId: string, fraction: number, step: number) {
  const toCall = Math.max(0, state.currentBet - (state.commit[playerId] ?? 0));
  const raiseBy = (state.potTotal + toCall) * fraction;
  const raw = state.currentBet + raiseBy;
  const rounded = Math.round(raw / step) * step;
  return Math.max(state.minRaiseTo, rounded);
}

/* ── chips ───────────────────────────────────────────────────────────────── */

export type ChipDenom = { id: string; name: string; color: string; value: number };

export const DEFAULT_CHIPS: ChipDenom[] = [
  { id: "chip-white", name: "White", color: "#f1ede4", value: 10 },
  { id: "chip-red", name: "Red", color: "#c0392b", value: 50 },
  { id: "chip-green", name: "Green", color: "#2f7d52", value: 100 },
  { id: "chip-black", name: "Black", color: "#222222", value: 500 },
];

export function chipTotal(chips: ChipDenom[], counts: Record<string, number>) {
  return chips.reduce((sum, c) => sum + c.value * (counts[c.id] ?? 0), 0);
}
