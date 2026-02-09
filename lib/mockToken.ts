/**
 * Mock PercDex token constants & seeder
 *
 * This token shows up on the home page with leverage enabled.
 * All trading is mock (simulated via Phantom message signing).
 */

import { saveToken, getTokenByMint } from './tokenRegistry'

export const MOCK_MINT = 'Bic2HKb2LDEwsjpMZspX6VjRs8EVEPSeMJy1uzQYpump'
export const MOCK_SLAB = 'PercDxS1abMock7777777777777777777777777777777'
export const MOCK_MATCHER_CTX = 'PercDxMatcherMock9999999999999999999999999999'

export function isMockToken(mint: string): boolean {
  return mint === MOCK_MINT
}

/**
 * Ensure the mock PercDex token exists in the database.
 * Safe to call multiple times (upsert).
 */
export async function seedMockToken(): Promise<void> {
  const existing = await getTokenByMint(MOCK_MINT)
  if (existing) return // already seeded

  await saveToken({
    mint: MOCK_MINT,
    name: 'Percolator Dex',
    symbol: 'PercDex',
    description: 'PercDex — Leveraged trading for every memecoin on Solana. Long/short with up to 20x leverage.',
    createdAt: Date.now(),
    signature: 'mock_genesis_signature',
    metadataUri: undefined,
    imageUrl: '/icon.jpeg', // our skull icon
    percolatorSlab: MOCK_SLAB, // marks as leverage-enabled
    matcherCtx: MOCK_MATCHER_CTX,
    creator: 'PercDex',
  })

  console.log('[MockToken] PercDex token seeded into database')
}

