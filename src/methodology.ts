import { SPL_TOKEN_PROGRAM, type TokenStats } from "./jupiter.js";

/**
 * The Flock DeFi Index rulebook, as code.
 *
 * `METHODOLOGY.md` is the human version of this file and the two are meant to be read together.
 * Every threshold here is a number in `RULES`, so a change to the methodology is a diff anyone can
 * see, and a rebalance can be reproduced from a commit hash.
 */

export const VERSION = "1.0.0";

export const RULES = {
  /** Jupiter tag that defines the candidate set. */
  categoryTag: "defi",
  /**
   * Tags that disqualify regardless of everything else. These are not DeFi equity: a liquid
   * staking receipt is SOL exposure, a tokenized stock is equity exposure, and a stablecoin is
   * dollars. An index that mixes them is not measuring what it says it measures.
   */
  excludedTags: [
    "lst",
    "original-lst",
    "stable",
    "rwa",
    "stocks",
    "xstocks",
    "prestocks",
    "equities",
    "token-2022",
  ],
  minMarketCapUsd: 50_000_000,
  minLiquidityUsd: 1_000_000,
  minHolders: 20_000,
  minAgeDays: 180,
  minOrganicScore: 50,
  /**
   * Organic volume floors, whichever binds harder. The absolute floor keeps a token that nobody
   * trades out of the index; the turnover floor scales it, because $50k a day means something very
   * different for a $60M token than for a $900M one.
   *
   * Calibrated against the universe on 2026-09-07 rather than guessed. A flat $250k floor, which is
   * what this rule started as, excluded working protocol tokens like KMNO and MET on an ordinary
   * day while adding nothing the liquidity and organic-score screens do not already catch.
   */
  minOrganicVolume24hUsd: 50_000,
  minOrganicTurnoverBps: 3,
  /**
   * Fully diluted over circulating. A token whose float is a fifth of its supply is mostly an
   * unlock schedule, and an index that buys it is buying the sell pressure with it.
   */
  maxFdvToMarketCap: 4,
  /**
   * Market cap is capped at this multiple of on-chain liquidity before weighting. A $400M token
   * with $300k of depth cannot be bought or sold at anything like $400M, and an index that weights
   * it as if it could is an index that cannot rebalance.
   */
  liquidityCapMultiple: 25,
  maxConstituents: 10,
  /**
   * The cap has to be feasible for the breadth the screen actually produces. This universe yields
   * a handful of names, and a 25% cap on four of them is not a cap, it is equal weight by another
   * route: it would throw away the liquidity adjustment entirely.
   */
  maxWeightBps: 3_500,
  minWeightBps: 300,
  /**
   * A current constituent is held as long as it still clears this share of each numeric threshold.
   * Turnover costs holders real money in auction premiums, so the bar to leave is lower than the
   * bar to enter.
   */
  retentionSlack: 0.8,
} as const;

export interface ScreenResult {
  token: TokenStats;
  passed: boolean;
  /** Empty when it passed. Every reason, not just the first, so a near miss is visible. */
  failures: string[];
  ageDays: number | null;
  score: number;
  retained: boolean;
}

export function ageDays(token: TokenStats, now: Date): number | null {
  if (!token.firstPoolCreatedAt) return null;
  const created = Date.parse(token.firstPoolCreatedAt);
  if (Number.isNaN(created)) return null;
  return (now.getTime() - created) / 86_400_000;
}

/** Market cap, capped at what the on-chain depth can actually support. */
export function liquidityAdjustedScore(token: TokenStats): number {
  return Math.min(token.marketCapUsd, RULES.liquidityCapMultiple * token.liquidityUsd);
}

export function screen(token: TokenStats, options: { now: Date; incumbent: boolean }): ScreenResult {
  const failures: string[] = [];
  const slack = options.incumbent ? RULES.retentionSlack : 1;
  const age = ageDays(token, options.now);

  if (!token.tags.includes(RULES.categoryTag)) failures.push(`not tagged ${RULES.categoryTag}`);
  for (const tag of RULES.excludedTags) {
    if (token.tags.includes(tag)) failures.push(`excluded tag ${tag}`);
  }
  // These four are binary and never get slack: a component the fund cannot safely custody is not a
  // near miss, it is a different asset class of risk.
  if (token.tokenProgram !== SPL_TOKEN_PROGRAM) failures.push("not the SPL Token program");
  if (!token.mintAuthorityDisabled) failures.push("mint authority not provably disabled");
  if (!token.freezeAuthorityDisabled) failures.push("freeze authority not provably disabled");
  if (!token.isVerified) failures.push("not verified");

  if (token.marketCapUsd < RULES.minMarketCapUsd * slack) {
    failures.push(`market cap ${fmt(token.marketCapUsd)} below ${fmt(RULES.minMarketCapUsd * slack)}`);
  }
  if (token.liquidityUsd < RULES.minLiquidityUsd * slack) {
    failures.push(`liquidity ${fmt(token.liquidityUsd)} below ${fmt(RULES.minLiquidityUsd * slack)}`);
  }
  if (token.holderCount < RULES.minHolders * slack) {
    failures.push(`${token.holderCount} holders below ${Math.round(RULES.minHolders * slack)}`);
  }
  if (age === null || age < RULES.minAgeDays * slack) {
    failures.push(age === null ? "no first pool date" : `${age.toFixed(0)} days old`);
  }
  if (token.organicScore < RULES.minOrganicScore * slack) {
    failures.push(`organic score ${token.organicScore.toFixed(0)}`);
  }
  const turnoverFloor = (token.marketCapUsd * RULES.minOrganicTurnoverBps) / 10_000;
  const volumeFloor = Math.max(RULES.minOrganicVolume24hUsd, turnoverFloor) * slack;
  if (token.organicVolume24hUsd < volumeFloor) {
    failures.push(`organic volume ${fmt(token.organicVolume24hUsd)} below ${fmt(volumeFloor)}`);
  }
  if (token.marketCapUsd > 0 && token.fdvUsd / token.marketCapUsd > RULES.maxFdvToMarketCap) {
    failures.push(`FDV is ${(token.fdvUsd / token.marketCapUsd).toFixed(1)}x market cap`);
  }

  return {
    token,
    passed: failures.length === 0,
    failures,
    ageDays: age,
    score: liquidityAdjustedScore(token),
    retained: options.incumbent && failures.length === 0 && slack < 1,
  };
}

