/**
 * Percolator Client — Frontend integration layer
 * Wraps percolator-cli ABI modules for use with @solana/wallet-adapter
 */

export { encodeInitUser, encodeInitLP, encodeDepositCollateral, encodeWithdrawCollateral, 
         encodeTradeCpi, encodeTradeNoCpi, encodeKeeperCrank, encodeLiquidateAtOracle,
         encodeCloseAccount, encodeTopUpInsurance, encodeInitMarket,
         IX_TAG } from './abi/instructions';
export type { InitUserArgs, InitLPArgs, DepositCollateralArgs, WithdrawCollateralArgs,
              TradeCpiArgs, TradeNoCpiArgs, KeeperCrankArgs, InitMarketArgs } from './abi/instructions';

export { buildAccountMetas, WELL_KNOWN,
         ACCOUNTS_INIT_USER, ACCOUNTS_INIT_LP, ACCOUNTS_DEPOSIT_COLLATERAL,
         ACCOUNTS_WITHDRAW_COLLATERAL, ACCOUNTS_TRADE_CPI, ACCOUNTS_TRADE_NOCPI,
         ACCOUNTS_KEEPER_CRANK, ACCOUNTS_CLOSE_ACCOUNT, ACCOUNTS_TOPUP_INSURANCE,
         ACCOUNTS_INIT_MARKET } from './abi/accounts';

export { deriveVaultAuthority, deriveLpPda } from './solana/pda';
export { fetchSlab, parseHeader, parseConfig, parseEngine, parseParams,
         parseUsedIndices, parseAccount, parseAllAccounts, isAccountUsed,
         maxAccountIndex, AccountKind } from './solana/slab';
export type { SlabHeader, MarketConfig, EngineState, RiskParams, Account, InsuranceFund } from './solana/slab';

export { getAta } from './solana/ata';
export { parseErrorFromLogs, decodeError, getErrorName, getErrorHint } from './abi/errors';

