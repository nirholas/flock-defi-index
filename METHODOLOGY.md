# Flock DeFi Index (FDI) methodology

**Version 1.0.0.** This document and [`src/methodology.ts`](src/methodology.ts) are the same rules
written twice: once for people, once for a machine. Every number below is a constant in `RULES`, so
any composition can be reproduced from a commit hash and a date.

## What the index is for

FDI holds the equity of Solana's DeFi protocols: the tokens that represent a claim on a working
protocol's governance and economics. One token, one holding, in-kind issuance and redemption, and a
composition that anyone can recompute from public data.

It is not a basket of "Solana things". Liquid staking receipts are SOL exposure. Tokenized equities
are equity exposure. Stablecoins are dollars. All three are excluded by tag, because an index that
mixes them is not measuring what it says it measures.

## Universe

Every token in **Jupiter's verified set** (3,203 tokens as of 2026-09-07) carrying the `defi` tag
(126 of them). Verified is the same list wallets use to decide what to show a user, so the index can
never hold something a wallet would warn about, and the universe is defined by a published list
rather than by whatever this repository happened to hardcode.

## Eligibility

A token is eligible when **all** of the following hold. Failures are reported in full, not just the
first one, so a near miss is visible in `data/screen-<date>.json`.

### Custody and control (never relaxed)

| Rule | Why |
|---|---|
| Token program is SPL Token (classic) | The index program custodies classic SPL Token. Token-2022 mints, including PUMP, cannot be held at all today. See "Known limitations". |
| Mint authority provably disabled | An issuer who can mint can dilute the index's holding to nothing. Jupiter reports this as unknown for some tokens; unknown is treated as **not** disabled. |
| Freeze authority provably disabled | An issuer who can freeze can trap the fund's vault, which makes redemption impossible for every holder. |
| Verified on Jupiter | The universe definition above. |
| No excluded tag | `lst`, `original-lst`, `stable`, `rwa`, `stocks`, `xstocks`, `prestocks`, `equities`, `token-2022`. |

### Size, depth and quality

| Rule | Threshold |
|---|---|
| Circulating market cap | at least $50M |
| On-chain liquidity | at least $1M |
| Holders | at least 20,000 |
| Age since first pool | at least 180 days |
| Jupiter organic score | at least 50 |
| Organic 24h volume | at least the greater of $50k and 3 bps of market cap |
| FDV to market cap | at most 4x |

The FDV rule keeps out tokens that are mostly an unlock schedule: a float that is a fifth of supply
means an index buying it is buying the sell pressure with it.

**Calibration note.** The organic-volume rule started as a flat $250k a day. Run against the real
universe on 2026-09-07 that excluded working protocol tokens (KMNO, MET) on an ordinary day while
adding nothing the liquidity and organic-score screens do not already catch. It was replaced with
the absolute-or-turnover pair above, which keeps out tokens nobody trades without punishing a mid-cap
for being a mid-cap. Thresholds in this methodology are calibrated against data and the reasoning is
recorded; they are not guessed and then defended.

### Retention buffer

A **current** constituent is held while it still clears **80%** of each numeric threshold. Turnover
costs holders real money in auction premiums, so the bar to leave is deliberately lower than the bar
to enter. The binary custody rules above get no such slack: a component the fund cannot safely hold
is not a near miss.

## Weighting

1. **Score** each constituent at `min(market cap, 25 x on-chain liquidity)`.
   A $400M token with $300k of depth cannot be bought or sold at anything like $400M, and an index
   that weights it as though it could is an index that cannot rebalance. The liquidity cap makes the
   weight reflect what the auction can actually move.
2. **Rank** by score and take the top **10**.
3. **Cap at 35%, floor at 3%**, applied the way an index committee applies a cap: fix whatever
   breaches it, re-weight the rest proportionally over what is left, and repeat, because capping one
   name raises the others. Where a cap is arithmetically impossible (four names cannot each hold at
   most 35% and sum to 100%), the binding constraint is `1/n` and the result is equal weight.
4. **Round** to whole basis points by largest remainder, so the weights sum to exactly 10000.

## Schedule

| Event | Cadence | What happens |
|---|---|---|
| Screen | continuous, on demand | `npm run screen` writes the composition and the full working |
| Rebalance | monthly, first Tuesday | Weights are recomputed and published as a Dutch auction |
| Reconstitution | quarterly | Constituents may enter or leave, subject to the retention buffer |

A rebalance is proposed with a 24-hour timelock, a 2-hour auction, a premium band of -50 to +150 bps,
and a NAV floor of 100 bps. Those parameters are in every `data/proposals/<date>.json`.

Because the index program fixes the component set when an index is sealed, a **reconstitution that
adds or removes a name is a new index token**, and holders migrate by redeeming and re-issuing. This
is the same constraint Index Coop works under on Ethereum, and it is why the component set is chosen
to be stable and the weights are what move monthly.

## Composition as of 2026-09-07

| Weight | Symbol | Market cap | Liquidity | Score |
|---|---|---|---|---|
| 35.00% | RAY | $312.7M | $12.6M | $312.7M |
| 34.63% | JUP | $835.1M | $4.3M | $106.6M |
| 15.77% | KMNO | $136.4M | $1.9M | $48.6M |
| 14.60% | MET | $109.6M | $1.8M | $44.9M |

JUP is the largest name by market cap and the second by weight: with $4.3M of on-chain depth against
a $835.1M cap, the liquidity adjustment scores it at $106.6M. That is the rule doing exactly what it
is for.

## Known limitations

- **Token-2022 is not investable yet.** PUMP, the largest DeFi token in the universe by market cap,
  is a Token-2022 mint and the index program only custodies classic SPL Token. This is the single
  biggest gap in the methodology's coverage and it is a program limitation, not a judgement about
  the asset. Supporting Token-2022 (and deciding which of its extensions are safe for a fund to
  hold) is the top item on the engine's roadmap.
- **Off-chain liquidity is not counted.** Depth on centralised venues does not help an on-chain
  auction, so it is ignored on purpose. A token that trades heavily on exchanges and thinly on
  Solana will score low, and should.
- **Jupiter is a single source.** Market cap, liquidity, holders and organic score all come from one
  provider. A second source would make the screen more robust, and is the next improvement here.
