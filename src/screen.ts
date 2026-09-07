#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { fetchVerifiedUniverse } from "./jupiter.js";
import { RULES, VERSION, compose } from "./methodology.js";

/**
 * Run the methodology against the live universe and write the result.
 *
 * Output is committed. An index whose composition cannot be reproduced from a commit is an index
 * nobody can check, so every run leaves both the answer (`data/latest.json`) and the working
 * (`data/screen-<date>.json`, every candidate with every reason it failed).
 */

const { values } = parseArgs({
  options: {
    "no-write": { type: "boolean" },
    verbose: { type: "boolean" },
    date: { type: "string" },
  },
});

const dataDir = new URL("../data/", import.meta.url).pathname;
const now = values.date ? new Date(values.date) : new Date();
const stamp = now.toISOString().slice(0, 10);

function previousConstituents(): string[] {
  const latest = join(dataDir, "latest.json");
  if (!existsSync(latest)) return [];
  try {
    const parsed = JSON.parse(readFileSync(latest, "utf8"));
    return (parsed.constituents ?? []).map((c: { mint: string }) => c.mint);
  } catch {
    return [];
  }
}

const universe = await fetchVerifiedUniverse();
const incumbents = previousConstituents();
const candidates = universe.filter((token) => token.tags.includes(RULES.categoryTag));
const { constituents, screened } = compose(universe, { now, incumbents });

const navPerToken = 100;
const result = {
  index: { name: "Flock DeFi Index", symbol: "FDI", navPerTokenUsd: navPerToken },
  methodologyVersion: VERSION,
  generatedAt: now.toISOString(),
  source: "Jupiter tokens/v2 verified set",
  universeSize: universe.length,
  candidateSize: candidates.length,
  rules: RULES,
  constituents,
  totalWeightBps: constituents.reduce((sum, c) => sum + c.weightBps, 0),
  indexMarketCapUsd: constituents.reduce((sum, c) => sum + c.marketCapUsd, 0),
  indexLiquidityUsd: constituents.reduce((sum, c) => sum + c.liquidityUsd, 0),
};

const nearMisses = screened
  .filter((entry) => !entry.passed && entry.token.tags.includes(RULES.categoryTag))
  .slice(0, 40)
  .map((entry) => ({
    mint: entry.token.mint,
    symbol: entry.token.symbol,
    marketCapUsd: entry.token.marketCapUsd,
    liquidityUsd: entry.token.liquidityUsd,
    holders: entry.token.holderCount,
    organicScore: entry.token.organicScore,
    ageDays: entry.ageDays === null ? null : Math.round(entry.ageDays),
    failures: entry.failures,
  }));

console.log(`Flock DeFi Index, methodology ${VERSION}, ${stamp}`);
console.log(`universe ${universe.length} verified tokens, ${candidates.length} tagged ${RULES.categoryTag}`);
console.log("");
console.log("  weight  symbol       market cap      liquidity   score (liq-adjusted)");
for (const c of constituents) {
  console.log(
    `${(c.weightBps / 100).toFixed(2).padStart(7)}%  ${c.symbol.padEnd(8)} ` +
      `${usd(c.marketCapUsd).padStart(14)} ${usd(c.liquidityUsd).padStart(14)} ${usd(c.score).padStart(14)}`,
  );
}
console.log("");
console.log(`total ${result.totalWeightBps} bps across ${constituents.length} constituents`);

if (values.verbose) {
  console.log("\nnear misses:");
  for (const miss of nearMisses.slice(0, 15)) {
    console.log(`  ${miss.symbol.padEnd(10)} ${miss.failures.join("; ")}`);
  }
}

if (!values["no-write"]) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "latest.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(dataDir, `weights-${stamp}.json`), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(
    join(dataDir, `screen-${stamp}.json`),
    `${JSON.stringify({ generatedAt: result.generatedAt, rules: RULES, nearMisses }, null, 2)}\n`,
  );
  // The site is a static folder that should work when opened on its own, so it gets its own copy
  // rather than reaching up into data/ with a relative path that breaks the moment it is deployed.
  const siteDir = new URL("../site/", import.meta.url).pathname;
  mkdirSync(siteDir, { recursive: true });
  writeFileSync(join(siteDir, "data.json"), `${JSON.stringify({ ...result, nearMisses }, null, 2)}\n`);
  console.log(`\nwrote data/latest.json, data/weights-${stamp}.json, data/screen-${stamp}.json, site/data.json`);
}

function usd(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}
