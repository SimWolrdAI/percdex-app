'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function TopBar() {
  const { publicKey, disconnect } = useWallet()
  const { setVisible } = useWalletModal()
  const [search, setSearch] = useState('')
  const router = useRouter()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) {
      // If it looks like a mint address, go to trade page
      if (search.trim().length >= 32) {
        router.push(`/trade?token=${search.trim()}`)
      }
      setSearch('')
    }
  }

  return (
    <header className="sticky top-0 z-30 bg-[#0f0f0f]/80 backdrop-blur-xl border-b border-[#222]">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-xl">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by token or mint address..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-600 transition"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] text-gray-500 bg-[#222] border border-[#333] rounded">
              ⌘K
            </kbd>
          </div>
        </form>

        {/* Right side */}
        <div className="flex items-center gap-3 ml-6">
          <Link
            href="/create"
            className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl text-sm font-semibold hover:from-purple-700 hover:to-purple-800 transition shadow-lg shadow-purple-600/10 whitespace-nowrap"
          >
            Create coin
          </Link>

          {publicKey ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 bg-[#1a1a1a] border border-[#333] px-3 py-2 rounded-xl font-mono">
                {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
              </span>
              <button
                onClick={() => disconnect()}
                className="px-3 py-2 bg-[#1a1a1a] border border-[#333] text-gray-400 rounded-xl hover:bg-[#222] hover:text-white transition text-sm"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setVisible(true)}
              className="px-4 py-2.5 bg-[#1a1a1a] border border-[#333] text-white rounded-xl text-sm font-medium hover:bg-[#222] transition"
            >
              Log in
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
