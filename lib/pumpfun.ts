/**
 * Pump.fun Token Launch + Percolator Layer Integration (MAINNET)
 *
 * Flow:
 * 1. Upload metadata to IPFS via Pump.fun API
 * 2. Create token on Pump.fun bonding curve via PumpPortal
 * 3. (Optional) User pays ~7 SOL to create Percolator futures market:
 *    a. Allocate slab account (~1MB, owner = percolator program)
 *    b. InitMarket in Hyperp mode (admin-pushed oracle)
 *    c. Create vault ATA for wSOL collateral
 *    d. SetOracleAuthority to creator wallet
 *    e. PushOraclePrice with initial bonding curve price
 *    f. Create matcher context account
 *    g. InitLP with passive matcher
 */

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
} from '@solana/spl-token';
import { PercolatorClient, MAINNET_CONFIG } from './percolator/client';
import { deriveVaultAuthority } from './percolator/solana/pda';

// ============================================================================
// Constants
// ============================================================================

export const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const PUMP_FUN_IPFS_API = 'https://pump.fun/api';        // IPFS metadata upload
export const PUMP_PORTAL_API = 'https://pumpportal.fun/api';     // Token creation & trading

// Percolator slab size: ~1MB to fit up to 4096 accounts (meme-liquid standard)
const SLAB_SIZE = 1_048_576; // 1 MB

// Default risk parameters for new memecoin markets
const DEFAULT_MARKET_PARAMS = {
  maintenanceMarginBps: 500n,        // 5%
  initialMarginBps: 1000n,           // 10%
  tradingFeeBps: 10n,                // 0.10%
  maxAccounts: 4096n,
  newAccountFee: 1_000_000n,         // 0.001 SOL in lamports
  warmupPeriodSlots: 100n,
  riskReductionThreshold: 0n,
  maintenanceFeePerSlot: 0n,
  maxCrankStalenessSlots: 1000n,
  liquidationFeeBps: 100n,           // 1%
  liquidationFeeCap: 100_000_000n,   // 0.1 SOL
  liquidationBufferBps: 50n,         // 0.5%
  minLiquidationAbs: 10_000_000n,    // 0.01 SOL
};

// ============================================================================
// Types
// ============================================================================

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: File | null;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface LaunchResult {
  success: boolean;
  mintAddress?: string;
  signature?: string;
  metadataUri?: string;
  error?: string;
}

export interface FullLaunchResult extends LaunchResult {
  percolatorSlabAddress?: string;
  percolatorMarketCreated: boolean;
}

export interface WalletAdapter {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
}

export interface TradeResult {
  success: boolean;
  signature?: string;
  error?: string;
}

// ============================================================================
// Metadata Upload (Pump.fun IPFS API)
// ============================================================================

