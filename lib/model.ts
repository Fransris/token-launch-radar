// The token radar's valuation model, fitted to the snapshot itself.
//
// The question: if a protocol that records no token issued one today, what would it be worth?
// The answer is not one constant multiple. It is read off the protocols in the same snapshot whose
// token already trades: each of them says what the market pays per dollar of TVL, at its size, in
// its category.
//
//   y = ln(mcap / tvl), winsorized to [0.01, 20]      x = log10(tvl)
//   y = a + b*x + offset(category)                     fitted on every trading protocol (OLS)
//   offset(c) = n_c * median(residual_c) / (n_c + K)   shrunk: four comps are weak evidence
//   multiple(p) = exp(a + b*log10(tvl_p) + offset(cat_p))
//
//   growthMult   = 1 + clamp(change_7d, -60, +150)/100 * GROWTH_WEIGHT
//   patienceMult = PATIENCE_FLOOR + min(age_days, PATIENCE_DAYS)/PATIENCE_DAYS * (1 - PATIENCE_FLOOR)
//   implied      = tvl_usd * multiple(p) * growthMult * patienceMult
//
// Size is in the model because a dollar of TVL is not paid the same at every size: the fit's slope
// says how the market's multiple falls as a protocol grows, and every row inherits that slope
// instead of a hardcoded list of names or a single blanket number.
//
// The fit is checked by leave-one-out: every trading protocol is re-priced from the comps of the
// others, never itself, and the miss is reported beside the same test for a blanket single
// multiple. Both numbers are measured at build time from the snapshot's own figures and shipped.

/** One protocol, exactly the ten fields the sealed snapshot carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated on the page and reproducible from the snapshot alone. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  patience_floor: number;
  patience_days: number;
  unknown_age_days: number;
  shrink_k: number;
  min_category_comps: number;
  multiple_floor: number;
  multiple_cap: number;
  min_tvl: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.3,
  growth_floor: -60,
  growth_cap: 150,
  patience_floor: 0.85,
  patience_days: 1825,
  unknown_age_days: 365,
  shrink_k: 6,
  min_category_comps: 3,
  multiple_floor: 0.01,
  multiple_cap: 20,
  min_tvl: 5_000_000,
};

export const MODEL_VERSION = 'comps-4';

/**
 * The farm economics, stated so a reader can disagree with any of them:
 *   expected  = implied value × CAPTURE       one farmed wallet's share of a launch that size
 *   carry     = deposit × CARRY_APR × days/365  what the deposit would have earned elsewhere
 *   cost      = GAS_SETUP + GAS_EXIT + carry
 *   net       = expected - cost
 * A plan is worth doing when net clears FARM_MIN_NET; below zero it is a skip.
 */
export const FARM = {
  capture: 1e-6,
  carry_apr: 0.06,
  gas_setup: 12,
  gas_exit: 3,
  min_net: 10,
};

/** One category: its comps, its fitted offset, and the multiple the fit pays there at $100M TVL. */
export interface CategoryFit {
  category: string;
  comps: number;
  median_multiple: number;
  offset: number;
  multiple_at_100m: number;
}

/** The fit: the size curve, every category's offset, and the leave-one-out check of the whole thing. */
export interface Fit {
  model: ModelConstants;
  prior_multiple: number;
  prior_comps: number;
  intercept: number;
  slope: number;
  categories: CategoryFit[];
  check: ModelCheck;
  time_split: TimeSplitCheck;
}

/** What the leave-one-out check measured on the snapshot's trading protocols. */
export interface ModelCheck {
  scored: number;
  model_median_miss: number;
  blanket_median_miss: number;
  within_2x: number;
  within_2x_blanket: number;
  rank_ic: number;
  best: { slug: string; name: string; actual: number; predicted: number } | null;
  worst: { slug: string; name: string; actual: number; predicted: number } | null;
}

/**
 * The second test: a time split. The protocols DefiLlama has tracked longest are fitted, and the
 * curve they produce prices the ones listed later — a protocol the fit never saw, in the direction
 * time actually runs. Run both ways so neither half is privileged.
 */
export interface TimeSplitCheck {
  split_at: string;
  old_n: number;
  new_n: number;
  old_to_new_miss: number;
  new_to_old_miss: number;
  old_to_new_within_2x: number;
  new_to_old_within_2x: number;
  combined_miss: number;
}

