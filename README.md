# Flock DeFi Index (FDI)

The DeFi bluechips of Solana, in one token. This repository is the index's rulebook, the code that
runs it, and every composition it has ever published.

Built on [flock-protocol](https://github.com/nirholas/flock-protocol), the index engine: in-kind
issuance and redemption, no privileged party able to move the fund's assets, and rebalances that
clear as public Dutch auctions.

## Composition, 2026-09-07

| Weight | Symbol | Market cap | On-chain liquidity |
|---|---|---|---|
| 35.00% | RAY | $312.7M | $12.6M |
| 34.63% | JUP | $835.1M | $4.3M |
| 15.77% | KMNO | $136.4M | $1.9M |
| 14.60% | MET | $109.6M | $1.8M |

Screened from Jupiter's 3,203-token verified set, 126 of which carry the `defi` tag. The full
working, including every candidate that failed and why, is in
[`data/screen-2026-09-07.json`](data/screen-2026-09-07.json).

## Run it yourself

```bash
npm install
npm run screen -- --verbose     # live universe, writes data/latest.json and the working
npm test                        # the methodology's arithmetic
npm run propose                 # the exact flock command to launch or rebalance
```

The screen hits Jupiter's public API. No key, no account, and no hardcoded token list: the universe
is a published list and the composition falls out of the rules.

## What is in here

```
METHODOLOGY.md     the rulebook, in English
src/methodology.ts the same rulebook, in code, with every threshold as a named constant
src/screen.ts      runs it against the live universe and writes the result
src/propose.ts     turns a composition into the launch or rebalance command
src/jupiter.ts     the market data client
data/              every composition and every screen, committed and dated
site/              a page that renders the current composition against live prices
test/              the arithmetic: screening, liquidity adjustment, capping, rounding
```

## The two decisions worth arguing about

**Market cap is capped at 25x on-chain liquidity before weighting.** An index has to be able to
rebalance into and out of what it holds, through an auction, on this chain. JUP has the largest
market cap in the index and the second largest weight, because $4.3M of depth cannot support a
$835.1M weighting. Ignoring that is how an index ends up with a paper composition it cannot trade.

**Unknown is not the same as safe.** Jupiter reports mint and freeze authority status as unknown for
some tokens. The screen treats unknown as not disabled and excludes them, which currently costs the
index several large names (JLP, HYPE, SKR). An index that could be frozen or diluted by its
components' issuers is not an index, it is a promise.

## Status

The index is specified and screened; it is not deployed. The engine it runs on is unaudited and
deployed nowhere, and this repository does not hold a launch key. `npm run propose` prints the exact
command that would launch it.

MIT.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=nirholas/flock-defi-index&type=Date)](https://www.star-history.com/#nirholas/flock-defi-index&Date)

<!-- nirholas:watermark -->

---

<p align="center">
  Built by <a href="https://github.com/nirholas"><b>nirholas</b></a> · <a href="https://x.com/nichxbt">@nichxbt</a> · <a href="https://github.com/nirholas">github.com/nirholas</a>
</p>

<!-- /nirholas:watermark -->
