/**
 * PercolatorClient — High-level client for frontend integration
 * Uses wallet adapter (signTransaction) instead of raw Keypair
 */
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  type SendOptions,
} from '@solana/web3.js';

import {
  encodeInitMarket,
  encodeInitUser,
  encodeInitLP,
  encodeDepositCollateral,
  encodeWithdrawCollateral,
  encodeTradeCpi,
  encodeTradeNoCpi,
  encodeKeeperCrank,
  encodeCloseAccount,
  encodeTopUpInsurance,
  encodeSetOracleAuthority,
  encodePushOraclePrice,
  type InitMarketArgs,
  type InitLPArgs,
} from './abi/instructions';

import {
  buildAccountMetas,
  WELL_KNOWN,
  ACCOUNTS_INIT_MARKET,
  ACCOUNTS_INIT_USER,
  ACCOUNTS_INIT_LP,
  ACCOUNTS_DEPOSIT_COLLATERAL,
  ACCOUNTS_WITHDRAW_COLLATERAL,
  ACCOUNTS_TRADE_CPI,
  ACCOUNTS_TRADE_NOCPI,
  ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_CLOSE_ACCOUNT,
  ACCOUNTS_TOPUP_INSURANCE,
  ACCOUNTS_SET_ORACLE_AUTHORITY,
  ACCOUNTS_PUSH_ORACLE_PRICE,
} from './abi/accounts';

import { deriveVaultAuthority, deriveLpPda } from './solana/pda';
import { fetchSlab, parseConfig, parseAccount, parseAllAccounts, parseEngine, parseUsedIndices, AccountKind } from './solana/slab';
import type { MarketConfig, Account, EngineState } from './solana/slab';
import { getAta } from './solana/ata';
import { parseErrorFromLogs } from './abi/errors';

// ============================================================================
// Mainnet Config — meme-liquid deployed programs (zero cost to us)
// ============================================================================
export const MAINNET_CONFIG = {
  programId: new PublicKey('DP2EbA2v6rmkmNieZpnjumXosuXQ93r9jyb9eSzzkf1x'),
  matcherProgram: new PublicKey('FbTaGPKcrgKXQx3t5WekJcAyH5cL9s8kvVccvZC3jg8r'),
  collateralMint: new PublicKey('So11111111111111111111111111111111111111112'), // Wrapped SOL
};

// ============================================================================
// Types
// ============================================================================

export interface WalletAdapter {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
}

export interface PercolatorConfig {
  programId: PublicKey;
  slabPubkey: PublicKey;
  connection: Connection;
}

export interface TxResult {
  signature: string;
  error: string | null;
  hint?: string;
}

export interface MarketInfo {
  config: MarketConfig;
  engine: EngineState;
  accounts: { idx: number; account: Account }[];
}

export interface PositionInfo {
  index: number;
  kind: 'user' | 'lp';
  owner: string;
  capital: bigint;
  pnl: bigint;
  positionSize: bigint;
  entryPrice: bigint;
  leverage: number;
}


// ============================================================================
// Client Class
// ============================================================================

export class PercolatorClient {
  public connection: Connection;
  public programId: PublicKey;
  public slabPubkey: PublicKey;
  private slabData: Buffer | null = null;
  private marketConfig: MarketConfig | null = null;

  constructor(config: PercolatorConfig) {
    this.connection = config.connection;
    this.programId = config.programId;
    this.slabPubkey = config.slabPubkey;
  }

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------

  async refreshSlab(): Promise<Buffer> {
    this.slabData = await fetchSlab(this.connection, this.slabPubkey);
    this.marketConfig = parseConfig(this.slabData);
    return this.slabData;
  }

  async getMarketConfig(): Promise<MarketConfig> {
    if (!this.marketConfig) await this.refreshSlab();
    return this.marketConfig!;
  }

  async getEngineState(): Promise<EngineState> {
    if (!this.slabData) await this.refreshSlab();
    return parseEngine(this.slabData!);
  }

  async getMarketInfo(): Promise<MarketInfo> {
    const data = await this.refreshSlab();
    return {
      config: parseConfig(data),
      engine: parseEngine(data),
      accounts: parseAllAccounts(data),
    };
  }

