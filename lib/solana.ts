/**
 * Solana integration — Mainnet connection + Percolator client
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { PercolatorClient, MAINNET_CONFIG } from './percolator/client';
import type { WalletAdapter, TxResult, MarketInfo, PositionInfo } from './percolator/client';

// ============================================================================
// Connection
// ============================================================================

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';

let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(RPC_URL, 'confirmed');
  }
  return _connection;
}

// ============================================================================
// Percolator Client Factory (per-slab)
// ============================================================================

export function getPercolatorClient(slabPubkey: PublicKey): PercolatorClient {
  return new PercolatorClient({
    programId: MAINNET_CONFIG.programId,
    slabPubkey,
    connection: getConnection(),
  });
}

// Re-export mainnet config & types
export { MAINNET_CONFIG } from './percolator/client';
export type { WalletAdapter, TxResult, MarketInfo, PositionInfo };

// ============================================================================
// Token balance helper
// ============================================================================

export async function getTokenBalance(
  connection: Connection,
  walletPubkey: PublicKey,
  tokenMint: string,
): Promise<number> {
  try {
    const mintPk = new PublicKey(tokenMint);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
      mint: mintPk,
    });
    if (tokenAccounts.value.length === 0) return 0;
    const info = tokenAccounts.value[0].account.data.parsed.info;
    return info.tokenAmount.uiAmount || 0;
  } catch {
    return 0;
  }
}
