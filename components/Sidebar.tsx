'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

// ─── SVG Icons ───────────────────────────────────────────

function IconHome({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function IconTerminal({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <polyline points="7 8 10 11 7 14" />
      <line x1="13" y1="14" x2="17" y2="14" />
    </svg>
  )
}

function IconProfile({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
    </svg>
  )
}

function IconLeverage({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
    </svg>
  )
}

function IconTwitter() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function IconGithub() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

function IconInfo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

// ─── Nav config ──────────────────────────────────────────

interface NavItem {
  href: string
  label: string
  icon: (props: { active?: boolean }) => React.ReactNode
  matchPrefix?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: IconHome },
  { href: '/leverage', label: 'Leverage', icon: IconLeverage },
  { href: '/trade', label: 'Terminal', icon: IconTerminal, matchPrefix: true },
]

// ─── "How it works" modal ────────────────────────────────

function HowItWorksModal({ onClose }: { onClose: () => void }) {
  const handleClose = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(HOW_IT_WORKS_KEY, '1')
    }
    onClose()
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-[#141414] border border-[#222] rounded-2xl w-[420px] max-w-[90vw] p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white text-center mb-4">How it works</h2>

        <p className="text-sm text-gray-400 text-center leading-relaxed mb-5">
          PercDex is a <span className="text-purple-400">decentralized exchange</span> built on Solana
          that combines <span className="text-purple-400">meme coin launching</span> with{' '}
          <span className="text-purple-400">leveraged futures trading</span> powered by{' '}
          <span className="text-white font-medium">Percolator protocol</span>.
          Create any token, trade it on the bonding curve, and enable up to{' '}
          <span className="text-purple-400">20x leverage</span> (long/short) for the community.
        </p>

        <div className="space-y-3 mb-5">
          <div className="text-sm text-center text-gray-300">
            <span className="font-bold text-white">Step 1:</span> create your coin (name, ticker, image) and it launches on the <span className="text-purple-400">Pump.fun</span> bonding curve
          </div>
          <div className="text-sm text-center text-gray-300">
            <span className="font-bold text-white">Step 2:</span> anyone can buy &amp; sell your coin instantly on-chain
          </div>
          <div className="text-sm text-center text-gray-300">
            <span className="font-bold text-white">Step 3:</span> enable <span className="text-purple-400">Percolator futures</span> to unlock leveraged trading (long/short up to 20x)
          </div>
          <div className="text-sm text-center text-gray-300">
            <span className="font-bold text-white">Step 4:</span> pay solo or start a <span className="text-purple-400">community fundraise</span> to cover the slab rent
          </div>
        </div>

        <div className="bg-purple-900/15 border border-purple-800/20 rounded-xl p-3 mb-5 space-y-1.5">
          <p className="text-xs text-purple-300 text-center leading-relaxed">
            <span className="text-white font-medium">Token creation:</span> ~0.02 SOL (Pump.fun fee)
          </p>
          <p className="text-xs text-purple-300 text-center leading-relaxed">
            <span className="text-white font-medium">Leverage activation:</span> ~7 SOL (refundable slab rent on Solana)
          </p>
          <p className="text-xs text-purple-300 text-center leading-relaxed">
            <span className="text-white font-medium">Community fundraise:</span> split the cost with other traders
          </p>
        </div>

        <p className="text-xs text-gray-500 text-center mb-5">
          By clicking this button, you agree to the terms and conditions and
          certify that you are over 18 years old
        </p>

        <button
          onClick={handleClose}
          className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition"
        >
          I&apos;m ready to trade
        </button>

      </div>
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────

const HOW_IT_WORKS_KEY = 'percdex_seen_how_it_works'

export function Sidebar() {
  const pathname = usePathname()
  const [showHowItWorks, setShowHowItWorks] = useState(false)

  // Show modal on first visit
  useEffect(() => {
    if (typeof window === 'undefined') return
    const seen = localStorage.getItem(HOW_IT_WORKS_KEY)
    if (!seen) {
      setShowHowItWorks(true)
    }
  }, [])

  return (
    <>
      <aside className="fixed left-0 top-0 h-screen w-[200px] bg-[#0d0d0d] border-r border-[#1a1a1a] flex flex-col z-40">
        {/* Logo */}
        <div className="px-5 pt-5 pb-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/icon.jpeg"
              alt="PercDex"
              width={32}
              height={32}
              className="w-8 h-8 rounded-lg shadow-lg shadow-purple-600/20"
            />
            <span className="text-[17px] font-bold bg-gradient-to-r from-purple-300 to-purple-500 bg-clip-text text-transparent">
              PercDex
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const isActive = item.matchPrefix
              ? pathname?.startsWith(item.href)
              : pathname === item.href
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-purple-600/20 text-purple-300 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.15)]'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]'
                }`}
              >
                <span className={`flex-shrink-0 ${isActive ? 'text-purple-400' : 'text-gray-500'}`}>
                  <Icon active={isActive} />
                </span>
                <span>{item.label}</span>
              </Link>
            )
          })}

          {/* How it works */}
          <button
            onClick={() => setShowHowItWorks(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] transition-all duration-150 w-full"
          >
            <span className="flex-shrink-0"><IconInfo /></span>
            <span>How it works</span>
          </button>
        </nav>

        {/* Create coin button */}
        <div className="px-3 space-y-3 pb-5">
          <Link
            href="/create"
            className="flex items-center justify-center w-full py-2.5 bg-purple-600 text-white rounded-xl font-semibold text-[14px] hover:bg-purple-700 active:bg-purple-800 transition-all duration-150 shadow-lg shadow-purple-600/15"
          >
            Create coin
          </Link>

          {/* Social links */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <a
              href="https://x.com/Perc_Dex"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#161616] border border-[#222] text-gray-500 hover:text-white hover:border-[#333] transition-all duration-150"
              title="Twitter / X"
            >
              <IconTwitter />
            </a>
            <a
              href="https://github.com/PercDex"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#161616] border border-[#222] text-gray-500 hover:text-white hover:border-[#333] transition-all duration-150"
              title="GitHub"
            >
              <IconGithub />
            </a>
          </div>
        </div>
      </aside>

      {/* How it works modal */}
      {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} />}
    </>
  )
}
