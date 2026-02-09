'use client'

import { useState, useEffect, useMemo } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import {
  getFundraise,
  createFundraise,
  addPledge,
  markFundraiseEnabled,
  getFundraiseTotalPledged,
  updateTokenSlab,
  type Fundraise,
} from '@/lib/tokenRegistry'
import { enableFuturesForToken, getSlabRentCost } from '@/lib/pumpfun'

interface CommunityFundraiserProps {
  tokenMint: string
  onEnabled: (slabAddress: string) => void
}

export function CommunityFundraiser({ tokenMint, onEnabled }: CommunityFundraiserProps) {
  const { publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()

  const [fundraise, setFundraise] = useState<Fundraise | null>(null)
  const [slabCost, setSlabCost] = useState<number>(7)
  const [pledgeAmount, setPledgeAmount] = useState('')
  const [pledgeMessage, setPledgeMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const walletAdapter = publicKey && signTransaction ? { publicKey, signTransaction } : null

  // Load fundraise & slab cost
  useEffect(() => {
    async function load() {
      const f = await getFundraise(tokenMint)
      setFundraise(f)
    }
    load()
    getSlabRentCost(connection).then(c => setSlabCost(c)).catch(() => {})
  }, [tokenMint, connection])

  const goalSol = useMemo(() => slabCost + 0.02, [slabCost]) // slab + fees
  const totalPledged = fundraise ? getFundraiseTotalPledged(fundraise) : 0
  const progressPct = fundraise ? Math.min(100, (totalPledged / fundraise.goalSol) * 100) : 0
  const remaining = fundraise ? Math.max(0, fundraise.goalSol - totalPledged) : goalSol
  const goalReached = fundraise ? totalPledged >= fundraise.goalSol : false

  const myPledge = fundraise?.pledges.find(p => p.wallet === publicKey?.toBase58())

  // Start a new fundraise
  const handleStartFundraise = async () => {
    if (!publicKey) return
    const f = await createFundraise(tokenMint, goalSol, publicKey.toBase58())
    setFundraise(f)
  }

  // Add/update pledge
  const handlePledge = async () => {
    if (!publicKey || !fundraise) return
    const amount = parseFloat(pledgeAmount)
    if (!amount || amount <= 0) {
      setError('Enter an amount')
      return
    }
    setError(null)

    const updated = await addPledge(tokenMint, {
      wallet: publicKey.toBase58(),
      amount,
      timestamp: Date.now(),
      message: pledgeMessage || undefined,
    })

    if (updated) {
      setFundraise({ ...updated })
      setPledgeAmount('')
      setPledgeMessage('')
    }
  }

  // Enable futures (pay full amount)
  const handleEnableFutures = async () => {
    if (!walletAdapter || !fundraise) return

    setEnabling(true)
    setError(null)

    try {
      const result = await enableFuturesForToken(walletAdapter, connection, tokenMint)

      if (result.success && result.slabAddress) {
        await updateTokenSlab(tokenMint, result.slabAddress)
        await markFundraiseEnabled(tokenMint, walletAdapter.publicKey.toBase58())
        setFundraise(prev => prev ? { ...prev, enabled: true, enabledBy: walletAdapter.publicKey.toBase58() } : null)
        onEnabled(result.slabAddress)
      } else {
        setError(result.error || 'Failed to enable futures')
      }
    } catch (err: any) {
      setError(err.message || String(err))
    } finally {
      setEnabling(false)
    }
  }

  // No fundraise yet — show "Start" button
  if (!fundraise) {
    return (
      <div className="bg-[#111] border border-gray-800 rounded-xl p-6 text-center space-y-4">
        <div className="text-xl font-bold text-purple-400">Community</div>
        <h3 className="text-xl font-bold text-white">Community Fundraise</h3>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          Start a fundraise and let the community chip in to enable futures for this token.
          Requires ~{goalSol.toFixed(1)} SOL for slab rent.
        </p>
        <button
          onClick={handleStartFundraise}
          disabled={!publicKey}
          className="px-6 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {!publicKey ? 'Connect Wallet' : 'Start Fundraise'}
        </button>
      </div>
    )
  }

  // Fundraise already completed
  if (fundraise.enabled) {
    return (
      <div className="bg-[#111] border border-purple-900/50 rounded-xl p-6 text-center space-y-3">
        <div className="text-xl font-bold text-purple-400">Success</div>
        <h3 className="text-xl font-bold text-purple-400">Futures Enabled!</h3>
        <p className="text-gray-400 text-sm">
          Community raised {totalPledged.toFixed(2)} SOL — futures are now active.
        </p>
        {fundraise.enabledBy && (
          <p className="text-xs text-gray-500">
            Activated by: {fundraise.enabledBy.slice(0, 4)}...{fundraise.enabledBy.slice(-4)}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-[#111] border border-gray-800 rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-bold text-white flex items-center justify-center gap-2">
          Community Fundraise
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Started: {new Date(fundraise.createdAt).toLocaleDateString()} ·{' '}
          {fundraise.pledges.length} contributor{fundraise.pledges.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Raised</span>
          <span className="font-mono text-white">
            {totalPledged.toFixed(2)} / {fundraise.goalSol.toFixed(2)} SOL
          </span>
        </div>
        <div className="w-full h-4 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              goalReached
                ? 'bg-gradient-to-r from-purple-500 to-purple-400'
                : 'bg-gradient-to-r from-purple-600 to-purple-500'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">{progressPct.toFixed(0)}%</span>
          <span className="text-gray-600">
            Remaining: {remaining.toFixed(2)} SOL
          </span>
        </div>
      </div>

      {/* Pledge list */}
      {fundraise.pledges.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Contributors</p>
          {fundraise.pledges
            .sort((a, b) => b.amount - a.amount)
            .map((p, i) => (
              <div
                key={p.wallet}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                  p.wallet === publicKey?.toBase58()
                    ? 'bg-purple-900/20 border border-purple-800/30'
                    : 'bg-[#0a0a0a]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-xs w-5">#{i + 1}</span>
                  <span className="font-mono text-gray-300">
                    {p.wallet.slice(0, 4)}...{p.wallet.slice(-4)}
                  </span>
                  {p.wallet === publicKey?.toBase58() && (
                    <span className="text-xs px-1.5 py-0.5 bg-purple-900/30 text-purple-400 rounded">
                      you
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-white">{p.amount.toFixed(2)} SOL</span>
                  {p.message && (
                    <p className="text-xs text-gray-600 max-w-[120px] truncate">{p.message}</p>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Pledge form */}
      {publicKey && !goalReached && (
        <div className="space-y-3 border-t border-gray-800 pt-4">
          <p className="text-sm font-medium text-gray-300">
            {myPledge ? 'Update pledge' : 'Make a pledge'}
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              value={pledgeAmount}
              onChange={(e) => setPledgeAmount(e.target.value)}
              placeholder="SOL"
              step="0.1"
              min="0.01"
              className="flex-1 px-3 py-2 border border-gray-700 rounded-lg bg-[#0a0a0a] text-white font-mono placeholder-gray-600 focus:border-purple-500 focus:outline-none transition text-sm"
            />
            <button
              onClick={handlePledge}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition text-sm whitespace-nowrap"
            >
              Pledge
            </button>
          </div>
          <div className="flex gap-2">
            {[0.1, 0.5, 1, 2].map(val => (
              <button
                key={val}
                onClick={() => setPledgeAmount(val.toString())}
                className="flex-1 py-1.5 text-xs bg-gray-800 text-gray-400 rounded-md hover:bg-gray-700 transition"
              >
                {val} SOL
              </button>
            ))}
          </div>
          <input
            type="text"
            value={pledgeMessage}
            onChange={(e) => setPledgeMessage(e.target.value)}
            placeholder="Message (optional)"
            maxLength={80}
            className="w-full px-3 py-2 border border-gray-700 rounded-lg bg-[#0a0a0a] text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none transition text-sm"
          />
        </div>
      )}

      {/* Goal reached — enable button */}
      {goalReached && (
        <div className="border-t border-gray-800 pt-4 space-y-3">
          <div className="bg-purple-900/20 border border-purple-800/30 rounded-lg p-3 text-center">
            <p className="text-purple-400 font-bold">Goal reached!</p>
            <p className="text-gray-400 text-xs mt-1">
              Any contributor can now activate futures. Payment of ~{fundraise.goalSol.toFixed(1)} SOL from your wallet.
            </p>
          </div>
          <button
            onClick={handleEnableFutures}
            disabled={enabling || !publicKey}
            className="w-full py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {enabling ? 'Creating market (7 txs)...' : 'Activate Futures'}
          </button>
        </div>
      )}

      {/* Not enough pledges — still show enable option */}
      {!goalReached && publicKey && (
        <div className="border-t border-gray-800 pt-4">
          <button
            onClick={handleEnableFutures}
            disabled={enabling}
            className="w-full py-2.5 bg-gray-800 text-gray-300 rounded-lg font-medium hover:bg-gray-700 disabled:opacity-50 transition text-sm"
          >
            {enabling ? 'Creating...' : `Pay in full (~${fundraise.goalSol.toFixed(1)} SOL)`}
          </button>
          <p className="text-xs text-gray-600 text-center mt-2">
            Don&apos;t want to wait? Pay the full amount yourself
          </p>
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-gray-600 text-center space-y-0.5">
        <p>Pledges are commitments. The actual slab payment is made by one contributor.</p>
        <p>On-chain escrow for automatic collection coming soon.</p>
      </div>
    </div>
  )
}