/** A farm step: what to do, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A board row: one pre-token protocol, priced and planned. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  on_watchlist: boolean;
  multiple: number;
  model: {
    base_multiple: number;
    category: string | null;
    category_offset: number;
    size_slope: number;
    growth_pct: number;
    growth_multiplier: number;
    patience_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
  farm_cost_usd: number;
  farm_days: number;
  /** The verdict the numbers give: is one farmed wallet worth its cost, net of gas and carry? */
  farm_verdict: 'farm' | 'thin' | 'skip';
  farm_capital_usd: number;
  farm_expected_usd: number;
  farm_carry_usd: number;
  farm_total_cost_usd: number;
  farm_net_usd: number;
  /** The implied value at which this plan breaks even, so a reader can judge the margin. */
  farm_breakeven_usd: number;
  /** The band the fit's own measured miss puts around the point estimate. */
  implied_low_usd: number;
  implied_high_usd: number;
}

/** A protocol whose token already trades: the comps, and what the model would have said. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  symbol: string | null;
  change_7d: number | null;
  multiple: number | null;
  model_value: number | null;
}

/** One comp as the detail view lists it: the trading protocols a category's multiple rests on. */
export interface CompRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
}

/** Everything the page renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  fit: Fit;
  watchlist_size: number;
  board_size: number;
  below_floor: number;
  pre_token_total: number;
  protocols_total: number;
  live_size: number;
  implied_total_usd: number;
  farm_counts: { farm: number; thin: number; skip: number };
  farm_assumptions: typeof FARM;
  rows: BoardRow[];
  live: LiveRow[];
  comps: CompRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Whole days from the snapshot's as_of back to the day DefiLlama began tracking a protocol. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A protocol records no token when all three of the token fields are null. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The house's screen for a wrapped, staked or bridged product of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is a product of another rather than a protocol still waiting on a launch. */
export function isProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (PRODUCT_WORD.test(p.name)) return true;
  if (EXCHANGE.test(p.name)) return true;
  return VERSIONED.test(p.name);
}

/**
 * Whether a protocol is a subject of the board: it records no token, it is not a wrapped, staked
 * or bridged product of one that trades, and its TVL is at least the fit's own floor. The house's
 * watchlist is the same screen at $50M and up; the radar runs it at every size.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isProduct(p) && p.tvl_usd >= MODEL.min_tvl;
}

/** The trading protocols the fit reads: a real market cap on a real TVL, not an exchange's books. */
function compsUniverse(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd >= MODEL.min_tvl && p.category !== 'CEX');
}

/** ln(mcap/tvl) for one comp, winsorized so one outlier cannot move a category. */
function logMultiple(p: SnapshotProtocol): number {
  const m = Math.min(MODEL.multiple_cap, Math.max(MODEL.multiple_floor, (p.mcap_usd ?? 0) / p.tvl_usd));
  return Math.log(m);
}

/** The ordinary least squares line through (log10 tvl, ln multiple): the market's size curve. */
function sizeCurve(comps: SnapshotProtocol[]): { a: number; b: number } {
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map(logMultiple);
  const n = xs.length;
  if (n < 3) return { a: n === 1 ? ys[0]! : median(ys), b: 0 };
  const mx = xs.reduce((a, v) => a + v, 0) / n;
  const my = ys.reduce((a, v) => a + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  return { a: my - b * mx, b };
}

/** The fitted multiple for a protocol of this TVL and category. */
function fittedMultiple(fit: Fit, tvl: number, category: string | null): { multiple: number; offset: number } {
  const offset = fit.categories.find((c) => c.category === (category ?? 'unclassified'))?.offset ?? 0;
  const m = Math.exp(fit.intercept + fit.slope * Math.log10(Math.max(tvl, 1)) + offset);
  return { multiple: Math.min(fit.model.multiple_cap, Math.max(fit.model.multiple_floor, m)), offset };
}

/** A curve fitted on one set of comps, able to price anything it did not see. */
interface Curve {
  a: number;
  b: number;
  offsetOf: (category: string | null) => number;
}

/** Fit the size curve and the category offsets on `train`, with the same shrinkage the board uses. */
function fitOn(train: SnapshotProtocol[], model: ModelConstants): Curve {
  const { a, b } = sizeCurve(train);
  const k = model.shrink_k;
  const byCat = new Map<string, number[]>();
  for (const p of train) {
    const key = p.category ?? 'unclassified';
    const residual = logMultiple(p) - (a + b * Math.log10(p.tvl_usd));
    const list = byCat.get(key);
    if (list === undefined) byCat.set(key, [residual]);
    else list.push(residual);
  }
  const offsets = new Map<string, number>();
  for (const [cat, residuals] of byCat) {
    offsets.set(cat, residuals.length < model.min_category_comps ? 0 : (residuals.length * median(residuals)) / (residuals.length + k));
  }
  return { a, b, offsetOf: (category) => offsets.get(category ?? 'unclassified') ?? 0 };
}

/** What a curve says a protocol is worth, before growth and patience. */
function priceWith(curve: Curve, p: SnapshotProtocol, model: ModelConstants): number {
  const m = Math.exp(curve.a + curve.b * Math.log10(Math.max(p.tvl_usd, 1)) + curve.offsetOf(p.category));
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, m)) * p.tvl_usd;
}

