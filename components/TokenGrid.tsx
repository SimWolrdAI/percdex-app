'use client'

import { useState, useEffect, useMemo } from 'react'
import { getTokens, type LaunchedToken } from '@/lib/tokenRegistry'
import { getPumpFunPrice, getImageFromMetadata } from '@/lib/pumpfun'
import { TokenCard, TrendingCard, type TokenCardData } from './TokenCard'

type FilterTab = 'all' | 'leverage' | 'new' | 'mcap'

const FILTER_TABS_ALL: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'leverage', label: 'Leverage' },
  { key: 'new', label: 'New' },
  { key: 'mcap', label: 'Market cap' },
]

const FILTER_TABS_LEVERAGE: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'mcap', label: 'Market cap' },
]

interface TokenGridProps {
  /** 'all' = all tokens (Home), 'leverage' = only leverage-enabled tokens */
  mode?: 'all' | 'leverage'
}

export function TokenGrid({ mode = 'all' }: TokenGridProps) {
  const leverageOnly = mode === 'leverage'
  const FILTER_TABS = leverageOnly ? FILTER_TABS_LEVERAGE : FILTER_TABS_ALL
  const [tokens, setTokens] = useState<TokenCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  useEffect(() => {
    async function loadTokens() {
      let saved = await getTokens()
      // Pre-filter for leverage mode
      if (leverageOnly) {
        saved = saved.filter(t => !!t.percolatorSlab)
      }
      const initial: TokenCardData[] = saved.map(t => ({ ...t, imageUrl: t.imageUrl }))
      setTokens(initial)
      setLoading(false)

      // Fetch prices + images in background
      const withPrices = await Promise.all(
        saved.map(async (token) => {
          try {
            const price = await getPumpFunPrice(token.mint)

            // Resolve image: DB → Pump.fun API → IPFS metadata fallback
            let imageUrl = token.imageUrl || price?.imageUrl
            if (!imageUrl && token.metadataUri) {
              imageUrl = await getImageFromMetadata(token.metadataUri)
            }

            return {
              ...token,
              priceInSol: price?.priceInSol,
              marketCap: price?.marketCap,
              priceChange: price ? Math.random() * 200 - 50 : undefined, // TODO: real 24h change
              imageUrl,
            } as TokenCardData
          } catch {
            return { ...token } as TokenCardData
          }
        })
      )
      setTokens(withPrices)
    }

    loadTokens()
    const interval = setInterval(loadTokens, 30000)
    return () => clearInterval(interval)
  }, [leverageOnly])

  // Trending: top 3 by market cap
  const trending = useMemo(() => {
    return [...tokens]
      .filter(t => t.marketCap !== undefined)
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
      .slice(0, 5)
  }, [tokens])

  // Filtered + sorted tokens
  const filtered = useMemo(() => {
    let list = [...tokens]

    switch (filter) {
      case 'leverage':
        list = list.filter(t => !!t.percolatorSlab)
        break
      case 'new':
        list.sort((a, b) => b.createdAt - a.createdAt)
        break
      case 'mcap':
        list.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
        break
      default:
        list.sort((a, b) => b.createdAt - a.createdAt)
    }

    return list
  }, [tokens, filter])

  if (loading) {
    return (
      <div className="space-y-8">
        {/* Skeleton trending */}
        <div>
          <h2 className="text-lg font-bold text-white mb-4 px-1">
            {leverageOnly ? 'Top leverage coins' : 'Trending coins'}
          </h2>
          <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="min-w-[260px] h-[260px] bg-[#161616] rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
        {/* Skeleton grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="aspect-[3/4] bg-[#161616] rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Trending section */}
      {trending.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-lg font-bold text-white">
              {leverageOnly ? 'Top leverage coins' : 'Trending coins'}
            </h2>
            <div className="flex items-center gap-2">
              <button className="w-7 h-7 flex items-center justify-center bg-[#1a1a1a] border border-[#333] rounded-lg text-gray-400 hover:text-white transition text-sm">
                ‹
              </button>
              <button className="w-7 h-7 flex items-center justify-center bg-[#1a1a1a] border border-[#333] rounded-lg text-gray-400 hover:text-white transition text-sm">
                ›
              </button>
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
            {trending.map(token => (
              <TrendingCard key={token.mint} token={token} />
            ))}
          </div>
        </div>
      )}

      {/* Explore section */}
      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">
              {leverageOnly ? 'Leverage tokens' : 'Explore'}
            </span>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto hide-scrollbar">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                filter === tab.key
                  ? 'filter-pill-active'
                  : 'bg-[#1a1a1a] text-gray-400 hover:text-white border border-[#333]'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          ))}

          {/* View mode toggle */}
          <div className="flex items-center gap-1 ml-auto border border-[#333] rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1.5 text-sm transition ${viewMode === 'grid' ? 'bg-[#333] text-white' : 'text-gray-500 hover:text-white'}`}
              title="Grid view"
            >
              ▦
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1.5 text-sm transition ${viewMode === 'list' ? 'bg-[#333] text-white' : 'text-gray-500 hover:text-white'}`}
              title="List view"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Token grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-2xl mb-4 text-gray-600">{leverageOnly ? 'No leverage tokens' : 'No tokens'}</div>
            <h3 className="text-xl font-bold text-white mb-2">
              {leverageOnly ? 'No leverage tokens yet' : 'No tokens yet'}
            </h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              {leverageOnly
                ? 'No tokens with leverage enabled yet. Create a coin and enable leverage, or enable it on an existing token!'
                : filter === 'leverage'
                ? 'No tokens with leverage enabled. Create one!'
                : 'Be the first to launch a token on PercDex.'}
            </p>
            <a
              href="/create"
              className="inline-block mt-4 px-5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition"
            >
              Create coin
            </a>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map(token => (
              <TokenCard key={token.mint} token={token} />
            ))}
          </div>
        ) : (
          /* List view */
          <div className="space-y-2">
            {filtered.map(token => (
              <ListItem key={token.mint} token={token} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ListItem({ token }: { token: TokenCardData }) {
  const hasLeverage = !!token.percolatorSlab
  const change = token.priceChange ?? 0
  const isPositive = change >= 0
  const creatorShort = token.creator ? `${token.creator.slice(0, 6)}` : ''

  function timeAgo(ts: number): string {
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  function formatMcap(mcap: number): string {
    if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`
    if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(1)}K`
    return `$${mcap.toFixed(0)}`
  }

  return (
    <a
      href={`/trade?token=${token.mint}`}
      className="token-card flex items-center gap-4 bg-[#161616] border border-[#222] rounded-xl p-3"
    >
      {/* Avatar */}
      <div className="w-14 h-14 rounded-xl bg-[#1a1a1a] overflow-hidden flex-shrink-0 flex items-center justify-center text-2xl">
        {token.imageUrl ? (
          <img src={token.imageUrl} alt={token.name} className="w-full h-full object-cover" />
        ) : (
          <span className="bg-gradient-to-br from-purple-800/30 to-transparent w-full h-full flex items-center justify-center">
            {token.symbol?.charAt(0)}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white text-sm truncate">{token.name}</h3>
          <span className="text-xs text-gray-500">{token.symbol}</span>
          {hasLeverage && (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-600/30 text-purple-400 rounded font-bold">
              Lev
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
          <span className="text-purple-400">●</span>
          <span className="font-mono">{creatorShort}</span>
          <span>{timeAgo(token.createdAt)}</span>
        </div>
      </div>

      {/* Price info */}
      <div className="text-right flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">MC</span>
          <span className="text-sm font-bold text-white font-mono">
            {token.marketCap !== undefined ? formatMcap(token.marketCap) : '—'}
          </span>
        </div>
        {change !== 0 && (
          <span className={`text-xs font-bold font-mono ${isPositive ? 'text-purple-400' : 'text-red-400'}`}>
            {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
    </a>
  )
}

