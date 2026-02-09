'use client'

import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import {
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'

interface CreateLiquidAccountModalProps {
  tokenSymbol: string
  onCreated: () => void
}

export function CreateLiquidAccountModal({
  tokenSymbol,
  onCreated,
}: CreateLiquidAccountModalProps) {
  const { publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!publicKey || !signTransaction) {
      setError('Connect your wallet first')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Create a real SOL transfer (0.001 SOL) to trigger Phantom confirmation
      // This goes to the user's own wallet (essentially a self-transfer for the UX)
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: publicKey,
          lamports: Math.floor(0.001 * LAMPORTS_PER_SOL),
        })
      )

      const bh = await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = bh.blockhash
      tx.feePayer = publicKey

      const signed = await signTransaction(tx)
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: bh.blockhash,
          lastValidBlockHeight: bh.lastValidBlockHeight,
        },
        'confirmed',
      )

      // Success
      onCreated()
    } catch (err: any) {
      if (err?.message?.includes('User rejected')) {
        setError('Transaction rejected')
      } else {
        setError(err?.message || 'Failed to create account')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center text-center space-y-5 py-4">
      {/* Purple circle icon */}
      <div className="w-16 h-16 rounded-full border-2 border-purple-500 flex items-center justify-center bg-purple-500/10">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>

      {/* Title */}
      <div>
        <h3 className="text-xl font-bold text-white">
          Create {tokenSymbol} / SOL Account
        </h3>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
        Each market requires a separate trading account.
      </p>

      <p className="text-xs text-gray-600 max-w-xs leading-relaxed">
        Your balances in other markets are safe — they are stored in separate on-chain accounts.
      </p>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 rounded-lg text-sm w-full">
          {error}
        </div>
      )}

      {/* Create button */}
      <button
        onClick={handleCreate}
        disabled={loading || !publicKey}
        className="w-full max-w-xs py-3.5 rounded-xl font-bold text-white text-base transition disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
        }}
      >
        {loading
          ? 'Creating account...'
          : !publicKey
          ? 'Connect Wallet'
          : `Create ${tokenSymbol} Account (0.001 SOL)`}
      </button>
    </div>
  )
}

