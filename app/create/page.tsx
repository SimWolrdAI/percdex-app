'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
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

export default function CreateCoinPage() {
  const { publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<FullLaunchResult | null>(null)
  const [enableFutures, setEnableFutures] = useState(false)
  const [slabCost, setSlabCost] = useState<number | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    description: '',
    twitter: '',
    telegram: '',
    website: '',
    image: null as File | null,
  })

  useEffect(() => {
    getSlabRentCost(connection).then(cost => setSlabCost(cost)).catch(() => {})
  }, [connection])

  const walletAdapter = publicKey && signTransaction ? {
    publicKey,
    signTransaction,
  } : null

  const handleImageChange = (file: File | null) => {
    setFormData({ ...formData, image: file })
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => setImagePreview(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setImagePreview(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!walletAdapter) return
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

      const launchResult = enableFutures
        ? await launchTokenWithPercolator(walletAdapter, metadata, connection)
        : await launchTokenOnly(walletAdapter, metadata, connection)

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
        }, 2500)
      }
    } catch (error) {
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
    <div className="min-h-screen bg-[#0f0f0f]">
      <Sidebar />
      <div className="ml-[200px]">
        <TopBar />
        <main className="px-6 py-8 max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-8">Create a new coin</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Result banner */}
            {result && (
              <div className={`p-4 rounded-xl text-sm ${
                result.success
                  ? 'bg-purple-900/20 border border-purple-800/50 text-purple-300'
                  : 'bg-red-900/20 border border-red-800/50 text-red-300'
              }`}>
                {result.success ? (
                  <div>
                    <p className="font-bold mb-1">Token Launched!</p>
                    <p className="font-mono text-xs break-all opacity-70">Mint: {result.mintAddress}</p>
                    {result.percolatorMarketCreated && (
                      <p className="mt-1 text-purple-300">Leverage trading enabled</p>
                    )}
                    <p className="mt-2 text-gray-400">Redirecting to trade page...</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-bold mb-1">Launch Failed</p>
                    <p>{result.error}</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid md:grid-cols-[1fr_1.5fr] gap-6">
              {/* Image upload */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Image</label>
                <div
                  className="relative w-full aspect-square bg-[#161616] border-2 border-dashed border-[#333] rounded-2xl overflow-hidden flex items-center justify-center cursor-pointer hover:border-purple-600 transition group"
                  onClick={() => document.getElementById('img-upload')?.click()}
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center">
                      <div className="text-sm mb-2 text-gray-500">Upload image</div>
                      <p className="text-sm text-gray-500 group-hover:text-purple-400 transition">
                        Click to upload
                      </p>
                    </div>
                  )}
                  <input
                    id="img-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageChange(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              {/* Name / Symbol / Description */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-[#161616] border border-[#333] rounded-xl text-white placeholder-gray-500 focus:border-purple-600 focus:outline-none transition"
                    placeholder="Token Name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Ticker *</label>
                  <input
                    type="text"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-3 bg-[#161616] border border-[#333] rounded-xl text-white placeholder-gray-500 focus:border-purple-600 focus:outline-none transition"
                    placeholder="TICKER"
                    maxLength={10}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-3 bg-[#161616] border border-[#333] rounded-xl text-white placeholder-gray-500 focus:border-purple-600 focus:outline-none transition resize-none"
                    rows={3}
                    placeholder="What's this coin about?"
                  />
                </div>
              </div>
            </div>

            {/* Social links */}
            <div>
              <p className="text-sm font-medium text-gray-300 mb-3">Social links <span className="text-gray-600">(optional)</span></p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Twitter</label>
                  <input
                    type="text"
                    value={formData.twitter}
                    onChange={(e) => setFormData({ ...formData, twitter: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm bg-[#161616] border border-[#333] rounded-xl text-white placeholder-gray-600 focus:border-purple-600 focus:outline-none transition"
                    placeholder="@handle"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Telegram</label>
                  <input
                    type="text"
                    value={formData.telegram}
                    onChange={(e) => setFormData({ ...formData, telegram: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm bg-[#161616] border border-[#333] rounded-xl text-white placeholder-gray-600 focus:border-purple-600 focus:outline-none transition"
                    placeholder="t.me/..."
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Website</label>
                  <input
                    type="text"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm bg-[#161616] border border-[#333] rounded-xl text-white placeholder-gray-600 focus:border-purple-600 focus:outline-none transition"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>

            {/* Leverage toggle */}
            <div
              className={`border rounded-2xl p-5 transition cursor-pointer ${
                enableFutures
                  ? 'border-purple-600 bg-purple-900/10 glow-purple'
                  : 'border-[#333] bg-[#161616] hover:border-[#444]'
              }`}
              onClick={() => setEnableFutures(!enableFutures)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${
                    enableFutures ? 'bg-purple-600/30' : 'bg-[#222]'
                  }`}>
                    Lev
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">Enable Leverage Trading</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Long/Short up to 20x with Percolator</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`w-11 h-6 rounded-full transition relative ${
                    enableFutures ? 'bg-purple-600' : 'bg-[#333]'
                  }`}>
                    <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${
                      enableFutures ? 'left-[22px]' : 'left-0.5'
                    }`} />
                  </div>
                  <p className={`text-xs mt-1 font-mono ${enableFutures ? 'text-purple-400' : 'text-gray-600'}`}>
                    ~{slabCost ? slabCost.toFixed(1) : '7'} SOL
                  </p>
                </div>
              </div>

              {enableFutures && (
                <div className="mt-4 pt-4 border-t border-purple-800/30 grid grid-cols-2 gap-3 text-xs text-gray-400">
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400">●</span>
                    5% maintenance margin
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400">●</span>
                    10% initial margin
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400">●</span>
                    0.1% trading fee
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400">●</span>
                    wSOL collateral
                  </div>
                  <div className="col-span-2 text-purple-300/70">
                    Slab rent is refundable if market is closed later
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !publicKey}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-2xl font-bold text-base hover:from-purple-700 hover:to-purple-800 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-lg shadow-purple-600/20"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  Launching...
                </span>
              ) : !publicKey ? (
                'Connect Wallet to Create'
              ) : enableFutures ? (
                `Create coin + Leverage (~${slabCost ? (slabCost + 0.02).toFixed(1) : '7'} SOL)`
              ) : (
                'Create coin (~0.02 SOL)'
              )}
            </button>

            {/* Cost breakdown */}
            <div className="text-center text-xs text-gray-600">
              <p>Token deploys on Pump.fun bonding curve · Solana Mainnet</p>
              {!enableFutures && (
                <p className="mt-1">Leverage can be enabled later from the trade page</p>
              )}
            </div>
          </form>
        </main>
      </div>
    </div>
  )
}