  async findUserAccount(owner: PublicKey): Promise<{ idx: number; account: Account } | null> {
    const data = await this.refreshSlab();
    const accounts = parseAllAccounts(data);
    const found = accounts.find(a => a.account.owner.equals(owner));
    return found || null;
  }

  async getAllPositions(): Promise<PositionInfo[]> {
    const data = await this.refreshSlab();
    const accounts = parseAllAccounts(data);
    const engine = parseEngine(data);
    
    return accounts
      .filter(a => a.account.positionSize !== 0n)
      .map(a => {
        const notional = a.account.entryPrice > 0n 
          ? (abs128(a.account.positionSize) * a.account.entryPrice) / 1_000_000n
          : 0n;
        const leverage = a.account.capital > 0n && notional > 0n
          ? Number(notional) / Number(a.account.capital)
          : 0;
        
        return {
          index: a.idx,
          kind: a.account.kind === AccountKind.LP ? 'lp' as const : 'user' as const,
          owner: a.account.owner.toBase58(),
          capital: a.account.capital,
          pnl: a.account.pnl,
          positionSize: a.account.positionSize,
          entryPrice: a.account.entryPrice,
          leverage,
        };
      });
  }

  // --------------------------------------------------------------------------
  // Transaction building (for wallet adapter — no raw Keypair needed)
  // --------------------------------------------------------------------------

  async buildInitUserTx(wallet: WalletAdapter, feePayment: bigint = 1_000_000n): Promise<Transaction> {
    const config = await this.getMarketConfig();
    const userAta = await getAta(wallet.publicKey, config.collateralMint);

    const ixData = encodeInitUser({ feePayment: feePayment.toString() });
    const keys = buildAccountMetas(ACCOUNTS_INIT_USER, [
      wallet.publicKey,
      this.slabPubkey,
      userAta,
      config.vaultPubkey,
      WELL_KNOWN.tokenProgram,
    ]);

    return this.buildTransaction(
      new TransactionInstruction({ programId: this.programId, keys, data: ixData })
    );
  }

  async buildDepositTx(wallet: WalletAdapter, userIdx: number, amount: bigint): Promise<Transaction> {
    const config = await this.getMarketConfig();
    const userAta = await getAta(wallet.publicKey, config.collateralMint);

    const ixData = encodeDepositCollateral({ userIdx, amount: amount.toString() });
    const keys = buildAccountMetas(ACCOUNTS_DEPOSIT_COLLATERAL, [
      wallet.publicKey,
      this.slabPubkey,
      userAta,
      config.vaultPubkey,
      WELL_KNOWN.tokenProgram,
      WELL_KNOWN.clock,
    ]);

    return this.buildTransaction(
      new TransactionInstruction({ programId: this.programId, keys, data: ixData })
    );
  }

  async buildWithdrawTx(wallet: WalletAdapter, userIdx: number, amount: bigint): Promise<Transaction> {
    const config = await this.getMarketConfig();
    const userAta = await getAta(wallet.publicKey, config.collateralMint);
    const [vaultPda] = deriveVaultAuthority(this.programId, this.slabPubkey);

    const ixData = encodeWithdrawCollateral({ userIdx, amount: amount.toString() });
    const keys = buildAccountMetas(ACCOUNTS_WITHDRAW_COLLATERAL, [
      wallet.publicKey,
      this.slabPubkey,
      config.vaultPubkey,
      userAta,
      vaultPda,
      WELL_KNOWN.tokenProgram,
      WELL_KNOWN.clock,
      config.indexFeedId,
    ]);

    return this.buildTransaction(
      new TransactionInstruction({ programId: this.programId, keys, data: ixData })
    );
  }

