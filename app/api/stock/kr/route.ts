import { NextRequest, NextResponse } from 'next/server'

const DART_KEY  = process.env.DART_API_KEY || ''
const DART_BASE = 'https://opendart.fss.or.kr/api'

// ── 주요 한국 상장사 corp_code 맵 ─────────────────────────────────────────
// stock_code → { corp_code, corp_cls: 'Y'=코스피, 'K'=코스닥 }
const KR_CORP_MAP: Record<string, { corp_code: string; corp_cls: string }> = {
  '005930': { corp_code: '00126380', corp_cls: 'Y' }, // 삼성전자
  '000660': { corp_code: '00164779', corp_cls: 'Y' }, // SK하이닉스
  '005380': { corp_code: '00164742', corp_cls: 'Y' }, // 현대차
  '005490': { corp_code: '00164760', corp_cls: 'Y' }, // POSCO홀딩스
  '035420': { corp_code: '00293886', corp_cls: 'Y' }, // NAVER
  '035720': { corp_code: '00918444', corp_cls: 'K' }, // 카카오
  '068270': { corp_code: '00119010', corp_cls: 'K' }, // 셀트리온
  '051910': { corp_code: '00194126', corp_cls: 'Y' }, // LG화학
  '006400': { corp_code: '00126720', corp_cls: 'Y' }, // 삼성SDI
  '000270': { corp_code: '00164725', corp_cls: 'Y' }, // 기아
  '105560': { corp_code: '00859504', corp_cls: 'Y' }, // KB금융
  '055550': { corp_code: '00421649', corp_cls: 'Y' }, // 신한지주
  '096770': { corp_code: '00156524', corp_cls: 'Y' }, // SK이노베이션
  '015760': { corp_code: '00107462', corp_cls: 'Y' }, // 한국전력
  '066570': { corp_code: '00401731', corp_cls: 'Y' }, // LG전자
  '012450': { corp_code: '00165666', corp_cls: 'Y' }, // 한화에어로스페이스
  '086520': { corp_code: '00296699', corp_cls: 'K' }, // 에코프로
  '247540': { corp_code: '01247452', corp_cls: 'K' }, // 에코프로비엠
  '352820': { corp_code: '01268790', corp_cls: 'K' }, // 하이브
  '011200': { corp_code: '00182543', corp_cls: 'Y' }, // HMM
  '373220': { corp_code: '01596686', corp_cls: 'Y' }, // LG에너지솔루션
  '207940': { corp_code: '00935816', corp_cls: 'Y' }, // 삼성바이오로직스
  '028260': { corp_code: '00164956', corp_cls: 'Y' }, // 삼성물산
  '034020': { corp_code: '00098673', corp_cls: 'Y' }, // 두산에너빌리티
  '267250': { corp_code: '01613937', corp_cls: 'Y' }, // HD현대
  '010130': { corp_code: '00167946', corp_cls: 'Y' }, // 고려아연
  '009150': { corp_code: '00126348', corp_cls: 'Y' }, // 삼성전기
  '034220': { corp_code: '00098452', corp_cls: 'Y' }, // LG디스플레이
  '017670': { corp_code: '00190572', corp_cls: 'Y' }, // SK텔레콤
  '030200': { corp_code: '00198373', corp_cls: 'Y' }, // KT
  '030750': { corp_code: '00105551', corp_cls: 'Y' }, // 정통부
  '042700': { corp_code: '00293076', corp_cls: 'K' }, // 한미반도체
  '005935': { corp_code: '00126380', corp_cls: 'Y' }, // 삼성전자(우)
}

// 회사명 → stock_code 역방향 맵
const KR_NAME_MAP: Record<string, string> = {
  '삼성전자': '005930', 'SK하이닉스': '000660', '현대차': '005380', '현대자동차': '005380',
  'POSCO홀딩스': '005490', 'NAVER': '035420', '네이버': '035420', '카카오': '035720',
  '셀트리온': '068270', 'LG화학': '051910', '삼성SDI': '006400', '기아': '000270',
  'KB금융': '105560', '신한지주': '055550', 'SK이노베이션': '096770', '한국전력': '015760',
  'LG전자': '066570', '한화에어로스페이스': '012450', '에코프로': '086520',
  '에코프로비엠': '247540', '하이브': '352820', 'HMM': '011200',
  'LG에너지솔루션': '373220', '삼성바이오로직스': '207940', '삼성물산': '028260',
  '두산에너빌리티': '034020', 'HD현대': '267250', '고려아연': '010130',
  '삼성전기': '009150', 'LG디스플레이': '034220', 'SK텔레콤': '017670', 'KT': '030200',
  '한미반도체': '042700',
}

