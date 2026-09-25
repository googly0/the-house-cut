# ♠ The House Cut

A private ledger for home poker nights. Track buy-ins and rebuys, log every hand (board, betting, side pots, split pots), check that the chips add up, and get a settle-up list with the fewest payments, ready to send on WhatsApp.

Runs entirely in the browser. No account, no server, no database.

---

## Features

| | |
|---|---|
| **Session setup** | Game (Hold'em, Omaha, Stud, other), blinds, ante, house fee per hand, standard buy-in, seat order, and a "same table as last time" button |
| **Quick hand logging** | Enter what each player put in (or "Everyone ₹100"). The pot fills itself in. Tap the winner and log it. Tap two or more names to split a pot. The odd rupee goes to the earliest seat. |
| **Live +/−** | Every hand moves money from the players who paid in to the winner(s). The ledger shows each player's running result and stack as the night goes on, and one tap cashes everyone out at their tracked stacks. |
| **Betting actions** *(optional)* | Fold / check / call / bet / raise / all-in by street. Blinds are posted automatically from the dealer button, which moves each hand. Bad actions (checking into a bet, acting after folding) get flagged. |
| **Auto side pots** | Worked out from the betting: main pot, side pots, who can win each one, and any uncalled bet returned |
| **Community cards** | Two taps per card (rank, then suit). The same card can't be picked twice. |
| **House fee** | Set per session and stored per hand. Turn it off for a misdeal or a walk. Taken out of the main pot payout. |
| **Player ledger** | One-tap standard buy-in, custom rebuys, cash-out, sit out, late joiners |
| **Chip check** | `buy-ins − cash-outs − fees = 0`. Shows a warning before you finish if it doesn't. |
| **Settle up** | Fewest transfers needed ("Ravi → Kiran ₹300"), plus copy or share to WhatsApp |
| **History & stats** | Reopen or delete past sessions, see the full hand log, and lifetime net per player |
| **Backup** | Export or import all sessions as JSON |
| **Other** | Light / dark / system theme, phone-first layout, undo for deletes |

## Where your data lives

Everything is saved in your browser's `localStorage` on the device you use.

- Data does **not** sync between devices. Your phone and laptop keep separate histories.
- Clearing browser data or using private mode **deletes it**.
- Use **History → Export backup** after each night. **Import** merges a backup back in and never overwrites other sessions.

Two tabs of the app on the same device stay in sync with each other.

## Run it locally

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine unit tests (vitest)
npm run build      # typecheck + production build → dist/
```

## Deploy

It's a static Vite app. `vercel.json` sets the build and output, SPA rewrites, long-lived caching for hashed assets, and `noindex`.

- **Vercel:** import the repo. No settings or environment variables needed.
- **Anywhere else:** run `npm run build` and serve `dist/`.

## Project layout

```
src/
  poker.ts                 All game and money logic, pure TypeScript with no React:
                           betting replay, side pots, splits, reconciliation,
                           settle-up, lifetime stats, data migration
  storage.ts               localStorage persistence, cross-tab sync, backup, theme
  App.tsx                  App shell: navigation, toasts, confirmations
  views/
    StartView.tsx          New-session form + recent sessions
    LiveTable.tsx          Live session: hand editor, ledger, settlement, hand log
    HistoryView.tsx        Past sessions, detail, reopen, export/import
    StatsView.tsx          Lifetime leaderboard
  components/
    PokerHandEditor.tsx    Pots, winners, splits, board, betting actions
    CardPicker.tsx         Rank → suit card entry
    Settlement.tsx         Chip check + settle-up + share
    HandRow.tsx            Hand log row with expandable detail
    bits.tsx               Shared UI (money input, modal, stat card, …)
tests/
  poker.test.ts            Engine tests
```

## Conventions

- **Money is whole rupees.** No paise, no floats.
- **Bet, raise and all-in amounts are the player's *total* on that street.** "Raise to ₹200", not "raise by". Calls are worked out automatically.
- **The house fee is stored per hand**, so changing a session's fee never rewrites past hands.
- **Stored data is versioned.** `normalizeSessions()` migrates older saves (including the original Replit version's format) and repairs bad data, such as two sessions both marked live.
- **Custom CSS classes live in `@layer components`** in `index.css`, so Tailwind utilities can override them. Keep them in that layer.

## Stack

React 19 · TypeScript · Vite 7 · Tailwind CSS 4 · lucide-react · Vitest

---

Built for tracking home games between friends. Check your local laws on hosting games with a house fee.