  async buildTradeCpiTx(
    wallet: WalletAdapter,
    userIdx: number,
    lpIdx: number,
    size: bigint,
    matcherProgram: PublicKey,
    matcherCtx: PublicKey,
  ): Promise<Transaction> {
    const data = await this.refreshSlab();
    const config = parseConfig(data);
    const lpAccount = parseAccount(data, lpIdx);
    const [lpPda] = deriveLpPda(this.programId, this.slabPubkey, lpIdx);

    const ixData = encodeTradeCpi({ lpIdx, userIdx, size: size.toString() });
    const keys = buildAccountMetas(ACCOUNTS_TRADE_CPI, [
      wallet.publicKey,
      lpAccount.owner,
      this.slabPubkey,
      WELL_KNOWN.clock,
      config.indexFeedId,
      matcherProgram,
      matcherCtx,
      lpPda,
    ]);

    return this.buildTransaction(
      new TransactionInstruction({ programId: this.programId, keys, data: ixData })
    );
  }

  async buildTradeNoCpiTx(
    wallet: WalletAdapter,
    userIdx: number,
    lpIdx: number,
    size: bigint,
    lpOwnerWallet?: WalletAdapter,
  ): Promise<Transaction> {
    const config = await this.getMarketConfig();
    const data = await this.refreshSlab();
    const lpAccount = parseAccount(data, lpIdx);

    const ixData = encodeTradeNoCpi({ lpIdx, userIdx, size: size.toString() });
    const keys = buildAccountMetas(ACCOUNTS_TRADE_NOCPI, [
      wallet.publicKey,
      lpOwnerWallet?.publicKey || lpAccount.owner,
      this.slabPubkey,
      WELL_KNOWN.clock,
      config.indexFeedId,
    ]);

    return this.buildTransaction(
      new TransactionInstruction({ programId: this.programId, keys, data: ixData })
    );
  }

