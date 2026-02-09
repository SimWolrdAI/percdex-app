'use client'

import Link from 'next/link'
import type { LaunchedToken } from '@/lib/tokenRegistry'

export interface TokenCardData extends LaunchedToken {
  priceInSol?: number
  marketCap?: number
  priceChange?: number // percentage
  imageUrl?: string
}

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

export function TokenCard({ token }: { token: TokenCardData }) {
  const hasLeverage = !!token.percolatorSlab
  const change = token.priceChange ?? 0
  const isPositive = change >= 0
  const creatorShort = token.creator ? `${token.creator.slice(0, 6)}` : ''

  return (
    <Link
      href={`/trade?token=${token.mint}`}
      className="token-card block bg-[#161616] border border-[#222] rounded-2xl overflow-hidden"
    >
      {/* Image */}
      <div className="relative w-full aspect-square bg-[#1a1a1a] overflow-hidden">
        {token.imageUrl ? (
          <img
            src={token.imageUrl}
            alt={token.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl bg-gradient-to-br from-purple-900/30 to-[#1a1a1a]">
            {token.symbol?.charAt(0) || '?'}
          </div>
        )}

        {/* Leverage badge */}
        {hasLeverage && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-purple-600/90 backdrop-blur-sm rounded-lg text-[10px] font-bold text-white flex items-center gap-1">
            LEVERAGE
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        {/* Name + ticker */}
        <div>
          <h3 className="font-semibold text-white text-sm truncate">{token.name}</h3>
          <p className="text-xs text-gray-500">{token.symbol}</p>
        </div>

        {/* Creator + time */}
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="text-purple-400">●</span>
          <span className="font-mono">{creatorShort}</span>
          <span className="ml-auto">{timeAgo(token.createdAt)}</span>
        </div>

        {/* Market cap + change */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">MC</span>
            <span className="text-xs font-bold text-white font-mono">
              {token.marketCap !== undefined ? formatMcap(token.marketCap) : '—'}
            </span>
          </div>

          {/* Progress bar (simplified bonding curve) */}
          <div className="flex items-center gap-2">
            <div className="w-12 h-1.5 bg-[#222] rounded-full overflow-hidden">
              <div
                className="h-full bonding-bar rounded-full"
                style={{ width: `${Math.min(100, Math.random() * 80 + 10)}%` }}
              />
            </div>

            {change !== 0 && (
              <span className={`text-xs font-bold font-mono ${isPositive ? 'text-purple-400' : 'text-red-400'}`}>
                {isPositive ? '↑' : '↓'}{Math.abs(change).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

/** Larger featured card for trending section */
export function TrendingCard({ token }: { token: TokenCardData }) {
  const hasLeverage = !!token.percolatorSlab

  return (
    <Link
      href={`/trade?token=${token.mint}`}
      className="token-card block bg-[#161616] border border-[#222] rounded-2xl overflow-hidden min-w-[260px] max-w-[300px] flex-shrink-0"
    >
      {/* Image */}
      <div className="relative w-full h-[180px] bg-[#1a1a1a] overflow-hidden">
        {token.imageUrl ? (
          <img src={token.imageUrl} alt={token.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl bg-gradient-to-br from-purple-900/40 to-[#1a1a1a]">
            {token.symbol?.charAt(0) || '?'}
          </div>
        )}

        {hasLeverage && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-purple-600/90 backdrop-blur-sm rounded-lg text-[10px] font-bold text-white">
            LEVERAGE
          </div>
        )}

        {/* Mcap overlay */}
        <div className="absolute bottom-2 left-3">
          <p className="text-lg font-bold text-white drop-shadow-lg">
            {token.marketCap !== undefined ? formatMcap(token.marketCap) : '—'}
          </p>
          <p className="text-xs text-gray-300 drop-shadow-lg">
            {token.name} <span className="text-gray-400">{token.symbol}</span>
          </p>
        </div>
      </div>

      {/* Description */}
      <div className="px-3 py-2.5">
        <p className="text-xs text-gray-400 line-clamp-2">
          {token.description || `${token.name} — launched on PercDex`}
        </p>
      </div>
    </Link>
  )
}

