# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Fransris/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Fransris/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A board of every protocol in the sealed DefiLlama snapshot that records no token, ranked by what its
launch would plausibly be worth, with a costed farm plan for each one.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

---

## What the radar does

It answers one question with the snapshot's own figures: *if this protocol issued a token today, what
would it be worth?* Nothing is hardcoded by name and no multiple is a constant.

```
y = ln(mcap / tvl)   winsorized to [0.01, 20]
x = log10(tvl)
y = a + b·x + offset(category)          fitted on the protocols whose token already trades
offset(c) = n·median(residual) / (n+6)  shrunk toward the market
offset(c) = 0 when n < 3               too thin to move a price
multiple(p) = exp(a + b·log10(tvl) + offset(cat))

implied = tvl · multiple · (1 + clamp(7d,-60,+150)/100 · 0.30) · (0.85 + min(age,1825)/1825 · 0.15)
```

The fit is checked leave-one-out: every trading protocol is re-priced from the comps of the others,
never itself. On this snapshot the median miss is **3.38×**, against **4.94×** for one blanket
multiple, with 34% inside 2× and a rank correlation of 0.38. Those numbers ship in `data.js` and are
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