  async buildKeeperCrankTx(wallet: WalletAdapter, callerIdx: number = 0): Promise<Transaction> {
    const config = await this.getMarketConfig();

    const ixData = encodeKeeperCrank({ callerIdx, allowPanic: false });
    const keys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
      wallet.publicKey,
      this.slabPubkey,
      WELL_KNOWN.clock,
      config.indexFeedId,
    ]);

    return this.buildTransaction(
      new TransactionInstruction({ programId: this.programId, keys, data: ixData })
    );
  }

  async buildCloseAccountTx(wallet: WalletAdapter, userIdx: number): Promise<Transaction> {
    const config = await this.getMarketConfig();
    const userAta = await getAta(wallet.publicKey, config.collateralMint);
    const [vaultPda] = deriveVaultAuthority(this.programId, this.slabPubkey);

    const ixData = encodeCloseAccount({ userIdx });
    const keys = buildAccountMetas(ACCOUNTS_CLOSE_ACCOUNT, [
      wallet.publicKey,
      this.slabPubkey,
      config.vaultPubkey,
      userAta,
      vaultPda,
      WELL_KNOWN.tokenProgram,
      WELL_KNOWN.clock,
      config.indexFeedId,
    ]);

    return this.buildTransaction(
      new TransactionInstruction({ programId: this.programId, keys, data: ixData })
    );
  }

  // --------------------------------------------------------------------------
  // Market Creation (admin-level operations)
  // --------------------------------------------------------------------------

  /**
   * Build InitMarket transaction. Requires a pre-allocated slab account.
   * The slab must be created via SystemProgram.createAccount before calling this.
   */
  async buildInitMarketTx(
    wallet: WalletAdapter,
    slabPubkey: PublicKey,
    collateralMint: PublicKey,
    vaultPubkey: PublicKey,
    dummyAtaPubkey: PublicKey,
    marketArgs: InitMarketArgs,
  ): Promise<Transaction> {
    const ixData = encodeInitMarket(marketArgs);
    const keys = buildAccountMetas(ACCOUNTS_INIT_MARKET, [
      wallet.publicKey,   // admin
      slabPubkey,         // slab
      collateralMint,     // mint
      vaultPubkey,        // vault (SPL token account)
      WELL_KNOWN.tokenProgram,
      WELL_KNOWN.clock,
      WELL_KNOWN.rent,
      dummyAtaPubkey,     // dummyAta (can be any valid account)
      WELL_KNOWN.systemProgram,
    ]);

    return this.buildTransaction(
      new TransactionInstruction({ programId: this.programId, keys, data: ixData })
    );
  }

  /**
   * Build InitLP transaction. Creates an LP account with a matcher program.
   */
  async buildInitLpTx(
    wallet: WalletAdapter,
    slabPubkey: PublicKey,
    collateralMint: PublicKey,
    vaultPubkey: PublicKey,
    matcherProgram: PublicKey,
    matcherContext: PublicKey,
    feePayment: bigint = 1_000_000n,
  ): Promise<Transaction> {
    const userAta = await getAta(wallet.publicKey, collateralMint);

    const ixData = encodeInitLP({
      matcherProgram: matcherProgram,
      matcherContext: matcherContext,
      feePayment: feePayment.toString(),
    });
    const keys = buildAccountMetas(ACCOUNTS_INIT_LP, [
      wallet.publicKey,
      slabPubkey,
      userAta,
      vaultPubkey,
      WELL_KNOWN.tokenProgram,
    ]);

    return this.buildTransaction(
      new TransactionInstruction({ programId: this.programId, keys, data: ixData })
    );
  }

  /**
   * Build SetOracleAuthority transaction (admin only).
   * Allows pushing prices manually instead of using Pyth/Chainlink.
   */
  async buildSetOracleAuthorityTx(
    wallet: WalletAdapter,
    slabPubkey: PublicKey,
    newAuthority: PublicKey,
  ): Promise<Transaction> {
    const ixData = encodeSetOracleAuthority({ newAuthority });
    const keys = buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [
      wallet.publicKey,
      slabPubkey,
    ]);

    return this.buildTransaction(
      new TransactionInstruction({ programId: this.programId, keys, data: ixData })
    );
  }

  /**
   * Build PushOraclePrice transaction (oracle authority only).
   * Used for Hyperp mode or manual oracle authority markets.
   */
  async buildPushOraclePriceTx(
    wallet: WalletAdapter,
    slabPubkey: PublicKey,
    priceE6: bigint,
    timestamp: bigint,
  ): Promise<Transaction> {
    const ixData = encodePushOraclePrice({
      priceE6: priceE6.toString(),
      timestamp: timestamp.toString(),
    });
    const keys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [
      wallet.publicKey,
      slabPubkey,
    ]);

    return this.buildTransaction(
      new TransactionInstruction({ programId: this.programId, keys, data: ixData })
    );
  }

  /**
   * Build TopUpInsurance transaction.
   */
  async buildTopUpInsuranceTx(
    wallet: WalletAdapter,
    slabPubkey: PublicKey,
    collateralMint: PublicKey,
    vaultPubkey: PublicKey,
    amount: bigint,
  ): Promise<Transaction> {
    const userAta = await getAta(wallet.publicKey, collateralMint);

    const ixData = encodeTopUpInsurance({ amount: amount.toString() });
    const keys = buildAccountMetas(ACCOUNTS_TOPUP_INSURANCE, [
      wallet.publicKey,
      slabPubkey,
      userAta,
      vaultPubkey,
      WELL_KNOWN.tokenProgram,
    ]);

    return this.buildTransaction(
      new TransactionInstruction({ programId: this.programId, keys, data: ixData })
    );
  }

  // --------------------------------------------------------------------------
  // Send (sign + send via wallet adapter)
  // --------------------------------------------------------------------------

  async sendTransaction(
    wallet: WalletAdapter,
    tx: Transaction,
  ): Promise<TxResult> {
    try {
      const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = wallet.publicKey;

      const signed = await wallet.signTransaction(tx);
      const rawTx = signed.serialize();

      const signature = await this.connection.sendRawTransaction(rawTx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      const confirmation = await this.connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        const txInfo = await this.connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        const logs = txInfo?.meta?.logMessages ?? [];
        const parsed = parseErrorFromLogs(logs);
        return {
          signature,
          error: parsed ? `${parsed.name} (0x${parsed.code.toString(16)})` : JSON.stringify(confirmation.value.err),
          hint: parsed?.hint,
        };
      }

      return { signature, error: null };
    } catch (e: unknown) {
      return {
        signature: '',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async buildTransaction(ix: TransactionInstruction): Promise<Transaction> {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
    tx.add(ix);
    return tx;
  }
}

// Helper: absolute value for i128 bigint
function abs128(val: bigint): bigint {
  return val < 0n ? -val : val;
}

