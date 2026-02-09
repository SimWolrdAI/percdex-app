/**
 * Token Registry — persists launched tokens in Supabase
 */

import { supabase } from './supabase'

// ============================================================================
// Types
// ============================================================================

export interface LaunchedToken {
  mint: string
  name: string
  symbol: string
  description: string
  createdAt: number // unix ms
  signature: string
  metadataUri?: string
  imageUrl?: string // token image URL (from IPFS / Pump.fun)
  percolatorSlab?: string // slab address if percolator market was created
  matcherCtx?: string     // matcher context address
  creator: string // wallet pubkey
}

export interface FundraisePledge {
  wallet: string
  amount: number   // SOL
  timestamp: number
  message?: string
}

export interface Fundraise {
  tokenMint: string
  goalSol: number
  createdAt: number
  createdBy: string
  pledges: FundraisePledge[]
  enabled: boolean
  enabledBy?: string
}

// ============================================================================
// Token helpers  (row ↔ object mapping)
// ============================================================================

// DB row → LaunchedToken
function rowToToken(row: any): LaunchedToken {
  return {
    mint: row.mint,
    name: row.name,
    symbol: row.symbol,
    description: row.description ?? '',
    createdAt: row.created_at,
    signature: row.signature ?? '',
    metadataUri: row.metadata_uri ?? undefined,
    imageUrl: row.image_url ?? undefined,
    percolatorSlab: row.percolator_slab ?? undefined,
    matcherCtx: row.matcher_ctx ?? undefined,
    creator: row.creator,
  }
}

// ============================================================================
// Token CRUD
// ============================================================================

export async function getTokens(): Promise<LaunchedToken[]> {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getTokens error:', error)
    return []
  }

  return (data ?? []).map(rowToToken)
}

export async function saveToken(token: LaunchedToken): Promise<void> {
  const { error } = await supabase
    .from('tokens')
    .upsert(
      {
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        description: token.description,
        created_at: token.createdAt,
        signature: token.signature,
        metadata_uri: token.metadataUri ?? null,
        image_url: token.imageUrl ?? null,
        percolator_slab: token.percolatorSlab ?? null,
        matcher_ctx: token.matcherCtx ?? null,
        creator: token.creator,
      },
      { onConflict: 'mint' }
    )

  if (error) {
    console.error('saveToken error:', error)
  }
}

export async function getTokenByMint(mint: string): Promise<LaunchedToken | null> {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('mint', mint)
    .single()

  if (error || !data) return null
  return rowToToken(data)
}

/**
 * Update token's percolator slab after enabling futures
 */
export async function updateTokenSlab(mint: string, slabAddress: string): Promise<void> {
  const { error } = await supabase
    .from('tokens')
    .update({ percolator_slab: slabAddress })
    .eq('mint', mint)

  if (error) {
    console.error('updateTokenSlab error:', error)
  }
}

// ============================================================================
// Community Fundraise
// ============================================================================

export async function getFundraise(tokenMint: string): Promise<Fundraise | null> {
  // Fetch fundraise row
  const { data: fRow, error: fErr } = await supabase
    .from('fundraises')
    .select('*')
    .eq('token_mint', tokenMint)
    .single()

  if (fErr || !fRow) return null

  // Fetch pledges
  const { data: pledgeRows } = await supabase
    .from('fundraise_pledges')
    .select('*')
    .eq('token_mint', tokenMint)
    .order('amount', { ascending: false })

  const pledges: FundraisePledge[] = (pledgeRows ?? []).map((p: any) => ({
    wallet: p.wallet,
    amount: p.amount,
    timestamp: p.pledged_at,
    message: p.message ?? undefined,
  }))

  return {
    tokenMint: fRow.token_mint,
    goalSol: fRow.goal_sol,
    createdAt: fRow.created_at,
    createdBy: fRow.created_by,
    pledges,
    enabled: fRow.enabled,
    enabledBy: fRow.enabled_by ?? undefined,
  }
}

export async function createFundraise(
  tokenMint: string,
  goalSol: number,
  createdBy: string
): Promise<Fundraise> {
  // Check if already exists
  const existing = await getFundraise(tokenMint)
  if (existing) return existing

  const now = Date.now()

  const { error } = await supabase.from('fundraises').insert({
    token_mint: tokenMint,
    goal_sol: goalSol,
    created_at: now,
    created_by: createdBy,
    enabled: false,
  })

  if (error) {
    console.error('createFundraise error:', error)
  }

  return {
    tokenMint,
    goalSol,
    createdAt: now,
    createdBy,
    pledges: [],
    enabled: false,
  }
}

export async function addPledge(
  tokenMint: string,
  pledge: FundraisePledge
): Promise<Fundraise | null> {
  // Upsert pledge (one per wallet per fundraise)
  const { error } = await supabase.from('fundraise_pledges').upsert(
    {
      token_mint: tokenMint,
      wallet: pledge.wallet,
      amount: pledge.amount,
      pledged_at: pledge.timestamp,
      message: pledge.message ?? null,
    },
    { onConflict: 'token_mint,wallet' }
  )

  if (error) {
    console.error('addPledge error:', error)
    return null
  }

  // Return updated fundraise
  return getFundraise(tokenMint)
}

export async function markFundraiseEnabled(
  tokenMint: string,
  enabledBy: string
): Promise<void> {
  const { error } = await supabase
    .from('fundraises')
    .update({ enabled: true, enabled_by: enabledBy })
    .eq('token_mint', tokenMint)

  if (error) {
    console.error('markFundraiseEnabled error:', error)
  }
}

export function getFundraiseTotalPledged(fundraise: Fundraise): number {
  return fundraise.pledges.reduce((sum, p) => sum + p.amount, 0)
}
