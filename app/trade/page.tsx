'use client'

import { Suspense } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { TradeContent } from '@/components/TradeContent'

export default function TradePage() {
  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <Sidebar />
      <div className="ml-[200px]">
        <TopBar />
        <Suspense fallback={
          <div className="flex items-center justify-center py-32">
            <div className="text-gray-400 animate-pulse">Loading trading interface...</div>
          </div>
        }>
          <TradeContent />
        </Suspense>
      </div>
    </div>
  )
}
