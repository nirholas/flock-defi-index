#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { VERSION } from "./methodology.js";

/**
 * Turn the current screen into the exact commands that launch or rebalance the index, and into a
 * rebalance note anyone can check against the chain afterwards.
 *
 * This step is deliberately separate from `screen`. The screen decides what the index should hold;
 * this decides what to do about it, and the two happen at different cadences: the screen runs any
 * time, the proposal runs on the schedule the methodology publishes.
 */

const { values } = parseArgs({
  options: {
    "index-mint": { type: "string" },
    duration: { type: "string" },
    "start-premium-bps": { type: "string" },
    "end-premium-bps": { type: "string" },
    "max-nav-loss-bps": { type: "string" },
    "nav-per-token": { type: "string" },
    "no-write": { type: "boolean" },
  },
});

const dataDir = new URL("../data/", import.meta.url).pathname;
const latest = JSON.parse(readFileSync(join(dataDir, "latest.json"), "utf8"));
const constituents: Array<{ mint: string; symbol: string; weightBps: number }> = latest.constituents;
if (constituents.length === 0) throw new Error("data/latest.json has no constituents; run the screen");

const weights = constituents.map((c) => `${c.mint}=${c.weightBps}`).join(",");
const total = constituents.reduce((sum, c) => sum + c.weightBps, 0);
if (total !== 10_000) throw new Error(`weights add up to ${total} bps, not 10000`);

const auction = {
  duration: Number(values.duration ?? 7_200),
  startPremiumBps: Number(values["start-premium-bps"] ?? -50),
  endPremiumBps: Number(values["end-premium-bps"] ?? 150),
  maxNavLossBps: Number(values["max-nav-loss-bps"] ?? 100),
};
const navPerToken = Number(values["nav-per-token"] ?? latest.index.navPerTokenUsd ?? 100);
const indexMint = values["index-mint"] ?? process.env.FDI_INDEX_MINT;

console.log(`Flock DeFi Index, methodology ${VERSION}`);
console.log(`${constituents.length} constituents, ${total} bps:`);
for (const c of constituents) {
  console.log(`  ${(c.weightBps / 100).toFixed(2).padStart(6)}%  ${c.symbol.padEnd(8)} ${c.mint}`);
}
console.log("");

if (!indexMint) {
  console.log("No index mint yet. Launch it with:\n");
  console.log(
    [
      "flock create",
      `  --name ${JSON.stringify(latest.index.name)} --symbol ${latest.index.symbol}`,
      `  --weights ${weights}`,
      `  --nav-per-token ${navPerToken}`,
      "  --streaming-fee-bps 95 --rebalance-delay 86400 --max-premium-bps 300",
      "  --governor <multisig> --manager <committee> --fee-recipient <treasury>",
    ].join(" \\\n"),
  );
} else {
  console.log("Rebalance with:\n");
  console.log(
    [
      `flock propose ${indexMint}`,
      `  --weights ${weights}`,
      `  --duration ${auction.duration}`,
      `  --start-premium-bps ${auction.startPremiumBps} --end-premium-bps ${auction.endPremiumBps}`,
      `  --max-nav-loss-bps ${auction.maxNavLossBps}`,
      "  --dry-run",
    ].join(" \\\n"),
  );
  console.log("\nDrop --dry-run once the printed per-component move looks right.");
}

if (!values["no-write"]) {
  const stamp = new Date().toISOString().slice(0, 10);
  const note = {
    index: latest.index,
    methodologyVersion: VERSION,
    preparedAt: new Date().toISOString(),
    screenGeneratedAt: latest.generatedAt,
    indexMint: indexMint ?? null,
    auction,
    weights: constituents.map((c) => ({ mint: c.mint, symbol: c.symbol, weightBps: c.weightBps })),
    weightsArgument: weights,
  };
  mkdirSync(join(dataDir, "proposals"), { recursive: true });
  const file = join(dataDir, "proposals", `${stamp}.json`);
  writeFileSync(file, `${JSON.stringify(note, null, 2)}\n`);
  console.log(`\nwrote data/proposals/${stamp}.json`);
}
