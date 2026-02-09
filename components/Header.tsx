'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import Link from 'next/link'

export function Header() {
  const { publicKey, disconnect } = useWallet()
  const { setVisible } = useWalletModal()

  return (
    <header className="border-b border-gray-800 bg-[#0d0d0d]">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Percolator
        </Link>

        <nav className="flex items-center gap-6">
          <Link href="/" className="text-gray-300 hover:text-white transition">
            Launch
          </Link>
          <Link href="/trade" className="text-gray-300 hover:text-white transition">
            Trade
          </Link>

          {publicKey ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 bg-gray-800 px-3 py-1.5 rounded-lg font-mono">
                {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
              </span>
              <button
                onClick={() => disconnect()}
                className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition text-sm"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => setVisible(true)}
              className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-medium"
            >
              Connect Wallet
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}
