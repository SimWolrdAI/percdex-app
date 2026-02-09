'use client'

import { useEffect, useRef, useState } from 'react'

interface TradingChartProps {
  tokenMint: string
}

export function TradingChart({ tokenMint }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const seriesRef = useRef<any>(null)
  const [chartLibLoaded, setChartLibLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    
    async function initChart() {
      if (!chartContainerRef.current) return
      
      try {
        const lc = await import('lightweight-charts')
        if (!mounted || !chartContainerRef.current) return
        
        setChartLibLoaded(true)

        const chart = lc.createChart(chartContainerRef.current, {
          width: chartContainerRef.current.clientWidth,
          height: 400,
          layout: {
            background: { color: '#0f0f0f' },
            textColor: '#666',
          },
          grid: {
            vertLines: { color: '#1a1a1a' },
            horzLines: { color: '#1a1a1a' },
          },
          crosshair: {
            mode: 0 as any,
          },
          timeScale: {
            timeVisible: true,
            secondsVisible: false,
            borderColor: '#222',
          },
          rightPriceScale: {
            borderColor: '#222',
          },
        })

        // v5 compatible: try addCandlestickSeries first, then addSeries
        let candleSeries: any
        const seriesOpts = {
          upColor: '#22c55e',
          downColor: '#ef4444',
          borderVisible: false,
          wickUpColor: '#22c55e',
          wickDownColor: '#ef4444',
        }

        if (typeof (chart as any).addCandlestickSeries === 'function') {
          candleSeries = (chart as any).addCandlestickSeries(seriesOpts)
        } else if (typeof (chart as any).addSeries === 'function') {
          // lightweight-charts v5
          candleSeries = (chart as any).addSeries(lc.CandlestickSeries, seriesOpts)
        } else {
          console.error('No compatible candlestick series method found')
          return
        }

        chartRef.current = chart
        seriesRef.current = candleSeries

        // Try to fetch real trade data via our proxy
        let dataLoaded = false
        try {
          const resp = await fetch(
            `/api/pump?candles=${tokenMint}&offset=0&limit=200&timeframe=5`
          )
          if (resp.ok) {
            const rawData = await resp.json()
            if (Array.isArray(rawData) && rawData.length > 0) {
              const chartData = rawData.map((d: any) => ({
                time: Math.floor(d.timestamp / 1000) as any,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
              }))
              candleSeries.setData(chartData)
              dataLoaded = true
            }
          }
        } catch (e) {
          console.warn('Could not fetch candles:', e)
        }

        // Fallback: try fetching current price to show at least one candle
        if (!dataLoaded) {
          try {
            const coinResp = await fetch(`/api/pump?mint=${tokenMint}`)
            if (coinResp.ok) {
              const coinData = await coinResp.json()
              if (coinData && coinData.virtual_sol_reserves && coinData.virtual_token_reserves) {
                const price = coinData.virtual_sol_reserves / coinData.virtual_token_reserves
                const now = Math.floor(Date.now() / 1000)
                candleSeries.setData([{
                  time: now as any,
                  open: price,
                  high: price * 1.001,
                  low: price * 0.999,
                  close: price,
                }])
              }
            }
          } catch {}
        }

        // Resize handler
        const handleResize = () => {
          if (chartContainerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: chartContainerRef.current.clientWidth,
            })
          }
        }
        window.addEventListener('resize', handleResize)

        // Live price updates via proxy
        const priceInterval = setInterval(async () => {
          try {
            const resp = await fetch(`/api/pump?mint=${tokenMint}`)
            if (resp.ok) {
              const data = await resp.json()
              if (data && data.virtual_sol_reserves && data.virtual_token_reserves) {
                const priceInSol = data.virtual_sol_reserves / data.virtual_token_reserves
                const now = Math.floor(Date.now() / 1000)
                candleSeries.update({
                  time: now as any,
                  open: priceInSol,
                  high: priceInSol * 1.001,
                  low: priceInSol * 0.999,
                  close: priceInSol,
                })
              }
            }
          } catch {}
        }, 10000)

        return () => {
          clearInterval(priceInterval)
          window.removeEventListener('resize', handleResize)
          if (chartRef.current) {
            chartRef.current.remove()
            chartRef.current = null
          }
        }
      } catch (e) {
        console.error('Chart init error:', e)
      }
    }

    const cleanup = initChart()
    
    return () => {
      mounted = false
      cleanup?.then(fn => fn?.())
    }
  }, [tokenMint])

  return (
    <div className="w-full">
      <div ref={chartContainerRef} className="w-full rounded-xl overflow-hidden" />
      {!chartLibLoaded && (
        <div className="h-[400px] bg-[#0f0f0f] rounded-xl flex items-center justify-center">
          <div className="animate-pulse text-gray-500">Loading chart...</div>
        </div>
      )}
    </div>
  )
}
