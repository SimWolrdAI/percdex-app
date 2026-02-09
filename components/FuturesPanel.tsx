'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { getPercolatorClient, MAINNET_CONFIG } from '@/lib/solana'
import type { WalletAdapter } from '@/lib/solana'

interface FuturesPanelProps {
  tokenMint: string
  slabAddress: string
  currentPriceInSol: number | null
}

export function FuturesPanel({ tokenMint, slabAddress, currentPriceInSol }: FuturesPanelProps) {
  const { publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()
  const [side, setSide] = useState<'long' | 'short'>('long')
  const [amount, setAmount] = useState('')    // Collateral in SOL
  const [leverage, setLeverage] = useState(2)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [userIdx, setUserIdx] = useState<number | null>(null)
  const [hasAccount, setHasAccount] = useState(false)
  const [checkingAccount, setCheckingAccount] = useState(true)

  const walletAdapter: WalletAdapter | null = publicKey && signTransaction ? {
    publicKey,
    signTransaction,
  } : null

  // Check if user has an account in the slab
  const checkUserAccount = useCallback(async () => {
    if (!publicKey || !slabAddress) {
      setCheckingAccount(false)
      return
    }
    setCheckingAccount(true)
    try {
      const client = getPercolatorClient(new PublicKey(slabAddress))
      const found = await client.findUserAccount(publicKey)
      if (found) {
        setUserIdx(found.idx)
        setHasAccount(true)
      } else {
        setUserIdx(null)
        setHasAccount(false)
      }
    } catch (e) {
      console.error('Error checking user account:', e)
      setHasAccount(false)
    } finally {
      setCheckingAccount(false)
    }
  }, [publicKey, slabAddress])

  useEffect(() => {
    checkUserAccount()
  }, [checkUserAccount])

  // Init user account (0.001 SOL fee)
  const handleInitAccount = async () => {
    if (!walletAdapter || !slabAddress) return
    setLoading(true)
    setStatus({ type: 'info', text: 'Creating Percolator account (0.001 SOL)...' })

    try {
      const client = getPercolatorClient(new PublicKey(slabAddress))

      // Ensure user has wSOL ATA
      const userAta = await getAssociatedTokenAddress(NATIVE_MINT, walletAdapter.publicKey)
      const ataInfo = await connection.getAccountInfo(userAta)

      if (!ataInfo) {
        // Create wSOL ATA and wrap some SOL for fees
        const createAtaTx = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            walletAdapter.publicKey,
            userAta,
            walletAdapter.publicKey,
            NATIVE_MINT,
          ),
          SystemProgram.transfer({
            fromPubkey: walletAdapter.publicKey,
            toPubkey: userAta,
            lamports: 2_000_000, // 0.002 SOL for fees
          }),
          createSyncNativeInstruction(userAta),
        )
        const bh = await connection.getLatestBlockhash('confirmed')
        createAtaTx.recentBlockhash = bh.blockhash
        createAtaTx.feePayer = walletAdapter.publicKey
        const signed = await walletAdapter.signTransaction(createAtaTx)
        const sig = await connection.sendRawTransaction(signed.serialize())
        await connection.confirmTransaction(
          { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
          'confirmed'
        )
      }

      // Init user account
      const tx = await client.buildInitUserTx(walletAdapter, 1_000_000n) // 0.001 SOL
      const result = await client.sendTransaction(walletAdapter, tx)
      if (result.error) {
        setStatus({ type: 'error', text: `Init failed: ${result.error}` })
      } else {
              setStatus({ type: 'success', text: 'Account created successfully' })
        await checkUserAccount()
      }
    } catch (error: any) {
      setStatus({ type: 'error', text: error.message || String(error) })
    } finally {
      setLoading(false)
    }
  }

  // Deposit collateral + open position
  const handleOpenPosition = async () => {
    if (!walletAdapter || !slabAddress || userIdx === null) return
    const amountSol = parseFloat(amount)
    if (!amountSol || amountSol <= 0) {
      setStatus({ type: 'error', text: 'Enter a valid collateral amount' })
      return
    }

    setLoading(true)
    setStatus({ type: 'info', text: `Opening ${side} position... Confirm in wallet.` })

    try {
      const client = getPercolatorClient(new PublicKey(slabAddress))
      const lamports = BigInt(Math.floor(amountSol * LAMPORTS_PER_SOL))

      // Ensure user has wSOL ATA with enough balance
      const userAta = await getAssociatedTokenAddress(NATIVE_MINT, walletAdapter.publicKey)
      const ataInfo = await connection.getAccountInfo(userAta)

      // Wrap SOL to wSOL
      const wrapTx = new Transaction()
      if (!ataInfo) {
        wrapTx.add(
          createAssociatedTokenAccountInstruction(
            walletAdapter.publicKey,
            userAta,
            walletAdapter.publicKey,
            NATIVE_MINT,
          )
        )
      }
      wrapTx.add(
        SystemProgram.transfer({
          fromPubkey: walletAdapter.publicKey,
          toPubkey: userAta,
          lamports: Number(lamports) + 10_000, // extra for fees
        }),
        createSyncNativeInstruction(userAta),
      )
      const bh = await connection.getLatestBlockhash('confirmed')
      wrapTx.recentBlockhash = bh.blockhash
      wrapTx.feePayer = walletAdapter.publicKey
      const signedWrap = await walletAdapter.signTransaction(wrapTx)
      const wrapSig = await connection.sendRawTransaction(signedWrap.serialize())
      await connection.confirmTransaction(
        { signature: wrapSig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
        'confirmed'
      )

      // Step 1: Deposit collateral
      setStatus({ type: 'info', text: 'Depositing collateral...' })
      const depositTx = await client.buildDepositTx(walletAdapter, userIdx, lamports)
      const depositResult = await client.sendTransaction(walletAdapter, depositTx)
      if (depositResult.error) {
        setStatus({ type: 'error', text: `Deposit failed: ${depositResult.error}` })
        return
      }

      // Step 2: Calculate position size based on leverage
      // size = collateral * leverage * price
      // Positive = long, negative = short
      const positionSize = BigInt(Math.floor(amountSol * leverage * 1_000_000)) // in e6 units
      const signedSize = side === 'long' ? positionSize : -positionSize

      // Step 3: Trade via CPI with matcher
      setStatus({ type: 'info', text: `Opening ${side} ${leverage}x position...` })

      // Get market info to find LP index
      const marketInfo = await client.getMarketInfo()
      const lpAccount = marketInfo.accounts.find(a => a.account.kind === 1) // Find LP
      const lpIdx = lpAccount ? lpAccount.idx : 0

      const matcherCtx = lpAccount
        ? lpAccount.account.matcherContext
        : new PublicKey('11111111111111111111111111111111')

      const tradeTx = await client.buildTradeCpiTx(
        walletAdapter,
        userIdx,
        lpIdx,
        signedSize,
        MAINNET_CONFIG.matcherProgram,
        matcherCtx,
      )
      const tradeResult = await client.sendTransaction(walletAdapter, tradeTx)
      if (tradeResult.error) {
        setStatus({ type: 'error', text: `Trade failed: ${tradeResult.error}${tradeResult.hint ? ` — ${tradeResult.hint}` : ''}` })
        return
      }

      setStatus({ type: 'success', text: `${side.toUpperCase()} ${leverage}x opened. Tx: ${tradeResult.signature.slice(0, 12)}...` })
      setAmount('')
    } catch (error: any) {
      console.error('Position error:', error)
      setStatus({ type: 'error', text: error.message || String(error) })
    } finally {
      setLoading(false)
    }
  }

  if (!publicKey) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-500">Connect wallet to trade futures</p>
      </div>
    )
  }

  if (checkingAccount) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-500 animate-pulse">Checking account...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      {status && (
        <div className={`p-3 rounded-lg text-sm ${
          status.type === 'error'
            ? 'bg-red-900/30 border border-red-800 text-red-300'
            : 'bg-purple-900/30 border border-purple-800/50 text-purple-300'
        }`}>
          {status.text}
        </div>
      )}

      {/* Init account if needed */}
      {!hasAccount ? (
        <div className="text-center space-y-3">
          <p className="text-gray-400 text-sm">You need a Percolator account to trade futures</p>
          <button
            onClick={handleInitAccount}
            disabled={loading}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50 transition"
          >
            {loading ? 'Creating...' : 'Create Account (0.001 SOL)'}
          </button>
        </div>
      ) : (
        <>
          {/* Side selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setSide('long')}
              className={`flex-1 py-3 rounded-lg font-bold text-lg transition ${
                side === 'long'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Long
            </button>
            <button
              onClick={() => setSide('short')}
              className={`flex-1 py-3 rounded-lg font-bold text-lg transition ${
                side === 'short'
                  ? 'bg-purple-700 text-white shadow-lg shadow-purple-700/20'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Short
            </button>
          </div>

          {/* Collateral amount */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Collateral (SOL)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              className="w-full px-4 py-3 border border-gray-700 rounded-lg bg-[#0a0a0a] text-white text-xl font-mono placeholder-gray-600 focus:border-purple-500 focus:outline-none transition"
            />
            <div className="flex gap-2 mt-2">
              {[0.05, 0.1, 0.25, 0.5, 1].map((val) => (
                <button
                  key={val}
                  onClick={() => setAmount(val.toString())}
                  className="flex-1 py-1.5 text-xs bg-gray-800 text-gray-400 rounded-md hover:bg-gray-700 transition"
                >
                  {val} SOL
                </button>
              ))}
            </div>
          </div>

          {/* Leverage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">Leverage</label>
              <span className="text-xl font-bold text-purple-400">{leverage}x</span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={leverage}
              onChange={(e) => setLeverage(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex gap-2 mt-2">
              {[2, 5, 10, 15, 20].map((lev) => (
                <button
                  key={lev}
                  onClick={() => setLeverage(lev)}
                  className={`flex-1 py-1.5 text-sm rounded-md transition ${
                    leverage === lev
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {lev}x
                </button>
              ))}
            </div>
          </div>

          {/* Position details */}
          <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Collateral</span>
              <span className="font-mono text-white">
                {amount ? `${parseFloat(amount).toFixed(4)} SOL` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Notional</span>
              <span className="font-mono text-white">
                {amount ? `${(parseFloat(amount) * leverage).toFixed(4)} SOL` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Leverage</span>
              <span className="font-mono text-purple-400">{leverage}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Liquidation price</span>
              <span className="font-mono text-purple-300/70">
                {currentPriceInSol && amount
                  ? side === 'long'
                    ? `${(currentPriceInSol * (1 - 1/leverage * 0.95)).toFixed(10)} SOL`
                    : `${(currentPriceInSol * (1 + 1/leverage * 0.95)).toFixed(10)} SOL`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-800">
              <span className="text-gray-500">Protocol</span>
              <span className="font-mono text-purple-400">Percolator (meme-liquid)</span>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleOpenPosition}
            disabled={loading || !amount}
            className={`w-full py-4 rounded-lg font-bold text-lg text-white transition ${
              side === 'long'
                ? 'bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-600/20'
                : 'bg-purple-700 hover:bg-purple-800 shadow-lg shadow-purple-700/20'
            } disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none`}
          >
            {loading
              ? 'Executing...'
              : `${side === 'long' ? 'Long' : 'Short'} ${leverage}x`}
          </button>
        </>
      )}
    </div>
  )
}