function resolveQuery(query: string): { stock_code: string; corp_code: string; corp_cls: string } | null {
  const q = query.trim()
  // 6자리 숫자 → 종목코드
  if (/^\d{6}$/.test(q)) {
    const c = KR_CORP_MAP[q]
    return c ? { stock_code: q, ...c } : null
  }
  // 회사명 → 종목코드
  const sc = KR_NAME_MAP[q]
  if (sc) {
    const c = KR_CORP_MAP[sc]
    return c ? { stock_code: sc, ...c } : null
  }
  // 부분 일치
  for (const [name, sc] of Object.entries(KR_NAME_MAP)) {
    if (name.includes(q)) {
      const c = KR_CORP_MAP[sc]
      if (c) return { stock_code: sc, ...c }
    }
  }
  return null
}

async function fetchDartCompany(corp_code: string) {
  const url = `${DART_BASE}/company.json?crtfc_key=${DART_KEY}&corp_code=${corp_code}`
  const r = await fetch(url, { next: { revalidate: 3600 } })
  return r.ok ? r.json() : null
}

async function fetchDartFinancials(corp_code: string) {
  const year = new Date().getFullYear() - 1
  for (const y of [year, year - 1]) {
    const params = new URLSearchParams({
      crtfc_key: DART_KEY, corp_code, bsns_year: String(y),
      reprt_code: '11011', fs_div: 'CFS',
    })
    try {
      const r = await fetch(`${DART_BASE}/fnlttSinglAcnt.json?${params}`, { next: { revalidate: 86400 } })
      if (!r.ok) continue
      const data = await r.json()
      if (data.status === '000' && data.list?.length) {
        const items: Record<string, number> = {}
        for (const row of data.list) {
          const nm  = (row.account_nm || '').trim()
          const amt = parseInt((row.thstrm_amount || '').replace(/,/g, ''), 10)
          if (nm && !isNaN(amt)) items[nm] = amt
        }
        return { year: y, items }
      }
    } catch { /* continue */ }
  }
  return null
}

async function fetchYahooPrice(ticker: string) {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } })
    if (!r.ok) return null
    const data = await r.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null
    const meta   = result.meta || {}
    const ts     = result.timestamp || []
    const closes = result.indicators?.quote?.[0]?.close || []
    const labels = ts.map((t: number) => new Date(t * 1000).toISOString().slice(0, 10))
    return {
      current_price:    meta.regularMarketPrice ?? null,
      prev_close:       meta.chartPreviousClose ?? null,
      price_change:     meta.regularMarketPrice && meta.chartPreviousClose
                          ? meta.regularMarketPrice - meta.chartPreviousClose : null,
      price_change_pct: meta.regularMarketPrice && meta.chartPreviousClose
                          ? (meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose * 100 : null,
      market_cap:       meta.marketCap ?? null,
      '52w_high':       meta.fiftyTwoWeekHigh ?? null,
      '52w_low':        meta.fiftyTwoWeekLow  ?? null,
      volume:           meta.regularMarketVolume ?? null,
      currency:         meta.currency ?? 'KRW',
      price_1y:         { labels, closes: closes.map((v: number | null) => v !== null ? Math.round(v) : null) },
    }
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('query')?.trim() || ''
  if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 })
  if (!DART_KEY) return NextResponse.json({ error: 'DART_API_KEY 미설정' }, { status: 503 })

  const corp = resolveQuery(query)
  if (!corp) {
    return NextResponse.json({
      error: `종목을 찾을 수 없습니다: ${query}`,
      hint: '6자리 종목코드(005930) 또는 주요 회사명을 입력하세요',
    }, { status: 404 })
  }

  const { stock_code, corp_code, corp_cls } = corp
  const suffix  = corp_cls === 'K' ? '.KQ' : '.KS'
  const ticker  = stock_code + suffix

  const [dartCompany, dartFin, yPrice] = await Promise.allSettled([
    fetchDartCompany(corp_code),
    fetchDartFinancials(corp_code),
    fetchYahooPrice(ticker),
  ])

  const cd  = dartCompany.status === 'fulfilled' ? dartCompany.value : null
  const fin = dartFin.status    === 'fulfilled' ? dartFin.value    : null
  const pr  = yPrice.status     === 'fulfilled' ? yPrice.value     : null

  const finItems = fin?.items ?? {}
  const finRows  = ['매출액', '매출총이익', '영업이익', '당기순이익'].map(l => ({
    label: l, value: finItems[l] ?? null
  })).filter(r => r.value !== null)

  return NextResponse.json({
    stock_code,
    corp_code,
    corp_cls,
    ticker_sym:    ticker,
    market:        'KR',
    corp_name:     cd?.corp_name     ?? query,
    corp_name_eng: cd?.corp_name_eng ?? '',
    ceo:           cd?.ceo_nm        ?? '',
    website:       cd?.hm_url        ?? '',
    address:       cd?.adres         ?? '',
    est_date:      cd?.est_dt        ?? '',
    acc_month:     cd?.acc_mt        ?? '',
    ...(pr ?? {}),
    fin_year:     fin?.year?.toString() ?? null,
    fin_revenue:  finItems['매출액']   ?? null,
    fin_op_inc:   finItems['영업이익'] ?? null,
    fin_net_inc:  finItems['당기순이익'] ?? null,
    fin_rows:     finRows,
  })
}