/** The time split: fit the older half, price the newer one, and the reverse. */
function timeSplit(comps: SnapshotProtocol[], asOf: string, model: ModelConstants): TimeSplitCheck {
  const dated = comps.filter((p) => p.listed_at !== null).sort((x, y) => (x.listed_at! < y.listed_at! ? -1 : x.listed_at! > y.listed_at! ? 1 : 0));
  const mid = dated.length >> 1;
  const older = dated.slice(0, mid);
  const newer = dated.slice(mid);
  const empty: TimeSplitCheck = { split_at: dated[mid]?.listed_at ?? asOf, old_n: older.length, new_n: newer.length, old_to_new_miss: 0, new_to_old_miss: 0, old_to_new_within_2x: 0, new_to_old_within_2x: 0, combined_miss: 0 };
  if (older.length < 8 || newer.length < 8) return empty;
  const test = (train: SnapshotProtocol[], hold: SnapshotProtocol[]): { miss: number; within: number } => {
    const curve = fitOn(train, model);
    const errs = hold.map((p) => Math.abs(Math.log(priceWith(curve, p, model) / (p.mcap_usd ?? 1))));
    const within = hold.filter((p) => {
      const r = priceWith(curve, p, model) / (p.mcap_usd ?? 1);
      return r >= 0.5 && r <= 2;
    }).length;
    return { miss: Math.exp(median(errs)), within: within / hold.length };
  };
  const fwd = test(older, newer);
  const back = test(newer, older);
  return {
    split_at: dated[mid]!.listed_at!,
    old_n: older.length,
    new_n: newer.length,
    old_to_new_miss: round4(fwd.miss),
    new_to_old_miss: round4(back.miss),
    old_to_new_within_2x: round4(fwd.within),
    new_to_old_within_2x: round4(back.within),
    combined_miss: round4(Math.sqrt(fwd.miss * back.miss)),
  };
}

