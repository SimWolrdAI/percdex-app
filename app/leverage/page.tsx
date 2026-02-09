'use client'

import { useEffect } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { TokenGrid } from '@/components/TokenGrid'
import { seedMockToken } from '@/lib/mockToken'

export default function LeveragePage() {
  useEffect(() => {
    seedMockToken().catch(console.error)
  }, [])

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <Sidebar />
      <div className="ml-[200px]">
        <TopBar />
        <main className="px-6 py-6">
          <TokenGrid mode="leverage" />
        </main>
      </div>
    </div>
  )
}

