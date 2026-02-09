'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { enableFuturesForToken, getSlabRentCost } from '@/lib/pumpfun'
import { updateTokenSlab, getFundraise } from '@/lib/tokenRegistry'
import { CommunityFundraiser } from './CommunityFundraiser'

interface EnableFuturesProps {
  tokenMint: string
  onEnabled: (slabAddress: string) => void
}

type Mode = 'choose' | 'solo' | 'community'

export function EnableFutures({ tokenMint, onEnabled }: EnableFuturesProps) {
  const { publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()
  const [mode, setMode] = useState<Mode>('choose')
  const [loading, setLoading] = useState(false)
  const [slabCost, setSlabCost] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSlabRentCost(connection).then(cost => setSlabCost(cost)).catch(() => {})
  }, [connection])

  // If there's an existing fundraise, go straight to community mode
  useEffect(() => {
    async function checkFundraise() {
      const existing = await getFundraise(tokenMint)
      if (existing && !existing.enabled) {
        setMode('community')
      }
    }
    checkFundraise()
  }, [tokenMint])

  const walletAdapter = publicKey && signTransaction ? {
    publicKey,
    signTransaction,
  } : null

  const handleEnable = async () => {
    if (!walletAdapter) {
      alert('Please connect your wallet')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await enableFuturesForToken(walletAdapter, connection, tokenMint)
      
      if (result.success && result.slabAddress) {
        await updateTokenSlab(tokenMint, result.slabAddress)
        onEnabled(result.slabAddress)
      } else {
        setError(result.error || 'Failed to enable futures')
      }
    } catch (err: any) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  // Community mode
  if (mode === 'community') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setMode('choose')}
          className="text-xs text-gray-500 hover:text-gray-300 transition"
        >
          ← Back
        </button>
        <CommunityFundraiser tokenMint={tokenMint} onEnabled={onEnabled} />
      </div>
    )
  }

  // Solo mode
  if (mode === 'solo') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setMode('choose')}
          className="text-xs text-gray-500 hover:text-gray-300 transition"
        >
          ← Back
        </button>
        <div className="bg-[#111] border border-gray-800 rounded-xl p-6 text-center space-y-4">
          <div className="text-xl font-bold text-purple-400">Futures</div>
          <h3 className="text-xl font-bold text-white">Enable Futures (Solo)</h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Pay by yourself. Creates a leveraged market with up to 20x long/short.
          </p>
          
          <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-4 space-y-2 text-sm max-w-sm mx-auto">
            <div className="flex justify-between">
              <span className="text-gray-500">Slab rent</span>
              <span className="font-mono text-white">~{slabCost ? slabCost.toFixed(2) : '7'} SOL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Matcher context</span>
              <span className="font-mono text-white">~0.003 SOL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Tx fees</span>
              <span className="font-mono text-white">~0.01 SOL</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-800 font-bold">
              <span className="text-gray-400">Total</span>
              <span className="font-mono text-purple-400">~{slabCost ? (slabCost + 0.013).toFixed(2) : '7'} SOL</span>
            </div>
            <p className="text-xs text-gray-600 pt-1">
              Rent is refundable when market is closed
            </p>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleEnable}
            disabled={loading || !publicKey}
            className="px-8 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Creating market (7 txs)...' : !publicKey ? 'Connect Wallet' : `Enable Futures (~${slabCost ? slabCost.toFixed(1) : '7'} SOL)`}
          </button>
        </div>
      </div>
    )
  }

  // Choice screen
  return (
    <div className="bg-[#111] border border-gray-800 rounded-xl p-6 space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-white">Enable Leverage Trading</h3>
        <p className="text-gray-400 text-sm mt-2 max-w-lg mx-auto">
          No futures market exists for this token yet. Requires ~{slabCost ? slabCost.toFixed(1) : '7'} SOL for slab account rent on Solana.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 max-w-lg mx-auto">
        {/* Solo */}
        <button
          onClick={() => setMode('solo')}
          className="bg-[#0a0a0a] border border-gray-700 hover:border-purple-600 rounded-xl p-5 text-left transition group"
        >
          <div className="text-sm font-bold text-purple-400 mb-3">SOLO</div>
          <h4 className="font-bold text-white group-hover:text-purple-400 transition">
            Pay Solo
          </h4>
          <p className="text-xs text-gray-500 mt-1">
            ~{slabCost ? slabCost.toFixed(1) : '7'} SOL from your wallet. Instant activation.
          </p>
          <div className="mt-3 text-xs text-purple-400 opacity-0 group-hover:opacity-100 transition">
            Select →
          </div>
        </button>

        {/* Community */}
        <button
          onClick={() => setMode('community')}
          className="bg-[#0a0a0a] border border-gray-700 hover:border-purple-500 rounded-xl p-5 text-left transition group"
        >
          <div className="text-sm font-bold text-purple-300 mb-3">COMMUNITY</div>
          <h4 className="font-bold text-white group-hover:text-purple-300 transition">
            Community Fundraise
          </h4>
          <p className="text-xs text-gray-500 mt-1">
            Start a fundraise and let the community chip in together.
          </p>
          <div className="mt-3 text-xs text-purple-300 opacity-0 group-hover:opacity-100 transition">
            Select →
          </div>
        </button>
      </div>
    </div>
  )
}
