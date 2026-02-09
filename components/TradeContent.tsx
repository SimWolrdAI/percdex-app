'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { TradingChart } from '@/components/TradingChart'
import { TradingPanel } from '@/components/TradingPanel'
import { FuturesPanel } from '@/components/FuturesPanel'
import { MockFuturesPanel } from '@/components/MockFuturesPanel'
import { PositionList } from '@/components/PositionList'
import { EnableFutures } from '@/components/EnableFutures'
import { getTokenByMint, type LaunchedToken } from '@/lib/tokenRegistry'
import { getPumpFunPrice } from '@/lib/pumpfun'
import { isMockToken, MOCK_SLAB } from '@/lib/mockToken'
import { useWallet } from '@solana/wallet-adapter-react'

type TradeTab = 'spot' | 'futures'

export function TradeContent() {
  const searchParams = useSearchParams()
  const tokenMint = searchParams.get('token') || ''
  const isMock = isMockToken(tokenMint)

  const [tokenInfo, setTokenInfo] = useState<LaunchedToken | null>(null)
  const [priceData, setPriceData] = useState<{ priceInSol: number; marketCap: number; priceUsd: number } | null>(null)
  const [loadingPrice, setLoadingPrice] = useState(true)
  const [activeTab, setActiveTab] = useState<TradeTab>(isMock ? 'futures' : 'spot')
  const [slabAddress, setSlabAddress] = useState<string | null>(isMock ? MOCK_SLAB : null)
  const [tokenLive, setTokenLive] = useState<boolean>(false)

  // Load token info from registry
  useEffect(() => {
    if (!tokenMint) return
    async function loadToken() {
      const info = await getTokenByMint(tokenMint)
      setTokenInfo(info)
      if (isMock) {
        setSlabAddress(MOCK_SLAB)
        setActiveTab('futures')
      } else if (info?.percolatorSlab) {
        setSlabAddress(info.percolatorSlab)
        setActiveTab('futures')
      }
    }
    loadToken()
  }, [tokenMint, isMock])

  // Monitor token CA every second — check if it's live on pump.fun
  useEffect(() => {
    if (!tokenMint) {
      setLoadingPrice(false)
      return
    }

    let mounted = true

    async function fetchPrice() {
      try {
        const data = await getPumpFunPrice(tokenMint)
        if (!mounted) return
        if (data) {
          setPriceData(data)
          setTokenLive(true)
        } else {
          setTokenLive(false)
        }
      } catch (e) {
        console.error('Price fetch error:', e)
        if (mounted) setTokenLive(false)
      } finally {
        if (mounted) setLoadingPrice(false)
      }
    }

    fetchPrice()
    // Poll every 1 second as requested
    const interval = setInterval(fetchPrice, 1000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [tokenMint])


  const handleFuturesEnabled = (newSlabAddress: string) => {
    setSlabAddress(newSlabAddress)
    setActiveTab('futures')
  }

  if (!tokenMint) {
    return (
      <main className="px-6 py-16 text-center">
        <div className="text-3xl mb-4 text-gray-600">No token selected</div>
        <h1 className="text-2xl font-bold mb-3 text-white">Select a Token to Trade</h1>
        <p className="text-gray-500 text-sm">Go to the home page and select a token, or create a new one.</p>
      </main>
    )
  }

  return (
    <main className="px-6 py-6">
        {/* Token header */}
        <div className="bg-[#161616] border border-[#222] rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Token image */}
            {isMock && (
              <img
                src="/icon.jpeg"
                alt="PercDex"
                className="w-10 h-10 rounded-full object-cover"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold text-white">
                {tokenInfo ? `${tokenInfo.name} (${tokenInfo.symbol})` : isMock ? 'Percolator Dex (PercDex)' : `Token ${tokenMint.slice(0, 8)}...`}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-gray-500 font-mono">{tokenMint.slice(0, 12)}...{tokenMint.slice(-6)}</p>
                {slabAddress && (
                  <span className="text-xs px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded-full">
                    Futures
                  </span>
                )}
                {!tokenLive && !loadingPrice && (
                  <span className="text-xs px-2 py-0.5 bg-purple-900/20 text-purple-400 rounded-full animate-pulse">
                    Monitoring...
                  </span>
                )}
                {tokenLive && (
                  <span className="text-xs px-2 py-0.5 bg-purple-900/30 text-purple-300 rounded-full">
                    Live
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right flex items-center gap-4">
            {loadingPrice ? (
              <div className="animate-pulse text-gray-500">Loading...</div>
            ) : priceData ? (
              <div>
                <p className="text-2xl font-bold font-mono text-purple-400">
                  {priceData.priceInSol.toFixed(10)} SOL
                </p>
                <p className="text-sm text-gray-500">
                  MCap: ${priceData.marketCap.toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="text-right">
                <p className="text-gray-500">Waiting for token...</p>
                <p className="text-xs text-gray-600">Polling every 1s</p>
              </div>
            )}
            <a
              href={`https://pump.fun/coin/${tokenMint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition whitespace-nowrap"
            >
              Pump.fun ↗
            </a>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Chart + Trading */}
          <div className="lg:col-span-2 space-y-6">
            {/* Chart */}
            <div className="bg-[#111] border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 text-white">Price Chart</h2>
              <TradingChart tokenMint={tokenMint} />
            </div>

            {/* Trade tabs */}
            <div className="bg-[#111] border border-gray-800 rounded-xl p-6">
              {/* Tab selector */}
              <div className="flex items-center gap-2 mb-6">
                <button
                  onClick={() => setActiveTab('spot')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    activeTab === 'spot'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Spot (Pump.fun)
                </button>
                <button
                  onClick={() => setActiveTab('futures')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    activeTab === 'futures'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Futures (PercDex)
                  {!slabAddress && !isMock && <span className="ml-1 text-xs opacity-60">— not enabled</span>}
                </button>
                <span className="text-xs px-2 py-1 bg-purple-900/20 text-purple-400 rounded-full ml-auto">
                  Mainnet
                </span>
              </div>

              {/* Tab content */}
              {activeTab === 'spot' ? (
                <TradingPanel tokenMint={tokenMint} />
              ) : isMock ? (
                <MockFuturesPanel
                  tokenMint={tokenMint}
                  tokenSymbol={tokenInfo?.symbol || 'PercDex'}
                  currentPriceInSol={priceData?.priceInSol || null}
                />
              ) : slabAddress ? (
                <FuturesPanel
                  tokenMint={tokenMint}
                  slabAddress={slabAddress}
                  currentPriceInSol={priceData?.priceInSol || null}
                />
              ) : (
                <EnableFutures tokenMint={tokenMint} onEnabled={handleFuturesEnabled} />
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Positions */}
            <div className="bg-[#111] border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 text-white">
                {slabAddress ? 'PercDex Position' : 'Positions'}
              </h2>
              {isMock ? (
                <MockPositionSummary tokenMint={tokenMint} />
              ) : (
                <PositionList tokenMint={tokenMint} slabAddress={slabAddress} />
              )}
            </div>


            {/* Token Info */}
            <div className="bg-[#111] border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 text-white">Token Info</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Mint</span>
                  <a
                    href={`https://solscan.io/token/${tokenMint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-purple-400 hover:underline text-xs"
                  >
                    {tokenMint.slice(0, 8)}...{tokenMint.slice(-4)}
                  </a>
                </div>
                {(tokenInfo || isMock) && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Name</span>
                      <span className="text-white">{tokenInfo?.name || 'Percolator Dex'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Symbol</span>
                      <span className="text-white">{tokenInfo?.symbol || 'PercDex'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Created</span>
                      <span className="text-white text-xs">
                        {tokenInfo ? new Date(tokenInfo.createdAt).toLocaleString() : 'Genesis'}
                      </span>
                    </div>
                  </>
                )}
                {priceData && (
                  <>
                    <div className="flex justify-between pt-2 border-t border-gray-800">
                      <span className="text-gray-500">Price</span>
                      <span className="font-mono text-purple-400">{priceData.priceInSol.toFixed(10)} SOL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Market Cap</span>
                      <span className="font-mono text-white">${priceData.marketCap.toLocaleString()}</span>
                    </div>
                  </>
                )}
                <div className="pt-3 space-y-2">
                  <a
                    href={`https://pump.fun/coin/${tokenMint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-sm py-2 bg-purple-900/30 text-purple-300 rounded-lg hover:bg-purple-900/50 transition"
                  >
                    View on Pump.fun ↗
                  </a>
                  <a
                    href={`https://solscan.io/token/${tokenMint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-sm py-2 bg-purple-900/20 text-purple-300 rounded-lg hover:bg-purple-900/40 transition"
                  >
                    View on Solscan ↗
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
  )
}

/** Mock position summary for the sidebar */
function MockPositionSummary({ tokenMint }: { tokenMint: string }) {
  const [positions, setPositions] = useState<any[]>([])
  const { publicKey } = useWallet()

  useEffect(() => {
    if (!publicKey) return
    const key = `percdex_mock_positions_${publicKey.toBase58()}_${tokenMint}`
    const interval = setInterval(() => {
      const stored = localStorage.getItem(key)
      if (stored) {
        try { setPositions(JSON.parse(stored)) } catch {}
      } else {
        setPositions([])
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [publicKey, tokenMint])

  if (!publicKey) {
    return <p className="text-gray-500 text-center py-8">Connect wallet to view positions</p>
  }

  if (positions.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-500">No open position</p>
        <p className="text-gray-600 text-xs mt-1">Open a futures trade to see positions here</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {positions.map((pos: any) => (
        <div key={pos.id} className="border border-gray-700 rounded-lg p-3 bg-[#0a0a0a]">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm font-bold ${pos.side === 'long' ? 'text-purple-400' : 'text-purple-300'}`}>
              {pos.side === 'long' ? 'LONG' : 'SHORT'}
            </span>
            <span className="text-gray-500 text-xs">{pos.leverage}x</span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Collateral</span>
              <span className="font-mono text-white">{pos.collateral?.toFixed(4)} SOL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">PnL</span>
              <span className={`font-mono font-bold ${pos.pnl >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                {pos.pnl >= 0 ? '+' : ''}{pos.pnl?.toFixed(6)} SOL
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
