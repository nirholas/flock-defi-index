import { describe, expect, it } from "vitest";

import { RULES, compose, liquidityAdjustedScore, screen, weight } from "../src/methodology.js";
import { SPL_TOKEN_PROGRAM, type TokenStats } from "../src/jupiter.js";

const NOW = new Date("2026-09-07T00:00:00Z");

function token(overrides: Partial<TokenStats> = {}): TokenStats {
  return {
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    symbol: "JUP",
    name: "Jupiter",
    decimals: 6,
    usdPrice: 0.25,
    marketCapUsd: 800_000_000,
    fdvUsd: 1_600_000_000,
    circulatingSupply: 3_200_000_000,
    liquidityUsd: 4_000_000,
    holderCount: 800_000,
    organicScore: 97,
    organicScoreLabel: "high",
    isVerified: true,
    tags: ["verified", "defi"],
    tokenProgram: SPL_TOKEN_PROGRAM,
    firstPoolCreatedAt: "2024-01-29T00:00:00Z",
    mintAuthorityDisabled: true,
    freezeAuthorityDisabled: true,
    topHoldersPercentage: 20,
    devMints: 0,
    volume24hUsd: 20_000_000,
    organicVolume24hUsd: 8_000_000,
    priceChange24h: 1,
    holderChange24h: 0,
    ...overrides,
  };
}

describe("screening", () => {
  it("passes a token that clears every rule", () => {
    const result = screen(token(), { now: NOW, incumbent: false });
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("refuses a token whose mint or freeze authority is not provably disabled", () => {
    // Jupiter reports this field as undefined when it cannot confirm, which normalises to false.
    // Treating unknown as safe is how an index ends up holding something its issuer can freeze.
    expect(
      screen(token({ mintAuthorityDisabled: false }), { now: NOW, incumbent: false }).failures,
    ).toContain("mint authority not provably disabled");
    expect(
      screen(token({ freezeAuthorityDisabled: false }), { now: NOW, incumbent: true }).failures,
    ).toContain("freeze authority not provably disabled");
  });

  it("refuses Token-2022, which the index program does not custody", () => {
    const result = screen(token({ tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" }), {
      now: NOW,
      incumbent: false,
    });
    expect(result.failures).toContain("not the SPL Token program");
  });

  it("refuses assets that are not DeFi equity even when they are tagged defi", () => {
    for (const tag of ["lst", "stocks", "stable"]) {
      const result = screen(token({ tags: ["verified", "defi", tag] }), { now: NOW, incumbent: false });
      expect(result.failures).toContain(`excluded tag ${tag}`);
    }
  });

  it("refuses a token that is mostly an unlock schedule", () => {
    const result = screen(token({ fdvUsd: 8_000_000_000 }), { now: NOW, incumbent: false });
    expect(result.failures.join(" ")).toMatch(/FDV is 10.0x market cap/);
  });

  it("holds an incumbent that has drifted slightly under a threshold", () => {
    const drifted = token({ liquidityUsd: 850_000 }); // 85% of the $1M floor
    expect(screen(drifted, { now: NOW, incumbent: false }).passed).toBe(false);
    const held = screen(drifted, { now: NOW, incumbent: true });
    expect(held.passed).toBe(true);
    expect(held.retained).toBe(true);
  });

  it("reports every reason a token failed, not just the first", () => {
    const bad = token({ liquidityUsd: 1, holderCount: 5, organicScore: 0 });
    const result = screen(bad, { now: NOW, incumbent: false });
    expect(result.failures.length).toBeGreaterThanOrEqual(3);
  });
});

describe("liquidity-adjusted scoring", () => {
  it("caps a token that cannot be traded at anything like its market cap", () => {
    const thin = token({ marketCapUsd: 400_000_000, liquidityUsd: 300_000 });
    expect(liquidityAdjustedScore(thin)).toBe(300_000 * RULES.liquidityCapMultiple);
  });

  it("leaves a deep token at its market cap", () => {
    const deep = token({ marketCapUsd: 100_000_000, liquidityUsd: 20_000_000 });
    expect(liquidityAdjustedScore(deep)).toBe(100_000_000);
  });
});

describe("weighting", () => {
  it("falls back to equal weight when the cap is arithmetically impossible", () => {
    // Two names cannot each hold at most 35% and still sum to 100%.
    expect(weight([9, 1])).toEqual([5_000, 5_000]);
  });

  it("applies the turnover floor to a large token that barely trades", () => {
    const quiet = token({ marketCapUsd: 900_000_000, organicVolume24hUsd: 100_000 });
    expect(screen(quiet, { now: NOW, incumbent: false }).failures.join(" ")).toMatch(
      /organic volume \$100,000 below \$270,000/,
    );
  });

  it("always adds up to exactly 10000 bps", () => {
    for (const scores of [[1], [1, 1, 1], [7, 3], [100, 33, 33, 33, 1], [5, 4, 3, 2, 1, 1, 1]]) {
      const weights = weight(scores);
      expect(weights.reduce((a, b) => a + b, 0)).toBe(10_000);
    }
  });

  it("caps the largest and floors the smallest", () => {
    const weights = weight([1_000_000, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    expect(Math.max(...weights)).toBeLessThanOrEqual(RULES.maxWeightBps);
    expect(Math.min(...weights)).toBeGreaterThanOrEqual(RULES.minWeightBps);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(10_000);
  });

  it("keeps the ranking it was given", () => {
    const weights = weight([500, 300, 200, 50]);
    for (let i = 1; i < weights.length; i += 1) {
      expect(weights[i - 1]!).toBeGreaterThanOrEqual(weights[i]!);
    }
  });

  it("refuses a set too large for its own floor", () => {
    expect(() => weight(new Array(40).fill(1))).toThrow(/floor/);
  });
});

describe("composition", () => {
  it("cuts to the maximum constituent count by score", () => {
    const universe = Array.from({ length: 15 }, (_, i) =>
      token({
        mint: `mint${i}`,
        symbol: `T${i}`,
        marketCapUsd: 100_000_000 + i * 10_000_000,
        fdvUsd: (100_000_000 + i * 10_000_000) * 2,
        liquidityUsd: 20_000_000,
      }),
    );
    const { constituents } = compose(universe, { now: NOW });
    expect(constituents).toHaveLength(RULES.maxConstituents);
    expect(constituents[0]!.symbol).toBe("T14");
    expect(constituents.reduce((sum, c) => sum + c.weightBps, 0)).toBe(10_000);
  });
});
