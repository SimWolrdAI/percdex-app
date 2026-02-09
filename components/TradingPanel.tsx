'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { buyTokenOnPumpFun, sellTokenOnPumpFun, getPumpFunPrice } from '@/lib/pumpfun'

interface TradingPanelProps {
  tokenMint: string
  slabAddress?: string
}

export function TradingPanel({ tokenMint }: TradingPanelProps) {
  const { publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [currentPrice, setCurrentPrice] = useState<{ priceInSol: number; priceUsd: number; marketCap: number } | null>(null)
  const [slippage, setSlippage] = useState(10)

  // Fetch live price
  useEffect(() => {
    if (!tokenMint) return

    async function fetchPrice() {
      try {
        const data = await getPumpFunPrice(tokenMint)
        if (data) setCurrentPrice(data)
      } catch (e) {
        console.error('Price fetch error:', e)
      }
    }
    fetchPrice()
    const interval = setInterval(fetchPrice, 5000)
    return () => clearInterval(interval)
  }, [tokenMint])

  const handleTrade = async () => {
    if (!publicKey || !signTransaction) {
      setStatus({ type: 'error', text: 'Connect your wallet first' })
      return
    }
    if (!amount || parseFloat(amount) <= 0) {
      setStatus({ type: 'error', text: 'Enter a valid amount' })
      return
    }

    setLoading(true)
    setStatus({ type: 'info', text: `${side === 'buy' ? 'Buying' : 'Selling'}... Confirm in your wallet.` })

    try {
      const wallet = { publicKey, signTransaction }
      let result

      if (side === 'buy') {
        result = await buyTokenOnPumpFun(
          wallet,
          connection,
          tokenMint,
          parseFloat(amount),
          slippage,
        )
      } else {
        // For sell, amount is in token units (percentage of balance)
        // Convert SOL amount to approximate token amount using current price
        const tokenAmount = currentPrice && currentPrice.priceInSol > 0
          ? Math.floor(parseFloat(amount) / currentPrice.priceInSol)
          : parseFloat(amount) * 1_000_000

        result = await sellTokenOnPumpFun(
          wallet,
          connection,
          tokenMint,
          tokenAmount.toString(),
          slippage,
        )
      }

      if (result.success) {
        setStatus({
          type: 'success',
          text: `${side === 'buy' ? 'Bought' : 'Sold'} successfully. Tx: ${result.signature?.slice(0, 12)}...`,
        })
        setAmount('')
      } else {
        setStatus({ type: 'error', text: result.error || 'Transaction failed' })
      }
    } catch (error) {
      console.error('Trade error:', error)
      setStatus({ type: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setLoading(false)
    }
  }

  const estimatedTokens = amount && currentPrice && currentPrice.priceInSol > 0
    ? (parseFloat(amount) / currentPrice.priceInSol)
    : 0

  return (
    <div className="space-y-5">
      {/* Status banner */}
      {status && (
        <div className={`p-3 rounded-lg text-sm ${
          status.type === 'error'
            ? 'bg-red-900/30 border border-red-800 text-red-300'
            : 'bg-purple-900/30 border border-purple-800/50 text-purple-300'
        }`}>
          {status.text}
          {status.type === 'success' && status.text.includes('Tx:') && (
            <a
              href={`https://solscan.io/tx/${status.text.split('Tx: ')[1]?.replace('...', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 underline"
            >
              View ↗
            </a>
          )}
        </div>
      )}

      {/* Buy / Sell selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setSide('buy')}
          className={`flex-1 py-3 rounded-lg font-bold text-lg transition ${
            side === 'buy'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setSide('sell')}
          className={`flex-1 py-3 rounded-lg font-bold text-lg transition ${
            side === 'sell'
              ? 'bg-purple-700 text-white shadow-lg shadow-purple-700/20'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Sell
        </button>
      </div>

      {/* Current price display */}
      {currentPrice && (
        <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">Current Price</div>
          <div className="text-xl font-bold font-mono text-purple-400">
            {currentPrice.priceInSol.toFixed(10)} SOL
          </div>
          <div className="text-xs text-gray-500 mt-1">
            MCap: ${currentPrice.marketCap.toLocaleString()}
          </div>
        </div>
      )}

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium mb-2 text-gray-300">
          {side === 'buy' ? 'Amount (SOL)' : 'Amount (SOL value to sell)'}
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

      {/* Slippage */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-300">Slippage</label>
          <span className="text-sm font-mono text-white">{slippage}%</span>
        </div>
        <div className="flex gap-2">
          {[5, 10, 15, 25].map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              className={`flex-1 py-1.5 text-sm rounded-md transition ${
                slippage === s
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {s}%
            </button>
          ))}
        </div>
      </div>

      {/* Trade info */}
      <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-4 space-y-2.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">You {side === 'buy' ? 'pay' : 'sell'}</span>
          <span className="font-mono text-white">
            {amount ? `${parseFloat(amount).toFixed(4)} SOL` : '—'}
          </span>
        </div>
        {side === 'buy' && estimatedTokens > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Est. tokens received</span>
            <span className="font-mono text-purple-400">
              ~{estimatedTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">Slippage tolerance</span>
          <span className="font-mono text-white">{slippage}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Priority Fee</span>
          <span className="font-mono text-gray-400">0.0005 SOL</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-gray-800">
          <span className="text-gray-500">Network</span>
          <span className="font-mono text-purple-400">Solana Mainnet</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Market</span>
          <span className="font-mono text-purple-400">Pump.fun</span>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleTrade}
        disabled={loading || !publicKey || !amount}
        className={`w-full py-4 rounded-lg font-bold text-lg text-white transition ${
          side === 'buy'
            ? 'bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-600/20'
            : 'bg-purple-700 hover:bg-purple-800 shadow-lg shadow-purple-700/20'
        } disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none`}
      >
        {loading
          ? 'Confirming...'
          : !publicKey
          ? 'Connect Wallet'
          : `${side === 'buy' ? 'Buy' : 'Sell'} Token`}
      </button>
    </div>
  )
}
