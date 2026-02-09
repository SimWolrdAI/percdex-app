'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getTokens, type LaunchedToken } from '@/lib/tokenRegistry'
import { getPumpFunPrice } from '@/lib/pumpfun'

interface TokenWithPrice extends LaunchedToken {
  priceInSol?: number
  marketCap?: number
}

export function TokenList() {
  const [tokens, setTokens] = useState<TokenWithPrice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadTokens() {
      const saved = await getTokens()
      setTokens(saved)
      setLoading(false)

      // Fetch prices in background
      const withPrices = await Promise.all(
        saved.map(async (token) => {
          try {
            const price = await getPumpFunPrice(token.mint)
            return {
              ...token,
              priceInSol: price?.priceInSol,
              marketCap: price?.marketCap,
            }
          } catch {
            return token
          }
        })
      )
      setTokens(withPrices)
    }

    loadTokens()
    // Refresh every 30s
    const interval = setInterval(loadTokens, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-[#111] border border-gray-800 rounded-xl p-8 text-center">
        <p className="text-gray-500 animate-pulse">Loading tokens...</p>
      </div>
    )
  }

  if (tokens.length === 0) {
    return (
      <div className="bg-[#111] border border-gray-800 rounded-xl p-8 text-center">
        <p className="text-gray-500 mb-2">No tokens launched yet</p>
        <p className="text-gray-600 text-sm">Launch your first token above!</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {tokens.map((token) => (
        <Link
          key={token.mint}
          href={`/trade?token=${token.mint}`}
          className="block bg-[#111] border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white group-hover:text-purple-400 transition">
                {token.name}
              </h3>
              <p className="text-sm text-gray-500">{token.symbol}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  token.percolatorSlab 
                    ? 'bg-purple-900/30 text-purple-400' 
                    : 'bg-purple-900/20 text-purple-300'
                }`}>
                  {token.percolatorSlab ? 'Percolator' : 'Pump.fun'}
                </span>
                <span className="text-xs text-gray-600">
                  {new Date(token.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="text-right">
              {token.priceInSol !== undefined ? (
                <>
                  <p className="font-semibold text-white font-mono">
                    {token.priceInSol.toFixed(8)} SOL
                  </p>
                  {token.marketCap !== undefined && (
                    <p className="text-xs text-gray-500">
                      MCap: ${token.marketCap.toLocaleString()}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-600 font-mono">
                  {token.mint.slice(0, 6)}...
                </p>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
