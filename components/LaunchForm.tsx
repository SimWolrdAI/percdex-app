'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import {
  launchTokenOnly,
  launchTokenWithPercolator,
  getSlabRentCost,
  getPumpFunPrice,
  getImageFromMetadata,
  type TokenMetadata,
  type FullLaunchResult,
} from '@/lib/pumpfun'
import { saveToken } from '@/lib/tokenRegistry'
import { useRouter } from 'next/navigation'

export function LaunchForm() {
  const { publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<FullLaunchResult | null>(null)
  const [enableFutures, setEnableFutures] = useState(false)
  const [slabCost, setSlabCost] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    description: '',
    twitter: '',
    telegram: '',
    website: '',
    image: null as File | null,
  })

  // Fetch slab rent cost on mount
  useEffect(() => {
    getSlabRentCost(connection).then(cost => setSlabCost(cost)).catch(() => {})
  }, [connection])

  const walletAdapter = publicKey && signTransaction ? {
    publicKey,
    signTransaction,
  } : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!walletAdapter) {
      alert('Please connect your wallet')
      return
    }

    if (!formData.name || !formData.symbol) {
      alert('Name and symbol are required')
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const metadata: TokenMetadata = {
        name: formData.name,
        symbol: formData.symbol.toUpperCase(),
        description: formData.description,
        image: formData.image,
        twitter: formData.twitter || undefined,
        telegram: formData.telegram || undefined,
        website: formData.website || undefined,
      }

      let launchResult: FullLaunchResult

      if (enableFutures) {
        launchResult = await launchTokenWithPercolator(walletAdapter, metadata, connection)
      } else {
        launchResult = await launchTokenOnly(walletAdapter, metadata, connection)
      }

      setResult(launchResult)

      if (launchResult.success && launchResult.mintAddress) {
        // Try to get the image URL: Pump.fun API → IPFS metadata fallback
        let imageUrl: string | undefined
        try {
          const pumpData = await getPumpFunPrice(launchResult.mintAddress)
          imageUrl = pumpData?.imageUrl
        } catch {}
        if (!imageUrl && launchResult.metadataUri) {
          try {
            imageUrl = await getImageFromMetadata(launchResult.metadataUri)
          } catch {}
        }

        await saveToken({
          mint: launchResult.mintAddress,
          name: formData.name,
          symbol: formData.symbol.toUpperCase(),
          description: formData.description,
          createdAt: Date.now(),
          signature: launchResult.signature || '',
          metadataUri: launchResult.metadataUri,
          imageUrl,
          percolatorSlab: launchResult.percolatorSlabAddress,
          creator: walletAdapter.publicKey.toBase58(),
        })

        setTimeout(() => {
          router.push(`/trade?token=${launchResult.mintAddress}`)
        }, 3000)
      }
    } catch (error) {
      console.error('Launch error:', error)
      setResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        percolatorMarketCreated: false,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-[#111] border border-gray-800 p-6 rounded-xl">
      {/* Result banner */}
      {result && (
        <div className={`p-4 rounded-lg text-sm ${
          result.success
            ? 'bg-purple-900/30 border border-purple-700 text-purple-300'
            : 'bg-red-900/30 border border-red-700 text-red-300'
        }`}>
          {result.success ? (
            <div>
              <p className="font-bold mb-1">Token Launched!</p>
              <p className="font-mono text-xs break-all">Mint: {result.mintAddress}</p>
              <p className="font-mono text-xs break-all mt-1">Tx: {result.signature}</p>
              {result.percolatorMarketCreated && (
                <p className="mt-1 text-purple-300">Percolator futures enabled: {result.percolatorSlabAddress?.slice(0, 8)}...</p>
              )}
              {!result.percolatorMarketCreated && (
                <p className="mt-1 text-purple-300">No futures — can be enabled later from trade page</p>
              )}
              <p className="mt-2 text-gray-400">Redirecting to trading page...</p>
            </div>
          ) : (
            <div>
              <p className="font-bold mb-1">Launch Failed</p>
              <p>{result.error}</p>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2 text-gray-300">Token Name *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-4 py-2 border border-gray-700 rounded-lg bg-[#0a0a0a] text-white focus:border-purple-500 focus:outline-none"
          placeholder="My Awesome Token"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-gray-300">Symbol *</label>
        <input
          type="text"
          value={formData.symbol}
          onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
          className="w-full px-4 py-2 border border-gray-700 rounded-lg bg-[#0a0a0a] text-white focus:border-purple-500 focus:outline-none"
          placeholder="MAT"
          maxLength={10}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-gray-300">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-4 py-2 border border-gray-700 rounded-lg bg-[#0a0a0a] text-white focus:border-purple-500 focus:outline-none"
          rows={3}
          placeholder="Describe your token..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-gray-300">Token Image</label>
        <div className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFormData({ ...formData, image: e.target.files?.[0] || null })}
            className="hidden"
            id="image-upload"
          />
          <label
            htmlFor="image-upload"
            className="cursor-pointer text-purple-400 hover:text-purple-300"
          >
            {formData.image ? formData.image.name : 'Click to upload image'}
          </label>
        </div>
      </div>

      {/* Social links */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1 text-gray-500">Twitter</label>
          <input
            type="text"
            value={formData.twitter}
            onChange={(e) => setFormData({ ...formData, twitter: e.target.value })}
            className="w-full px-3 py-1.5 text-sm border border-gray-700 rounded bg-[#0a0a0a] text-white focus:border-purple-500 focus:outline-none"
            placeholder="@handle"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-gray-500">Telegram</label>
          <input
            type="text"
            value={formData.telegram}
            onChange={(e) => setFormData({ ...formData, telegram: e.target.value })}
            className="w-full px-3 py-1.5 text-sm border border-gray-700 rounded bg-[#0a0a0a] text-white focus:border-purple-500 focus:outline-none"
            placeholder="t.me/..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-gray-500">Website</label>
          <input
            type="text"
            value={formData.website}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            className="w-full px-3 py-1.5 text-sm border border-gray-700 rounded bg-[#0a0a0a] text-white focus:border-purple-500 focus:outline-none"
            placeholder="https://..."
          />
        </div>
      </div>

      {/* Futures toggle */}
      <div className={`border rounded-xl p-4 transition ${
        enableFutures 
          ? 'border-purple-500 bg-purple-900/20' 
          : 'border-gray-700 bg-[#0a0a0a]'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enableFutures}
                onChange={(e) => setEnableFutures(e.target.checked)}
                className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
              />
              <div>
                <span className="text-white font-medium">Enable Percolator Futures</span>
                <p className="text-xs text-gray-500 mt-0.5">Long/Short trading with leverage</p>
              </div>
            </label>
          </div>
          <div className="text-right">
            <span className={`text-lg font-bold ${enableFutures ? 'text-purple-400' : 'text-gray-500'}`}>
              ~{slabCost ? slabCost.toFixed(1) : '7'} SOL
            </span>
            <p className="text-xs text-gray-600">slab rent</p>
          </div>
        </div>

        {enableFutures && (
          <div className="mt-3 pt-3 border-t border-purple-800/50 text-xs text-gray-400 space-y-1">
            <p>Uses meme-liquid Percolator program (mainnet)</p>
            <p>5% maintenance margin, 10% initial margin, 0.1% fee</p>
            <p>wSOL collateral, admin-pushed oracle</p>
            <p>Insurance fund grows from fees (soft burn)</p>
            <p className="text-purple-300/70">Slab rent (~{slabCost ? slabCost.toFixed(1) : '7'} SOL) is refundable if market is closed later</p>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-3 text-xs text-gray-500 space-y-1">
        <p>Token deploys on <span className="text-purple-400">Pump.fun</span> bonding curve</p>
        {enableFutures ? (
          <p><span className="text-purple-400">Percolator</span> futures layer will be created on-chain</p>
        ) : (
          <p>Futures can be enabled later from the trade page</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || !publicKey}
        className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-bold hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
      >
        {loading ? (
          'Launching...'
        ) : !publicKey ? (
          'Connect Wallet to Launch'
        ) : enableFutures ? (
          `Launch + Futures (~${slabCost ? (slabCost + 0.02).toFixed(1) : '7'} SOL)`
        ) : (
          'Launch Token (~0.02 SOL)'
        )}
      </button>
    </form>
  )
}
