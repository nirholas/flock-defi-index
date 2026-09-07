/**
 * Jupiter's public token API: the universe, and everything the methodology screens on.
 *
 * Vendored rather than imported from `@flock/sdk` because this repository has to stand on its own
 * (the SDK is not published yet) and because a methodology should be auditable without pulling in
 * the protocol it happens to run on. The canonical copy lives in
 * `flock-protocol/packages/sdk/src/prices.ts`; keep the two in step.
 */

const BASE = "https://lite-api.jup.ag/tokens/v2";
const PRICE = "https://lite-api.jup.ag/price/v3";

export interface TokenStats {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  usdPrice: number;
  marketCapUsd: number;
  fdvUsd: number;
  circulatingSupply: number;
  liquidityUsd: number;
  holderCount: number;
  organicScore: number;
  organicScoreLabel: string;
  isVerified: boolean;
  tags: string[];
  tokenProgram: string;
  firstPoolCreatedAt: string | null;
  /** `undefined` in the source means "not known to be disabled", which is not the same as disabled. */
  mintAuthorityDisabled: boolean;
  freezeAuthorityDisabled: boolean;
  topHoldersPercentage: number | null;
  devMints: number | null;
  volume24hUsd: number;
  organicVolume24hUsd: number;
  priceChange24h: number;
  holderChange24h: number;
}

export const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

async function getJson(url: string, attempts = 3): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`${url} returned ${response.status}`);
      }
      last = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export function normalize(raw: Record<string, any>): TokenStats {
  const stats24h = (raw.stats24h ?? {}) as Record<string, number>;
  const audit = (raw.audit ?? {}) as Record<string, unknown>;
  return {
    mint: String(raw.id),
    symbol: String(raw.symbol ?? ""),
    name: String(raw.name ?? ""),
    decimals: Number(raw.decimals ?? 0),
    usdPrice: Number(raw.usdPrice ?? 0),
    marketCapUsd: Number(raw.mcap ?? 0),
    fdvUsd: Number(raw.fdv ?? 0),
    circulatingSupply: Number(raw.circSupply ?? 0),
    liquidityUsd: Number(raw.liquidity ?? 0),
    holderCount: Number(raw.holderCount ?? 0),
    organicScore: Number(raw.organicScore ?? 0),
    organicScoreLabel: String(raw.organicScoreLabel ?? "unknown"),
    isVerified: Boolean(raw.isVerified),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    tokenProgram: String(raw.tokenProgram ?? ""),
    firstPoolCreatedAt: raw.firstPool?.createdAt ? String(raw.firstPool.createdAt) : null,
    mintAuthorityDisabled: audit.mintAuthorityDisabled === true,
    freezeAuthorityDisabled: audit.freezeAuthorityDisabled === true,
    topHoldersPercentage:
      typeof audit.topHoldersPercentage === "number" ? audit.topHoldersPercentage : null,
    devMints: typeof audit.devMints === "number" ? audit.devMints : null,
    volume24hUsd: Number(stats24h.buyVolume ?? 0) + Number(stats24h.sellVolume ?? 0),
    organicVolume24hUsd:
      Number(stats24h.buyOrganicVolume ?? 0) + Number(stats24h.sellOrganicVolume ?? 0),
    priceChange24h: Number(stats24h.priceChange ?? 0),
    holderChange24h: Number(stats24h.holderChange ?? 0),
  };
}

/**
 * The whole verified token set, with stats, in one request.
 *
 * "Verified" is Jupiter's own list, the same one wallets use to decide what to show a user. Using
 * it as the universe means the index can never include something a wallet would warn about, and it
 * means the universe is defined by a published list rather than by whatever this repository
 * happened to hardcode.
 */
export async function fetchVerifiedUniverse(): Promise<TokenStats[]> {
  const payload = await getJson(`${BASE}/tag?query=verified`);
  if (!Array.isArray(payload)) throw new Error("verified tag did not return a list");
  return payload.map((raw) => normalize(raw as Record<string, any>));
}

export async function fetchTokens(mints: string[]): Promise<Map<string, TokenStats>> {
  const out = new Map<string, TokenStats>();
  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100);
    const payload = await getJson(`${BASE}/search?query=${batch.join(",")}`);
    if (!Array.isArray(payload)) continue;
    for (const raw of payload) {
      const stats = normalize(raw as Record<string, any>);
      out.set(stats.mint, stats);
    }
  }
  return out;
}

export async function fetchPrices(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < mints.length; i += 50) {
    const batch = mints.slice(i, i + 50);
    const payload = (await getJson(`${PRICE}?ids=${batch.join(",")}`)) as Record<string, any>;
    for (const [mint, value] of Object.entries(payload ?? {})) {
      const price = Number(value?.usdPrice);
      if (Number.isFinite(price) && price > 0) out.set(mint, price);
    }
  }
  return out;
}