function fmt(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export interface Constituent {
  mint: string;
  symbol: string;
  decimals: number;
  score: number;
  weightBps: number;
  marketCapUsd: number;
  liquidityUsd: number;
  usdPrice: number;
}

/**
 * Turn scores into weights that add up to exactly 10000 bps, with a cap and a floor.
 *
 * The cap is applied the way index committees actually apply one: fix whatever breaches it at the
 * cap, then re-weight everything else proportionally over what is left, and repeat, because
 * capping one name raises the others and can push a second name through the cap. The floor works
 * the same way in the other direction. Rounding to whole basis points uses largest remainders so
 * the total is exactly 10000 rather than 9999. The program does not care, but the CLI refuses a
 * weighting that does not add up, and it is right to: a methodology that cannot state its own
 * weights exactly has not finished thinking.
 *
 * A cap can be arithmetically impossible: four names cannot each hold at most 25% and still sum to
 * 100%. When that happens the binding constraint is `1/n`, and the result is equal weight, which is
 * the only answer consistent with the cap.
 */
export function weight(scores: number[]): number[] {
  const n = scores.length;
  if (n === 0) return [];
  if (scores.some((score) => score <= 0)) throw new Error("every constituent needs a positive score");
  if (RULES.minWeightBps * n > 10_000) {
    throw new Error(`${n} constituents cannot all clear a ${RULES.minWeightBps} bps floor`);
  }

  const cap = Math.max(RULES.maxWeightBps / 10_000, 1 / n);
  const floor = Math.min(RULES.minWeightBps / 10_000, 1 / n);

  const fixed = new Array<number | null>(n).fill(null);
  for (let round = 0; round <= n; round += 1) {
    const freeIndices = fixed.map((value, i) => (value === null ? i : -1)).filter((i) => i >= 0);
    if (freeIndices.length === 0) break;
    const used = fixed.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const remaining = 1 - used;
    const freeScore = freeIndices.reduce((sum, i) => sum + (scores[i] ?? 0), 0);
    const proposed = freeIndices.map((i) => (remaining * (scores[i] ?? 0)) / freeScore);

    const over = proposed.findIndex((w) => w > cap + 1e-12);
    if (over >= 0) {
      fixed[freeIndices[over]!] = cap;
      continue;
    }
    const under = proposed.findIndex((w) => w < floor - 1e-12);
    if (under >= 0) {
      fixed[freeIndices[under]!] = floor;
      continue;
    }
    freeIndices.forEach((i, k) => {
      fixed[i] = proposed[k] ?? 0;
    });
    break;
  }

  const exact = fixed.map((value) => (value ?? 0) * 10_000);
  const floored = exact.map((value) => Math.floor(value));
  let remainder = 10_000 - floored.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, i) => ({ i, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || (scores[b.i] ?? 0) - (scores[a.i] ?? 0));
  const result = [...floored];
  for (let k = 0; remainder > 0; k += 1, remainder -= 1) {
    const target = order[k % order.length]!.i;
    result[target] = (result[target] ?? 0) + 1;
  }
  return result;
}

/** Apply the whole rulebook: screen, rank, cut to size, weight. */
export function compose(
  universe: TokenStats[],
  options: { now: Date; incumbents?: string[] },
): { constituents: Constituent[]; screened: ScreenResult[] } {
  const incumbents = new Set(options.incumbents ?? []);
  const screened = universe
    .map((token) => screen(token, { now: options.now, incumbent: incumbents.has(token.mint) }))
    .sort((a, b) => b.score - a.score);

  const selected = screened.filter((entry) => entry.passed).slice(0, RULES.maxConstituents);
  const weights = weight(selected.map((entry) => entry.score));

  return {
    constituents: selected.map((entry, i) => ({
      mint: entry.token.mint,
      symbol: entry.token.symbol,
      decimals: entry.token.decimals,
      score: entry.score,
      weightBps: weights[i] ?? 0,
      marketCapUsd: entry.token.marketCapUsd,
      liquidityUsd: entry.token.liquidityUsd,
      usdPrice: entry.token.usdPrice,
    })),
    screened,
  };
}
