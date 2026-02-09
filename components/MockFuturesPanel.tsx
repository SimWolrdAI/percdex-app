'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { CreateLiquidAccountModal } from './CreateLiquidAccountModal'

interface MockPosition {
  id: string
  side: 'long' | 'short'
  leverage: number
  collateral: number        // SOL
  entryPrice: number        // SOL per token
  positionSize: number      // notional in SOL
  openedAt: number          // timestamp
  pnl: number               // current PnL in SOL
  pnlPercent: number        // PnL %
}

interface MockFuturesPanelProps {
  tokenMint: string
  tokenSymbol: string
  currentPriceInSol: number | null
}

const STORAGE_KEY_ACCOUNT = 'percdex_mock_account'
const STORAGE_KEY_POSITIONS = 'percdex_mock_positions'

const LEVERAGE_PRESETS = [1, 2, 3, 5, 7, 10]
const AMOUNT_PRESETS = [0.05, 0.1, 0.25, 0.5]

export function MockFuturesPanel({
  tokenMint,
  tokenSymbol,
  currentPriceInSol,
}: MockFuturesPanelProps) {
  const { publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()
  const [hasAccount, setHasAccount] = useState(false)
  const [checkingAccount, setCheckingAccount] = useState(true)
  const [side, setSide] = useState<'long' | 'short'>('long')
  const [amount, setAmount] = useState('')
  const [leverage, setLeverage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [positions, setPositions] = useState<MockPosition[]>([])

  // Check if user has a mock account
  useEffect(() => {
    if (!publicKey) {
      setCheckingAccount(false)
      return
    }
    const key = `${STORAGE_KEY_ACCOUNT}_${publicKey.toBase58()}_${tokenMint}`
    const stored = localStorage.getItem(key)
    setHasAccount(stored === 'true')
    setCheckingAccount(false)

    // Load positions
    const posKey = `${STORAGE_KEY_POSITIONS}_${publicKey.toBase58()}_${tokenMint}`
    const posStored = localStorage.getItem(posKey)
    if (posStored) {
      try { setPositions(JSON.parse(posStored)) } catch {}
    }
  }, [publicKey, tokenMint])

  // Save positions when they change
  useEffect(() => {
    if (!publicKey) return
    const posKey = `${STORAGE_KEY_POSITIONS}_${publicKey.toBase58()}_${tokenMint}`
    localStorage.setItem(posKey, JSON.stringify(positions))
  }, [positions, publicKey, tokenMint])

  // Update PnL every 2 seconds with mock price movement
  useEffect(() => {
    if (positions.length === 0 || !currentPriceInSol) return

    const interval = setInterval(() => {
      setPositions(prev =>
        prev.map(pos => {
          const priceDelta = (Math.random() - 0.48) * currentPriceInSol * 0.005
          const currentPrice = currentPriceInSol + priceDelta
          const priceChange = currentPrice - pos.entryPrice
          const pnlRaw =
            pos.side === 'long'
              ? (priceChange / pos.entryPrice) * pos.positionSize
              : -(priceChange / pos.entryPrice) * pos.positionSize
          const pnlPercent = (pnlRaw / pos.collateral) * 100
          return { ...pos, pnl: pnlRaw, pnlPercent }
        }),
      )
    }, 2000)

    return () => clearInterval(interval)
  }, [positions.length, currentPriceInSol])

  const handleAccountCreated = useCallback(() => {
    if (!publicKey) return
    const key = `${STORAGE_KEY_ACCOUNT}_${publicKey.toBase58()}_${tokenMint}`
    localStorage.setItem(key, 'true')
    setHasAccount(true)
    setStatus({ type: 'success', text: 'Trading account created successfully' })
  }, [publicKey, tokenMint])

  // Open mock position
  const handleOpenPosition = async () => {
    if (!publicKey || !signTransaction || !currentPriceInSol) return
    const amountSol = parseFloat(amount)
    if (!amountSol || amountSol <= 0) {
      setStatus({ type: 'error', text: 'Enter a valid collateral amount' })
      return
    }

    setLoading(true)
    setStatus({ type: 'info', text: `Opening ${side} ${leverage}x... Confirm in wallet.` })

    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: publicKey,
          lamports: Math.floor(amountSol * LAMPORTS_PER_SOL),
        }),
      )
      const bh = await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = bh.blockhash
      tx.feePayer = publicKey
      const signed = await signTransaction(tx)
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      setStatus({ type: 'info', text: 'Depositing collateral...' })
      await connection.confirmTransaction(
        { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
        'confirmed',
      )

      const positionSize = amountSol * leverage
      const newPosition: MockPosition = {
        id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        side,
        leverage,
        collateral: amountSol,
        entryPrice: currentPriceInSol,
        positionSize,
        openedAt: Date.now(),
        pnl: 0,
        pnlPercent: 0,
      }

      setPositions(prev => [...prev, newPosition])
      setStatus({
        type: 'success',
        text: `${side.toUpperCase()} ${leverage}x opened. Tx: ${sig.slice(0, 12)}...`,
      })
      setAmount('')
    } catch (err: any) {
      if (err?.message?.includes('User rejected')) {
        setStatus({ type: 'error', text: 'Transaction rejected' })
      } else {
        setStatus({ type: 'error', text: err?.message || 'Trade failed' })
      }
    } finally {
      setLoading(false)
    }
  }

  // Close a mock position
  const handleClosePosition = async (posId: string) => {
    if (!publicKey || !signTransaction) return

    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: publicKey,
          lamports: 5000,
        }),
      )
      const bh = await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = bh.blockhash
      tx.feePayer = publicKey
      const signed = await signTransaction(tx)
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })
      await connection.confirmTransaction(
        { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
        'confirmed',
      )

      const closedPos = positions.find(p => p.id === posId)
      setPositions(prev => prev.filter(p => p.id !== posId))
      setStatus({
        type: 'success',
        text: `Position closed. PnL: ${closedPos ? (closedPos.pnl >= 0 ? '+' : '') + closedPos.pnl.toFixed(6) : '0'} SOL`,
      })
    } catch (err: any) {
      if (err?.message?.includes('User rejected')) {
        setStatus({ type: 'error', text: 'Transaction rejected' })
      }
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

  if (!hasAccount) {
    return (
      <CreateLiquidAccountModal
        tokenSymbol={tokenSymbol}
        onCreated={handleAccountCreated}
      />
    )
  }

  const amountNum = parseFloat(amount) || 0
  const entryPriceUsd = currentPriceInSol ? (currentPriceInSol * 170) : 0

  return (
    <div className="space-y-4">
      {/* Status */}
      {status && (
        <div
          className={`p-3 rounded-lg text-sm ${
            status.type === 'error'
              ? 'bg-red-900/30 border border-red-800 text-red-300'
              : 'bg-purple-900/30 border border-purple-800/50 text-purple-300'
          }`}
        >
          {status.text}
        </div>
      )}

      {/* LONG / SHORT tab selector */}
      <div className="bg-[#0d0d0d] border border-[#222] rounded-xl overflow-hidden">
        <div className="flex">
          <button
            onClick={() => setSide('long')}
            className={`flex-1 py-3 text-sm font-bold tracking-wider transition relative ${
              side === 'long'
                ? 'text-purple-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            LONG
            {side === 'long' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-purple-400" />
            )}
          </button>
          <button
            onClick={() => setSide('short')}
            className={`flex-1 py-3 text-sm font-bold tracking-wider transition relative ${
              side === 'short'
                ? 'text-purple-300'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            SHORT
            {side === 'short' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-purple-300" />
            )}
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Collateral */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Collateral</span>
            <span className="text-sm font-mono text-white font-semibold">
              {amountNum.toFixed(4)} SOL
            </span>
          </div>

          {/* Amount input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Amount (SOL)</span>
              <button
                onClick={() => setAmount('1')}
                className="text-xs text-purple-400 hover:text-purple-300 transition"
              >
                Max
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full px-4 py-3 border border-[#333] rounded-lg bg-[#111] text-white text-right text-lg font-mono placeholder-gray-600 focus:border-[#444] focus:outline-none transition"
              />
            </div>
            <div className="flex gap-2 mt-2">
              {AMOUNT_PRESETS.map((val) => (
                <button
                  key={val}
                  onClick={() => setAmount(val.toString())}
                  className="flex-1 py-1.5 text-xs border border-[#333] text-gray-400 rounded-md hover:border-[#555] hover:text-white transition bg-transparent"
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* Leverage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Leverage</span>
              <span className="text-xs text-gray-500">Max: 10x</span>
            </div>
            <div className="flex gap-1.5">
              {LEVERAGE_PRESETS.map((lev) => (
                <button
                  key={lev}
                  onClick={() => setLeverage(lev)}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                    leverage === lev
                      ? 'bg-purple-600 text-white font-bold'
                      : 'border border-[#333] text-gray-400 hover:border-purple-600/50 hover:text-white bg-transparent'
                  }`}
                >
                  {lev}x
                </button>
              ))}
            </div>
          </div>

          {/* Info section */}
          <div className="space-y-2.5 pt-2 border-t border-[#222]">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Entry Price</span>
              <span className="font-mono text-white">
                ${entryPriceUsd > 0 ? entryPriceUsd.toFixed(8) : '0.00'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Spread + Fee</span>
              <span className="font-mono text-white">50 + 10 bps</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Route</span>
              <span className="font-mono text-white">LP #0</span>
            </div>
          </div>

          {/* Submit button */}
          <button
            onClick={handleOpenPosition}
            disabled={loading || !amountNum || !currentPriceInSol}
            className={`w-full py-3.5 rounded-lg font-bold text-base text-white transition disabled:opacity-40 disabled:cursor-not-allowed ${
              side === 'long'
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-purple-700 hover:bg-purple-800'
            }`}
          >
            {loading
              ? 'Executing...'
              : !currentPriceInSol
              ? 'Waiting for price...'
              : `${side === 'long' ? 'LONG' : 'SHORT'} ${amountNum.toFixed(4)} SOL (${leverage}x)`}
          </button>
        </div>
      </div>

      {/* Open positions */}
      {positions.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-[#222]">
          <h4 className="text-sm font-semibold text-white">Open Positions</h4>
          {positions.map((pos) => (
            <div
              key={pos.id}
              className="border border-[#222] rounded-lg p-4 bg-[#0d0d0d]"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-bold ${
                      pos.side === 'long' ? 'text-purple-400' : 'text-purple-300'
                    }`}
                  >
                    {pos.side === 'long' ? 'LONG' : 'SHORT'}
                  </span>
                  <span className="text-gray-500 text-xs">{pos.leverage}x</span>
                </div>
                <button
                  onClick={() => handleClosePosition(pos.id)}
                  className="px-3 py-1.5 text-xs border border-[#333] text-gray-400 rounded-md hover:border-red-800 hover:text-red-400 transition"
                >
                  Close
                </button>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Collateral</span>
                  <span className="font-mono text-white">{pos.collateral.toFixed(4)} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Entry Price</span>
                  <span className="font-mono text-white">${(pos.entryPrice * 170).toFixed(8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Notional</span>
                  <span className="font-mono text-white">{pos.positionSize.toFixed(4)} SOL</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[#222]">
                  <span className="text-gray-500">PnL</span>
                  <span
                    className={`font-mono font-bold ${
                      pos.pnl >= 0 ? 'text-purple-400' : 'text-red-400'
                    }`}
                  >
                    {pos.pnl >= 0 ? '+' : ''}
                    {pos.pnl.toFixed(6)} SOL ({pos.pnlPercent >= 0 ? '+' : ''}
                    {pos.pnlPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
