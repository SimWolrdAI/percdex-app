import { NextRequest, NextResponse } from 'next/server'

const PUMP_API = 'https://frontend-api-v2.pump.fun'

/**
 * Server-side proxy for Pump.fun API to avoid CORS issues.
 *
 * GET /api/pump?mint=<MINT>           → coin data (price, image, etc.)
 * GET /api/pump?candles=<MINT>        → candlestick chart data
 * GET /api/pump?metadata=<IPFS_URI>   → fetch IPFS metadata JSON → extract image
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const mint = searchParams.get('mint')
  const candles = searchParams.get('candles')
  const metadataUrl = searchParams.get('metadata')

  // --- Coin data (price + image) ---
  if (mint) {
    try {
      const resp = await fetch(`${PUMP_API}/coins/${mint}`, {
        cache: 'no-store',
      })
      if (!resp.ok) {
        return NextResponse.json(null, { status: resp.status })
      }
      const data = await resp.json()
      return NextResponse.json(data)
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  // --- Candlestick data ---
  if (candles) {
    try {
      const offset = searchParams.get('offset') || '0'
      const limit = searchParams.get('limit') || '200'
      const timeframe = searchParams.get('timeframe') || '5'
      const resp = await fetch(
        `${PUMP_API}/candlesticks/${candles}?offset=${offset}&limit=${limit}&timeframe=${timeframe}`,
        { cache: 'no-store' }
      )
      if (!resp.ok) {
        return NextResponse.json(null, { status: resp.status })
      }
      const data = await resp.json()
      return NextResponse.json(data)
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  // --- Metadata (IPFS JSON → image) ---
  if (metadataUrl) {
    try {
      const resp = await fetch(metadataUrl)
      if (!resp.ok) {
        return NextResponse.json(null, { status: resp.status })
      }
      const json = await resp.json()
      return NextResponse.json({
        image: json.image || json.image_url || json.image_uri || null,
      })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Provide ?mint=, ?candles=, or ?metadata=' }, { status: 400 })
}
