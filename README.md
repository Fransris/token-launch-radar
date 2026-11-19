# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Fransris/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Fransris/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A board of every protocol in the sealed DefiLlama snapshot that records no token, ranked by what its
launch would plausibly be worth, each with a farm plan and a verdict on whether the farm pays.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

---

## What the radar does

It answers one question with the snapshot's own figures: *if this protocol issued a token today, what
would it be worth?* Nothing is hardcoded by name and no multiple is a constant.

**How a value is built**

1. **Size curve.** `multiple = exp(a + b · log10 TVL)`, fitted on the 119 protocols in the snapshot
   whose token already trades. A dollar of TVL is paid less as a protocol grows; every row inherits
   that slope instead of a single blanket number.
2. **Category tilt.** `× exp(offset)`, where `offset = n · median(residual) / (n + 6)`, and `offset = 0`
   when a category holds fewer than 3 comps — too thin to move a price.
3. **Seven-day growth.** `× (1 + clamp(7d, -60, +150)/100 · 0.30)`.
4. **Patience.** `× (0.85 + min(age, 1825)/1825 · 0.15)` — how long it has run recording no token.
5. **Implied value.** `TVL × multiple × growth × patience`.

**Two tests, both on the snapshot's own protocols**

- **Leave-one-out:** every trading protocol re-priced from the comps of the others, never itself.
  Median miss **3.38×**, against **4.94×** for one blanket multiple; 34% inside 2×; rank IC 0.38.
- **Time split:** the 43 comps tracked before 2024-02-28 fit the curve, and it prices the 44 tracked
  since — protocols from a period the fit never saw. **2.39×** forward, 3.03× backward, 2.69×
  combined. The forward number is the honest one for a radar.

**Farm verdicts, with the assumptions stated**

Value if it launches is half the question; the other half is whether it launches. The radar prices that
too, as a **category base rate**: the share of that category in this snapshot that already records a
token, Laplace-smoothed. Risk Curators sits at 15%, Dexs at 74%, Lending at 79%.

That is a cross-sectional prior and it is labelled as one, not a forecast: the snapshot carries no
launch dates, so a time-to-launch model cannot be estimated from it. A test on the data settled that
question — token-bearing protocols are *older* in DefiLlama's record than pre-token ones in 17 of 20
categories, because `listed_at` is when tracking began, not when a token appeared, so an age term would
read that confound as signal. The model carries none.

`expected = implied × odds × 0.08 airdrop ÷ 20,000 wallets`, minus gas ($12 in, $3 out) and carry (6% a
year on the deposit). 37 rows clear $10 net and read **farm**; 34 land between $0 and $10 (**thin**);
127 cost more than they expect (**skip**). Every row also shows the implied value at which its plan
breaks even, so the margin is visible rather than asserted. Those numbers ship in `data.js` and are
shown on the page, because a radar that hides its own error is a horoscope.

## What it writes

`main.ts` reads the snapshot and writes `out/board.json` (198 rows, every one of the 40
house-watchlist protocols among them), `out/data.js` for the page, copies `dashboard/` and
`screenshots/`, and writes `out/dossier.json` with `vendor/makefun-board.ts`. Node 22.18 or later,
standard library only, no network. It reads no clock and no random source: two runs write identical
bytes.

- `main.ts` — entrypoint: read, price, write, gate-check, dossier.
- `lib/model.ts` — the comps fit, the leave-one-out check, the board, the farm plans.
- `dashboard/` — the page: sortable and filterable board, a detail view for every protocol, the
  trading comps the fit was read from, and the method. No network, no framework.
- `screenshots/` — the board, a protocol's detail view, and a filtered view.
- `vendor/makefun-board.ts` — the make.fun dossier library, unmodified.

## The screen

A protocol is on the board when the snapshot records no market cap, no CoinGecko id and no symbol for
it, when it is not a wrapped, staked or bridged product of a token that trades (no Bridge, Canonical
Bridge, Liquid Staking, Liquid Restaking or Restaked BTC category; no whole word *wrapped*, *staked*
or *staking*; no exchange name at the front; no version marker), and when its TVL is at least $5M.

That is the same screen the house applied to its $50M watchlist, run at every size — which is why 158
of the 198 rows sit below the floor. The wording is deliberate too: a protocol **records no token**.
DefiLlama's record is not proof that none exists.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=zydymsxs&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