export async function uploadMetadata(metadata: TokenMetadata): Promise<{
  metadataUri: string;
  error?: string;
}> {
  try {
    const formData = new FormData();
    formData.append('name', metadata.name);
    formData.append('symbol', metadata.symbol);
    formData.append('description', metadata.description);
    
    if (metadata.image) {
      formData.append('file', metadata.image);
    }
    if (metadata.twitter) formData.append('twitter', metadata.twitter);
    if (metadata.telegram) formData.append('telegram', metadata.telegram);
    if (metadata.website) formData.append('website', metadata.website);

    const response = await fetch(`${PUMP_FUN_IPFS_API}/ipfs`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const data = await response.json();
    return { metadataUri: data.metadataUri };
  } catch (error) {
    return {
      metadataUri: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Token Creation (PumpPortal API)
// ============================================================================

export async function createPumpFunToken(
  wallet: WalletAdapter,
  metadata: TokenMetadata,
  connection: Connection,
  initialBuyAmountSol: number = 0,
): Promise<LaunchResult & { mintKeypair?: Keypair }> {
  try {
    const mintKeypair = Keypair.generate();
    
    const { metadataUri, error: uploadError } = await uploadMetadata(metadata);
    if (uploadError || !metadataUri) {
      return { success: false, error: uploadError || 'Failed to upload metadata' };
    }

    const response = await fetch(`${PUMP_PORTAL_API}/trade-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: wallet.publicKey.toBase58(),
        action: 'create',
        tokenMetadata: {
          name: metadata.name,
          symbol: metadata.symbol,
          uri: metadataUri,
        },
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: 'true',
        amount: initialBuyAmountSol,
        slippage: 10,
        priorityFee: 0.0005,
        pool: 'pump',
      }),
    });

    if (response.status !== 200) {
      const errorText = await response.text();
      return { success: false, error: `PumpPortal API error: ${errorText}` };
    }

    const txData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    
    tx.sign([mintKeypair]);
    const signed = await wallet.signTransaction(tx);
    const rawTx = signed.serialize();
    
    const signature = await connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction(
      { signature, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
      'confirmed'
    );

    return {
      success: true,
      mintAddress: mintKeypair.publicKey.toBase58(),
      signature,
      metadataUri,
      mintKeypair,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// Percolator Market Creation (~7 SOL, paid by user)
// Uses meme-liquid mainnet programs — zero cost to platform
// ============================================================================

export async function createPercolatorMarket(
  wallet: WalletAdapter,
  connection: Connection,
  initialPriceE6: bigint,
): Promise<{
  success: boolean;
  slabAddress?: string;
  error?: string;
}> {
  const programId = MAINNET_CONFIG.programId;
  const matcherProgramId = MAINNET_CONFIG.matcherProgram;
  const collateralMint = MAINNET_CONFIG.collateralMint; // wSOL

  try {
    // ---------------------------------------------------------------
    // Step 1: Create slab account (~1MB, costs ~7 SOL rent)
    // ---------------------------------------------------------------
    const slabKeypair = Keypair.generate();
    const rentExemption = await connection.getMinimumBalanceForRentExemption(SLAB_SIZE);

    console.log(`[Percolator] Slab rent: ${(rentExemption / LAMPORTS_PER_SOL).toFixed(2)} SOL`);

    const createSlabIx = SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: slabKeypair.publicKey,
      lamports: rentExemption,
      space: SLAB_SIZE,
      programId,
    });

    const createSlabTx = new Transaction().add(createSlabIx);
    const bh1 = await connection.getLatestBlockhash('confirmed');
    createSlabTx.recentBlockhash = bh1.blockhash;
    createSlabTx.feePayer = wallet.publicKey;
    createSlabTx.partialSign(slabKeypair);
    const signedCreateSlab = await wallet.signTransaction(createSlabTx);
    const sig1 = await connection.sendRawTransaction(signedCreateSlab.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction(
      { signature: sig1, blockhash: bh1.blockhash, lastValidBlockHeight: bh1.lastValidBlockHeight },
      'confirmed'
    );
    console.log(`[Percolator] ✅ Slab created: ${slabKeypair.publicKey.toBase58()}`);

    // ---------------------------------------------------------------
    // Step 2: Create SPL Token vault for wSOL collateral
    // ---------------------------------------------------------------
    const [vaultPda, vaultBump] = deriveVaultAuthority(programId, slabKeypair.publicKey);
    const vaultAta = await getAssociatedTokenAddress(collateralMint, vaultPda, true);

    const createVaultTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        vaultAta,
        vaultPda,
        collateralMint,
      )
    );
    const bh2 = await connection.getLatestBlockhash('confirmed');
    createVaultTx.recentBlockhash = bh2.blockhash;
    createVaultTx.feePayer = wallet.publicKey;
    const signedVault = await wallet.signTransaction(createVaultTx);
    const sig2 = await connection.sendRawTransaction(signedVault.serialize());
    await connection.confirmTransaction(
      { signature: sig2, blockhash: bh2.blockhash, lastValidBlockHeight: bh2.lastValidBlockHeight },
      'confirmed'
    );
    console.log(`[Percolator] ✅ Vault ATA created: ${vaultAta.toBase58()}`);

    // ---------------------------------------------------------------
    // Step 3: InitMarket in Hyperp mode (all-zeros feed ID)
    // ---------------------------------------------------------------
    const client = new PercolatorClient({
      programId,
      slabPubkey: slabKeypair.publicKey,
      connection,
    });

    const initMarketTx = await client.buildInitMarketTx(
      wallet,
      slabKeypair.publicKey,
      collateralMint,
      vaultAta,
      vaultAta, // dummyAta
      {
        admin: wallet.publicKey,
        collateralMint: collateralMint,
        indexFeedId: '0'.repeat(64), // All zeros = Hyperp mode
        maxStalenessSecs: 3600n,
        confFilterBps: 0,
        invert: 0,
        unitScale: 0,
        initialMarkPriceE6: initialPriceE6,
        ...DEFAULT_MARKET_PARAMS,
      },
    );
    const initResult = await client.sendTransaction(wallet, initMarketTx);
    if (initResult.error) {
      return { success: false, error: `InitMarket failed: ${initResult.error}` };
    }
    console.log(`[Percolator] ✅ Market initialized: ${initResult.signature}`);

    // ---------------------------------------------------------------
    // Step 4: SetOracleAuthority to creator wallet
    // ---------------------------------------------------------------
    const setOracleTx = await client.buildSetOracleAuthorityTx(
      wallet,
      slabKeypair.publicKey,
      wallet.publicKey,
    );
    const oracleResult = await client.sendTransaction(wallet, setOracleTx);
    if (oracleResult.error) {
      console.warn(`[Percolator] SetOracleAuthority warning: ${oracleResult.error}`);
    } else {
      console.log(`[Percolator] ✅ Oracle authority set: ${oracleResult.signature}`);
    }

    // ---------------------------------------------------------------
    // Step 5: Push initial oracle price
    // ---------------------------------------------------------------
    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    const pushPriceTx = await client.buildPushOraclePriceTx(
      wallet,
      slabKeypair.publicKey,
      initialPriceE6,
      timestamp,
    );
    const priceResult = await client.sendTransaction(wallet, pushPriceTx);
    if (priceResult.error) {
      console.warn(`[Percolator] PushOraclePrice warning: ${priceResult.error}`);
    } else {
      console.log(`[Percolator] ✅ Initial price pushed: ${priceResult.signature}`);
    }

    // ---------------------------------------------------------------
    // Step 6: Create matcher context account
    // ---------------------------------------------------------------
    const matcherCtxKeypair = Keypair.generate();
    const matcherCtxSize = 128;
    const matcherCtxRent = await connection.getMinimumBalanceForRentExemption(matcherCtxSize);

    const createMatcherCtxTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: matcherCtxKeypair.publicKey,
        lamports: matcherCtxRent,
        space: matcherCtxSize,
        programId: matcherProgramId,
      })
    );
    const bh3 = await connection.getLatestBlockhash('confirmed');
    createMatcherCtxTx.recentBlockhash = bh3.blockhash;
    createMatcherCtxTx.feePayer = wallet.publicKey;
    createMatcherCtxTx.partialSign(matcherCtxKeypair);
    const signedMatcherCtx = await wallet.signTransaction(createMatcherCtxTx);
    const sig3 = await connection.sendRawTransaction(signedMatcherCtx.serialize());
    await connection.confirmTransaction(
      { signature: sig3, blockhash: bh3.blockhash, lastValidBlockHeight: bh3.lastValidBlockHeight },
      'confirmed'
    );
    console.log(`[Percolator] ✅ Matcher context created: ${matcherCtxKeypair.publicKey.toBase58()}`);

    // ---------------------------------------------------------------
    // Step 7: InitLP with passive matcher
    // ---------------------------------------------------------------
    const initLpTx = await client.buildInitLpTx(
      wallet,
      slabKeypair.publicKey,
      collateralMint,
      vaultAta,
      matcherProgramId,
      matcherCtxKeypair.publicKey,
    );
    const lpResult = await client.sendTransaction(wallet, initLpTx);
    if (lpResult.error) {
      console.warn(`[Percolator] InitLP warning: ${lpResult.error}`);
    } else {
      console.log(`[Percolator] ✅ LP initialized: ${lpResult.signature}`);
    }

    return {
      success: true,
      slabAddress: slabKeypair.publicKey.toBase58(),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// Bonding Curve Price Reader
// ============================================================================

export async function getPumpFunPrice(
  mintAddress: string,
): Promise<{ priceInSol: number; marketCap: number; priceUsd: number; imageUrl?: string } | null> {
  try {
    // Use our server-side proxy to avoid CORS
    const isBrowser = typeof window !== 'undefined';
    const url = isBrowser
      ? `/api/pump?mint=${mintAddress}`
      : `https://frontend-api-v2.pump.fun/coins/${mintAddress}`;

    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data) return null;

    const priceInSol = data.virtual_sol_reserves && data.virtual_token_reserves
      ? data.virtual_sol_reserves / data.virtual_token_reserves
      : 0;
    return {
      priceInSol,
      priceUsd: priceInSol * 170, // rough SOL/USD
      marketCap: data.usd_market_cap || 0,
      imageUrl: data.image_uri || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch image URL from IPFS metadata URI (fallback when Pump.fun API doesn't return image).
 * Uses server-side proxy to avoid CORS.
 */
export async function getImageFromMetadata(metadataUri: string): Promise<string | undefined> {
  try {
    const isBrowser = typeof window !== 'undefined';
    const url = isBrowser
      ? `/api/pump?metadata=${encodeURIComponent(metadataUri)}`
      : metadataUri;

    const resp = await fetch(url);
    if (!resp.ok) return undefined;
    const json = await resp.json();
    return json.image || json.image_url || json.image_uri || undefined;
  } catch {
    return undefined;
  }
}

// ============================================================================
// Pump.fun Buy/Sell (via PumpPortal API)
// ============================================================================

export async function buyTokenOnPumpFun(
  wallet: WalletAdapter,
  connection: Connection,
  tokenMint: string,
  amountSol: number,
  slippage: number = 10,
): Promise<TradeResult> {
  try {
    const response = await fetch(`${PUMP_PORTAL_API}/trade-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: wallet.publicKey.toBase58(),
        action: 'buy',
        mint: tokenMint,
        denominatedInSol: 'true',
        amount: amountSol,
        slippage,
        priorityFee: 0.0005,
        pool: 'pump',
      }),
    });

    if (response.status !== 200) {
      const errorText = await response.text();
      return { success: false, error: `API error: ${errorText}` };
    }

    const txData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    const signed = await wallet.signTransaction(tx);
    const rawTx = signed.serialize();
    
    const signature = await connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction(
      { signature, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
      'confirmed'
    );

    return { success: true, signature };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function sellTokenOnPumpFun(
  wallet: WalletAdapter,
  connection: Connection,
  tokenMint: string,
  tokenAmount: string,
  slippage: number = 10,
): Promise<TradeResult> {
  try {
    const response = await fetch(`${PUMP_PORTAL_API}/trade-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: wallet.publicKey.toBase58(),
        action: 'sell',
        mint: tokenMint,
        denominatedInSol: 'false',
        amount: tokenAmount,
        slippage,
        priorityFee: 0.0005,
        pool: 'pump',
      }),
    });

    if (response.status !== 200) {
      const errorText = await response.text();
      return { success: false, error: `API error: ${errorText}` };
    }

    const txData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    const signed = await wallet.signTransaction(tx);
    const rawTx = signed.serialize();
    
    const signature = await connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction(
      { signature, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
      'confirmed'
    );

    return { success: true, signature };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// Full Launch Flow
// ============================================================================

/**
 * Launch token on Pump.fun only (no futures).
 * Free (only standard ~0.02 SOL Pump.fun fee).
 */
export async function launchTokenOnly(
  wallet: WalletAdapter,
  metadata: TokenMetadata,
  connection: Connection,
): Promise<FullLaunchResult> {
  console.log('[Launch] Creating token on Pump.fun...');
  const tokenResult = await createPumpFunToken(wallet, metadata, connection);
  
  if (!tokenResult.success || !tokenResult.mintAddress) {
    return { ...tokenResult, percolatorMarketCreated: false };
  }

  console.log(`[Launch] ✅ Token created: ${tokenResult.mintAddress}`);
  return {
    ...tokenResult,
    percolatorMarketCreated: false,
  };
}

/**
 * Launch token on Pump.fun + Create Percolator futures market.
 * Costs ~7 SOL for slab rent (paid by user).
 */
export async function launchTokenWithPercolator(
  wallet: WalletAdapter,
  metadata: TokenMetadata,
  connection: Connection,
): Promise<FullLaunchResult> {
  // Step 1: Create token on Pump.fun
  console.log('[Launch] Creating token on Pump.fun...');
  const tokenResult = await createPumpFunToken(wallet, metadata, connection);
  
  if (!tokenResult.success || !tokenResult.mintAddress) {
    return { ...tokenResult, percolatorMarketCreated: false };
  }
  console.log(`[Launch] ✅ Token created: ${tokenResult.mintAddress}`);

  // Step 2: Get initial price from bonding curve
  let initialPriceE6 = 1_000n; // Default: $0.001 in e6
  try {
    const priceData = await getPumpFunPrice(tokenResult.mintAddress);
    if (priceData && priceData.priceInSol > 0) {
      const priceUsd = priceData.priceInSol * 170; // rough SOL/USD
      initialPriceE6 = BigInt(Math.round(priceUsd * 1_000_000));
    }
  } catch (e) {
    console.warn('[Launch] Could not fetch initial price, using default:', e);
  }

  // Step 3: Create Percolator market (~7 SOL)
  console.log('[Launch] Creating Percolator futures layer (~7 SOL)...');
  const percolatorResult = await createPercolatorMarket(
    wallet,
    connection,
    initialPriceE6,
  );

  if (!percolatorResult.success) {
    console.error('[Launch] Percolator market creation failed:', percolatorResult.error);
    return {
      ...tokenResult,
      percolatorMarketCreated: false,
    };
  }

  console.log(`[Launch] ✅ Percolator market created: ${percolatorResult.slabAddress}`);
  return {
    ...tokenResult,
    percolatorMarketCreated: true,
    percolatorSlabAddress: percolatorResult.slabAddress,
  };
}

/**
 * Enable futures for an existing token (create Percolator market after the fact).
 * Costs ~7 SOL for slab rent (paid by user).
 */
export async function enableFuturesForToken(
  wallet: WalletAdapter,
  connection: Connection,
  tokenMint: string,
): Promise<{ success: boolean; slabAddress?: string; error?: string }> {
  // Get current price
  let initialPriceE6 = 1_000n;
  try {
    const priceData = await getPumpFunPrice(tokenMint);
    if (priceData && priceData.priceInSol > 0) {
      const priceUsd = priceData.priceInSol * 170;
      initialPriceE6 = BigInt(Math.round(priceUsd * 1_000_000));
    }
  } catch (e) {
    console.warn('[EnableFutures] Could not fetch price, using default:', e);
  }

  return createPercolatorMarket(wallet, connection, initialPriceE6);
}

/**
 * Get estimated slab rent cost in SOL.
 */
export async function getSlabRentCost(connection: Connection): Promise<number> {
  const rent = await connection.getMinimumBalanceForRentExemption(SLAB_SIZE);
  return rent / LAMPORTS_PER_SOL;
}