/** Spearman's rank correlation, with average ranks for ties. */
function spearman(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const ranks = (v: number[]): number[] => {
    const order = v.map((value, i) => [value, i] as [number, number]).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(n).fill(0);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && order[j + 1]![0] === order[i]![0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[order[k]![1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mean = (n + 1) / 2;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i]! - mean;
    const b = ry[i]! - mean;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

/** Fit the size curve and category offsets, then check them leave-one-out. */
export function fitModel(snapshot: Snapshot, model: ModelConstants = MODEL): Fit {
  const comps = compsUniverse(snapshot.protocols);
  const priorMultiple = Math.exp(median(comps.map(logMultiple)));
  const { a, b } = sizeCurve(comps);

  const byCategory = new Map<string, SnapshotProtocol[]>();
  for (const p of comps) {
    const key = p.category ?? 'unclassified';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [p]);
    else list.push(p);
  }
  const k = model.shrink_k;
  const categories: CategoryFit[] = [...byCategory.entries()]
    .map(([category, list]) => {
      const residuals = list.map((p) => logMultiple(p) - (a + b * Math.log10(p.tvl_usd)));
      const n = list.length;
      // A category with fewer than min_category_comps is too thin to move a price: its offset is
      // zero, and the size curve alone prices the protocols in it.
      const offset = n < model.min_category_comps ? 0 : (n * median(residuals)) / (n + k);
      return {
        category,
        comps: n,
        median_multiple: round4(Math.exp(median(list.map(logMultiple)))),
        offset: round4(offset),
        multiple_at_100m: round4(Math.exp(a + b * 8 + offset)),
      };
    })
    .sort((x, y) => y.comps - x.comps || (x.category < y.category ? -1 : 1));

  const base: Fit = {
    model,
    prior_multiple: round4(priorMultiple),
    prior_comps: comps.length,
    intercept: round4(a),
    slope: round4(b),
    categories,
    check: { scored: 0, model_median_miss: 0, blanket_median_miss: 0, within_2x: 0, within_2x_blanket: 0, rank_ic: 0, best: null, worst: null },
    time_split: timeSplit(comps, snapshot.as_of, model),
  };

  // Leave-one-out: price every trading protocol from the comps of the others, never itself.
  const scored: { p: SnapshotProtocol; actual: number; predicted: number; blanket: number }[] = [];
  for (const p of comps) {
    const rest = comps.filter((q) => q.slug !== p.slug);
    const curve = fitOn(rest, model);
    const actual = p.mcap_usd ?? 0;
    if (actual <= 0) continue;
    scored.push({ p, actual, predicted: priceWith(curve, p, model), blanket: p.tvl_usd * Math.exp(median(rest.map(logMultiple))) });
  }
  const miss = (v: { predicted: number; actual: number }): number => Math.abs(Math.log(v.predicted / v.actual));
  const within2 = (v: { predicted: number; actual: number }): number => (v.predicted / v.actual >= 0.5 && v.predicted / v.actual <= 2 ? 1 : 0);
  const sorted = [...scored].sort((x, y) => miss(y) - miss(x));
  base.check = {
    scored: scored.length,
    model_median_miss: round4(Math.exp(median(scored.map(miss)))),
    blanket_median_miss: round4(Math.exp(median(scored.map((v) => Math.abs(Math.log(v.blanket / v.actual)))))),
    within_2x: scored.length === 0 ? 0 : round4(scored.reduce((acc, v) => acc + within2(v), 0) / scored.length),
    within_2x_blanket: scored.length === 0 ? 0 : round4(scored.reduce((acc, v) => acc + (v.blanket / v.actual >= 0.5 && v.blanket / v.actual <= 2 ? 1 : 0), 0) / scored.length),
    rank_ic: round4(spearman(scored.map((v) => v.predicted), scored.map((v) => v.actual))),
    best: sorted.length === 0 ? null : { slug: sorted[sorted.length - 1]!.p.slug, name: sorted[sorted.length - 1]!.p.name, actual: sorted[sorted.length - 1]!.actual, predicted: Math.round(sorted[sorted.length - 1]!.predicted) },
    worst: sorted.length === 0 ? null : { slug: sorted[0]!.p.slug, name: sorted[0]!.p.name, actual: sorted[0]!.actual, predicted: Math.round(sorted[0]!.predicted) },
  };
  return base;
}

/** One protocol's implied value under a fit. */
export function impliedValue(p: SnapshotProtocol, asOf: string, fit: Fit): { implied: number; multiple: number; offset: number; growthPct: number; growthMult: number; patienceMult: number; age: number | null } {
  const m = fit.model;
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = Math.min(m.growth_cap, Math.max(m.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * m.growth_weight;
  const ageForModel = age ?? m.unknown_age_days;
  const patienceMult = m.patience_floor + (Math.min(Math.max(ageForModel, 0), m.patience_days) / m.patience_days) * (1 - m.patience_floor);
  const fitted = fittedMultiple(fit, p.tvl_usd, p.category);
  const implied = Math.min(1e14, Math.max(1, Math.round(p.tvl_usd * fitted.multiple * growthMult * patienceMult)));
  return { implied, multiple: round4(fitted.multiple), offset: round4(fitted.offset), growthPct, growthMult: round4(growthMult), patienceMult: round4(patienceMult), age };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Capital one farm position needs, scaled to the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 300;
  if (p.tvl_usd >= 250_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 150;
  return 75;
}

/** How long to hold, from the protocol's age: a young protocol rewards a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 90;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The category's core action, in words a farmer can follow, with its own cost and time. */
function coreStep(p: SnapshotProtocol, capital: number, chain: string): FarmStep {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const gas = capital >= 300 ? 12 : capital >= 150 ? 7 : 4;
  const cost = `$${capital} of capital plus about $${gas} of gas`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return { text: `Supply $${capital} of USDC to ${name} on ${chain}, then borrow 25-30% of it back in the same market so one deposit counts as two positions.`, cost, time: '20 minutes, then 5 minutes a week to watch the health factor' };
  if (c.includes('dex') || c.includes('amm'))
    return { text: `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain}, in the pair its own volume page ranks first, and leave the position open.`, cost, time: '25 minutes to set up, 10 minutes a week to rebalance the range' };
  if (c.includes('curator') || c.includes('allocator'))
    return { text: `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the shares rather than the underlying, so the position stays visible to the protocol.`, cost, time: '15 minutes to deposit, then no weekly work' };
  if (c.includes('yield') || c.includes('vault'))
    return { text: `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and keep the shares rather than the underlying.`, cost, time: '15 minutes to deposit, then no weekly work' };
  if (c.includes('bridge'))
    return { text: `Bridge $${capital} of USDC to ${chain} through ${name} and deploy the bridged funds in one of its listed apps, so the volume and the deposit both count.`, cost: `$${capital} plus the bridge fee (usually under $3) and $${gas} of gas`, time: '20 minutes, and about 15 minutes to bridge back later' };
  if (c.includes('staking') || c.includes('restak'))
    return { text: `Stake $${capital} of ${chain}'s staking asset through ${name} and keep the receipt token in the same wallet that staked.`, cost: `$${capital} plus about $${gas} of gas`, time: '10 minutes to stake, then the unbonding period when you leave' };
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis'))
    return { text: `Deposit $${capital} of USDC as margin on ${name} on ${chain} and hold one small hedge open for the whole window instead of opening and closing it.`, cost: `$${capital} of margin plus $${gas} of gas and the funding you pay`, time: '15 minutes to open, 5 minutes a week to check funding' };
  if (c.includes('prediction'))
    return { text: `Fund $${capital} into ${name} on ${chain} and take one position on a market that settles inside the window.`, cost: `$${capital} at risk plus $${gas} of gas`, time: '10 minutes to place, and until settlement to hold' };
  if (c.includes('stable'))
    return { text: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold the receipt in the wallet you used.`, cost: `$${capital} plus $${gas} of gas`, time: '15 minutes, and a weekly check of the collateral ratio' };
  if (c.includes('rwa'))
    return { text: `Mint $${capital} of ${name}'s yield asset on ${chain}, hold it in the same wallet, and do not move it to a second address.`, cost: `$${capital} plus $${gas} of gas and any mint fee the issuer charges`, time: '20 minutes, then hold for the whole window' };
  if (c.includes('insurance'))
    return { text: `Buy $${capital} of cover from ${name} on ${chain} for a pool you already hold and keep the policy to expiry.`, cost: `$${capital} of cover premium plus $${gas} of gas`, time: '15 minutes, then hold to expiry' };
  if (c.includes('launchpad') || c.includes('farm'))
    return { text: `Stake $${capital} into ${name}'s main farm on ${chain} and claim rewards weekly rather than compounding them.`, cost: `$${capital} plus $${gas} of gas`, time: '15 minutes to stake, 5 minutes a week to claim' };
  if (c.includes('index'))
    return { text: `Mint $${capital} of ${name}'s index on ${chain} and hold the basket rather than swapping it back.`, cost: `$${capital} plus $${gas} of gas and the mint fee`, time: '15 minutes, then hold' };
  return { text: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open rather than round-tripping it.`, cost, time: '20 minutes to set up, 5 minutes a week to check' };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age) and never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): { steps: FarmStep[]; capital: number; days: number } {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const steps: FarmStep[] = [
    {
      text: `Set up a fresh wallet on ${chain} that holds only what you plan to farm, fund it from an exchange or a wallet you already control, and keep the seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '10 minutes',
    },
    coreStep(p, capital, chain),
    {
      text: `Do one qualifying action a week on ${p.name} — a deposit, a borrow, a swap or a vote — so the wallet shows steady use rather than a single hit.`,
      cost: 'about $2 of gas a week, and no new capital',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position at least ${hold} days so the activity spans more than one snapshot of ${p.name}'s users.`,
      cost: `the $${capital} stays in the position, and nothing more is spent`,
      time: `${hold} days`,
    },
    {
      text: `Open ${p.name}'s own points, docs or rewards page from the link the protocol publishes, and record whether it has announced a token; never pay anyone to claim.`,
      cost: 'nothing to check, and never pay to claim',
      time: '10 minutes a week',
    },
    {
      text: `Unwind in the order this plan sets: withdraw the borrowed side first, then the supplied collateral, then move the stablecoin out — and leave enough gas for one last transaction.`,
      cost: 'about $3 of gas to exit, and no exit fee at ' + p.name,
      time: '20 minutes on the day you leave',
    },
    {
      text: `Write the wallet address, the dates and every transaction in a farm log, and note the exit: what you withdraw first and what you leave behind.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  return { steps, capital, days: hold };
}

/** One step as one string, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The board: every pre-token protocol the snapshot records, strongest implied value first. */
export function buildBoard(snapshot: Snapshot, fit: Fit): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const band = Math.exp(fit.check.model_median_miss);
  const scored = snapshot.protocols.filter(isRankable).map((p) => ({ p, v: impliedValue(p, snapshot.as_of, fit) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const plan = farmSteps(s.p, s.v.age);
    const expected = s.v.implied * FARM.capture;
    const carry = plan.capital * FARM.carry_apr * (plan.days / 365);
    const totalCost = FARM.gas_setup + FARM.gas_exit + carry;
    const net = expected - totalCost;
    const verdict: 'farm' | 'thin' | 'skip' = net >= FARM.min_net ? 'farm' : net >= 0 ? 'thin' : 'skip';
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.v.age,
      implied_value_usd: s.v.implied,
      on_watchlist: watch.has(s.p.slug),
      multiple: s.v.multiple,
      model: {
        base_multiple: s.v.multiple,
        category: s.p.category,
        category_offset: s.v.offset,
        size_slope: fit.slope,
        growth_pct: s.v.growthPct,
        growth_multiplier: s.v.growthMult,
        patience_multiplier: s.v.patienceMult,
        age_days: s.v.age,
      },
      farm_steps: plan.steps.map(stepText),
      farm_cost_usd: plan.capital,
      farm_days: plan.days,
      farm_verdict: verdict,
      farm_capital_usd: plan.capital,
      farm_expected_usd: round4(expected),
      farm_carry_usd: round4(carry),
      farm_total_cost_usd: round4(totalCost),
      farm_net_usd: round4(net),
      farm_breakeven_usd: Math.round(totalCost / FARM.capture),
      implied_low_usd: Math.max(1, Math.round(s.v.implied / band)),
      implied_high_usd: Math.round(s.v.implied * band),
    };
  });
}

/** The protocols whose token already trades: the comps, plus what the model would have said. */
export function liveRows(snapshot: Snapshot, fit: Fit): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      symbol: p.symbol,
      change_7d: p.change_7d,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
      model_value: impliedValue(p, snapshot.as_of, fit).implied,
    }))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd);
}

/** Everything the page renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot, model);
  const board = buildBoard(snapshot, fit);
  const live = liveRows(snapshot, fit);
  const comps: CompRow[] = compsUniverse(snapshot.protocols)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd ?? 0,
      multiple: round4(Math.min(model.multiple_cap, Math.max(model.multiple_floor, (p.mcap_usd ?? 0) / p.tvl_usd))),
    }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    below_floor: board.filter((r) => !r.on_watchlist).length,
    pre_token_total: snapshot.protocols.filter(isPreToken).length,
    protocols_total: snapshot.protocols.length,
    live_size: live.length,
    implied_total_usd: board.reduce((a, r) => a + r.implied_value_usd, 0),
    farm_counts: {
      farm: board.filter((r) => r.farm_verdict === 'farm').length,
      thin: board.filter((r) => r.farm_verdict === 'thin').length,
      skip: board.filter((r) => r.farm_verdict === 'skip').length,
    },
    farm_assumptions: FARM,
    rows: board,
    live,
    comps,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return `all ${board.length} rows share the same implied value`;
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard's whole dataset as one script: no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
