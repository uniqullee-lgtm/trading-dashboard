import { NextResponse } from 'next/server'

const BASE_PAPER = 'https://paper-api.alpaca.markets'
const BASE_LIVE  = 'https://api.alpaca.markets'

// period → timeframe 기본값
const TF_MAP: Record<string, string> = {
  '1W': '1H',
  '1M': '1D',
  '3M': '1D',
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period    = searchParams.get('period')    ?? '1M'
  const timeframe = searchParams.get('timeframe') ?? (TF_MAP[period] ?? '1D')

  const key    = process.env.ALPACA_API_KEY
  const secret = process.env.ALPACA_SECRET_KEY
  const paper  = (process.env.ALPACA_PAPER ?? 'true') !== 'false'

  if (!key || !secret) {
    return NextResponse.json(
      { error: 'ALPACA_API_KEY / ALPACA_SECRET_KEY 환경변수 미설정', series: [] },
      { status: 503 }
    )
  }

  const base = paper ? BASE_PAPER : BASE_LIVE
  const url  = `${base}/v2/account/portfolio/history?timeframe=${timeframe}&period=${period}`
  const auth = Buffer.from(`${key}:${secret}`).toString('base64')

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      next: { revalidate: 300 }, // 5분 캐시
    })

    if (!resp.ok) {
      const body = await resp.text()
      return NextResponse.json(
        { error: `Alpaca ${resp.status}: ${body.slice(0, 120)}`, series: [] },
        { status: resp.status }
      )
    }

    const raw = await resp.json()
    const timestamps: number[]          = raw.timestamp ?? []
    const equities:   (number | null)[] = raw.equity    ?? []

    const series = timestamps
      .map((ts, i) => ({
        t:      new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 16),
        equity: equities[i] ?? 0,
      }))
      .filter(p => p.equity > 0)

    const first = series[0]?.equity  ?? 0
    const last  = series.at(-1)?.equity ?? 0
    const peak  = Math.max(...series.map(p => p.equity))

    return NextResponse.json({
      series,
      base_value: raw.base_value ?? first,
      current:    last,
      peak,
      change_pct: first > 0 ? Math.round((last - first) / first * 10000) / 100 : 0,
    })
  } catch (err) {
    console.error('[api/portfolio-history]', err)
    return NextResponse.json({ error: String(err), series: [] }, { status: 500 })
  }
}
