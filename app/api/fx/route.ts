import { NextResponse } from 'next/server'

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

// range → interval 매핑 (데이터 포인트 수 최적화)
const INTERVAL: Record<string, string> = {
  '1mo': '1d',
  '3mo': '1d',
  '1y':  '1wk',
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pair  = searchParams.get('pair')  ?? 'USDKRW=X'
  const range = searchParams.get('range') ?? '1mo'
  const interval = INTERVAL[range] ?? '1d'

  const url = `${YF_BASE}/${encodeURIComponent(pair)}?interval=${interval}&range=${range}`

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      // Vercel edge 캐시 1시간
      next: { revalidate: 3600 },
    })

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance returned ${resp.status}` },
        { status: resp.status }
      )
    }

    const raw = await resp.json()
    const result = raw?.chart?.result?.[0]
    if (!result) {
      return NextResponse.json({ error: 'No result from Yahoo Finance' }, { status: 404 })
    }

    const timestamps: number[]     = result.timestamp ?? []
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? []

    const series = timestamps
      .map((ts, i) => ({
        t:    new Date(ts * 1000).toISOString().split('T')[0],
        rate: closes[i] != null ? Math.round(closes[i]! * 100) / 100 : null,
      }))
      .filter(p => p.rate !== null) as { t: string; rate: number }[]

    const current   = series.at(-1)?.rate  ?? 0
    const prev      = series.at(-2)?.rate  ?? current
    const changePct = prev ? Math.round((current - prev) / prev * 10000) / 100 : 0
    const changeAbs = Math.round((current - prev) * 100) / 100

    return NextResponse.json({
      pair,
      current,
      change_abs: changeAbs,
      change_pct: changePct,
      series,
      updated_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[api/fx]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
