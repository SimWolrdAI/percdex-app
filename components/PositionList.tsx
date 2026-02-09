'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getPercolatorClient } from '@/lib/solana'
import type { WalletAdapter } from '@/lib/solana'

interface PositionData {
  index: number
  side: 'long' | 'short'
  capital: number     // SOL
  positionSize: number
  entryPrice: number  // e6
  pnl: number         // SOL
  leverage: number
}

interface PositionListProps {
  tokenMint: string
  slabAddress?: string | null
}

export function PositionList({ tokenMint, slabAddress }: PositionListProps) {
  const { publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()
  const [position, setPosition] = useState<PositionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [closing, setClosing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const walletAdapter: WalletAdapter | null = publicKey && signTransaction ? {
    publicKey,
    signTransaction,
  } : null

  const fetchPosition = useCallback(async () => {
    if (!publicKey || !slabAddress) {
      setPosition(null)
      return
    }

    setRefreshing(true)
    try {
      const client = getPercolatorClient(new PublicKey(slabAddress))
      const found = await client.findUserAccount(publicKey)
      
      if (found && found.account.positionSize !== 0n) {
        const abs = found.account.positionSize < 0n ? -found.account.positionSize : found.account.positionSize
        const capitalSol = Number(found.account.capital) / LAMPORTS_PER_SOL
        const pnlSol = Number(found.account.pnl) / LAMPORTS_PER_SOL
        const notional = found.account.entryPrice > 0n
          ? Number(abs * found.account.entryPrice / 1_000_000n) / LAMPORTS_PER_SOL
          : 0
        const leverage = capitalSol > 0 && notional > 0 ? notional / capitalSol : 0

        setPosition({
          index: found.idx,
          side: found.account.positionSize > 0n ? 'long' : 'short',
          capital: capitalSol,
          positionSize: Number(abs),
          entryPrice: Number(found.account.entryPrice) / 1_000_000,
          pnl: pnlSol,
          leverage,
        })
      } else {
        setPosition(null)
      }
    } catch (e: any) {
      console.error('Error fetching position:', e)
      setPosition(null)
    } finally {
      setRefreshing(false)
    }
  }, [publicKey, slabAddress])

  useEffect(() => {
    fetchPosition()
    const interval = setInterval(fetchPosition, 15000)
    return () => clearInterval(interval)
  }, [fetchPosition])

  const handleClose = async () => {
    if (!walletAdapter || !position || !slabAddress) return
    setClosing(true)
    try {
      const client = getPercolatorClient(new PublicKey(slabAddress))
      const tx = await client.buildCloseAccountTx(walletAdapter, position.index)
      const result = await client.sendTransaction(walletAdapter, tx)
      if (result.error) {
        alert(`Close failed: ${result.error}${result.hint ? ` — ${result.hint}` : ''}`)
      } else {
        setPosition(null)
        alert(`Position closed. Tx: ${result.signature.slice(0, 12)}...`)
      }
    } catch (error: any) {
      alert(`Error: ${error.message || error.toString()}`)
    } finally {
      setClosing(false)
    }
  }

  if (!publicKey) {
    return (
      <p className="text-gray-500 text-center py-8">
        Connect wallet to view positions
      </p>
    )
  }

  if (!slabAddress) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-500 text-sm">No Percolator market for this token</p>
        <p className="text-gray-600 text-xs mt-1">Enable futures to trade long/short</p>
      </div>
    )
  }

  if (!position) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-500">No open position</p>
        {refreshing && <p className="text-gray-600 text-xs mt-1">Refreshing...</p>}
        <button onClick={fetchPosition} className="text-xs text-purple-400 hover:text-purple-300 mt-2">
          Refresh
        </button>
      </div>
    )
  }

  const isLong = position.side === 'long'

  return (
    <div className="space-y-3">
      <div className="border border-gray-700 rounded-lg p-4 bg-[#0a0a0a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${isLong ? 'text-purple-400' : 'text-purple-300'}`}>
              {isLong ? 'LONG' : 'SHORT'}
            </span>
            <span className="text-gray-500 text-sm">{position.leverage.toFixed(1)}x</span>
          </div>
          <button
            onClick={handleClose}
            disabled={closing}
            className="px-3 py-1.5 text-sm bg-gray-800 text-gray-300 rounded-md hover:bg-red-900 hover:text-red-300 transition"
          >
            {closing ? '...' : 'Close'}
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Capital</span>
            <span className="font-mono text-white">{position.capital.toFixed(4)} SOL</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Entry Price</span>
            <span className="font-mono text-white">${position.entryPrice.toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Position Size</span>
            <span className="font-mono text-white">{position.positionSize.toLocaleString()}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-gray-800">
            <span className="text-gray-500">PnL</span>
            <span className={`font-mono font-bold ${
              position.pnl >= 0 ? 'text-purple-400' : 'text-red-400'
            }`}>
              {position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(6)} SOL
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center text-xs text-gray-600 px-1">
        <span>Account #{position.index}</span>
        <button onClick={fetchPosition} className="hover:text-gray-400 transition">
          Refresh
        </button>
      </div>
    </div>
  )
}
