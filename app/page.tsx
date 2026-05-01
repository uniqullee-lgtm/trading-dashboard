'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { supabase, Trade, Position, BotStatus, RegimeLog, MarketSummary, WatchlistQuote, InvestorPortfolio } from '@/lib/supabase'
import {
  AreaChart, Area,
  ComposedChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine,
} from 'recharts'
import { format, parseISO, isToday } from 'date-fns'

// ── 색상 ──────────────────────────────────────────────────────────
const REGIME_COLOR: Record<string, string> = {
  BULL: '#22d37a', SIDEWAYS: '#f5a623', BEAR: '#f04f5b', PANIC: '#dc2626',
}
const STATUS_COLOR: Record<string, string> = {
  running: '#22d37a', stopped: '#6b6b9a', error: '#f04f5b',
}
const PIE_COLORS = ['#7c6af7','#22d37a','#f5a623','#5b8af7','#f04f5b','#14b8a6','#e879f9','#fb923c']

// ── 헬퍼 ──────────────────────────────────────────────────────────
const fmt     = (n: number, d = 2) => (n ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: d })
const fmtPct  = (n: number) => `${(n ?? 0) >= 0 ? '+' : ''}${(n ?? 0).toFixed(2)}%`
const fmtTime = (ts: string) => { try { return format(parseISO(ts), 'MM/dd HH:mm') } catch { return ts } }
const fmtDate = (ts: string) => { try { return format(parseISO(ts), 'MM/dd') } catch { return ts } }

const parsePnl = (reason: string): number | null => {
  try {
    const m = reason?.match(/P&L:\s*([\+\-]?\d+\.?\d*)/)
    return m ? parseFloat(m[1]) : null
  } catch { return null }
}

type Tab = 'overview' | 'trades' | 'analytics' | 'market' | 'investors'
type ViewBroker = 'all' | 'Alpaca' | 'KIS'

// ── 빈 상태 ────────────────────────────────────────────────────────
function EmptyChart({ h = 200, msg = '데이터 없음', sub = '데이터가 수집되면 표시됩니다' }: { h?: number; msg?: string; sub?: string }) {
  return (
    <div style={{ height: h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <div style={{ fontSize: 28, opacity: 0.15 }}>📊</div>
      <div style={{ color: '#3a3a6a', fontSize: 13 }}>{msg}</div>
      <div style={{ color: '#2a2a52', fontSize: 11 }}>{sub}</div>
    </div>
  )
}

// ── 커스텀 툴팁 ────────────────────────────────────────────────────
function CT({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, padding: '8px 14px', fontSize: 12 }}>
      <div style={{ color: '#6b6b9a', marginBottom: 5 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 700, marginBottom: 2 }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
        </div>
      ))}
    </div>
  )
}

// ── MetricCard ────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color = '#e8e8f8', glow = '', accent = false }: {
  label: string; value: ReactNode; sub?: ReactNode; color?: string; glow?: string; accent?: boolean
}) {
  return (
    <div className={accent ? 'card-glow' : 'card'} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 108 }}>
      <div className="metric-label">{label}</div>
      <div>
        <div style={{ fontSize: 'clamp(18px,2.2vw,30px)', fontWeight: 800, color, letterSpacing: -1, lineHeight: 1 }} className={glow}>
          {value}
        </div>
        {sub !== undefined && <div style={{ fontSize: 11, color: '#6b6b9a', marginTop: 5 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── BotBadge ──────────────────────────────────────────────────────
function BotBadge({ s }: { s: BotStatus }) {
  const color = STATUS_COLOR[s.status] ?? '#6b6b9a'
  const elapsed = Math.floor((Date.now() - new Date(s.updated_at).getTime()) / 60000)
  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 0', borderBottom: '1px solid rgba(30,30,66,0.6)' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, marginTop: 5, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{s.broker}</span>
          <span className="badge" style={{ background: color + '18', color }}>{s.status}</span>
          {s.regime && <span className="badge" style={{ background: (REGIME_COLOR[s.regime] ?? '#6b6b9a') + '18', color: REGIME_COLOR[s.regime] ?? '#6b6b9a' }}>{s.regime}</span>}
        </div>
        <div style={{ fontSize: 12, color: '#9898c8' }}>
          자산&nbsp;<strong style={{ color: '#e8e8f8' }}>${fmt(s.equity)}</strong>
          &nbsp;·&nbsp;P&L&nbsp;<strong style={{ color: s.daily_pnl >= 0 ? '#22d37a' : '#f04f5b' }}>{fmtPct(s.daily_pnl)}</strong>
        </div>
        <div style={{ fontSize: 11, color: '#3a3a6a', marginTop: 3 }}>{elapsed}분 전 · {s.detail}</div>
      </div>
    </div>
  )
}

// ── PositionRow ───────────────────────────────────────────────────
function PositionRow({ p }: { p: Position }) {
  const color = p.pl_pct >= 0 ? '#22d37a' : '#f04f5b'
  const unrealized = (p.current_price - p.avg_price) * p.qty
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(30,30,66,0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="badge" style={{ background: p.broker === 'KIS' ? '#5b8af718' : '#7c6af718', color: p.broker === 'KIS' ? '#5b8af7' : '#7c6af7' }}>{p.broker}</span>
        <div>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{p.symbol}</span>
          <span style={{ fontSize: 10, color: '#6b6b9a', marginLeft: 6 }}>{p.market}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color }}>{fmtPct(p.pl_pct)}</div>
        <div style={{ fontSize: 10, color: '#6b6b9a' }}>{p.currency === 'KRW' ? '₩' : '$'}{fmt(Math.abs(unrealized))} · {fmt(p.qty, 0)}주</div>
      </div>
    </div>
  )
}

// ── WinRateRing ───────────────────────────────────────────────────
function WinRateRing({ rate, wins, losses }: { rate: number; wins: number; losses: number }) {
  const r = 44, circ = 2 * Math.PI * r, filled = (rate / 100) * circ
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ position: 'relative', width: 106, height: 106 }}>
        <svg width="106" height="106" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="53" cy="53" r={r} fill="none" stroke="#1e1e42" strokeWidth="9" />
          <circle cx="53" cy="53" r={r} fill="none" stroke="#22d37a" strokeWidth="9"
            strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 6px #22d37a88)', transition: 'stroke-dasharray 1s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#22d37a', letterSpacing: -1 }} className="glow-green">{rate.toFixed(0)}%</span>
          <span style={{ fontSize: 9, color: '#6b6b9a' }}>WIN RATE</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
        <span style={{ color: '#22d37a', fontWeight: 700 }}>{wins}W</span>
        <span style={{ color: '#f04f5b', fontWeight: 700 }}>{losses}L</span>
      </div>
    </div>
  )
}

// ── RegimeTimeline ────────────────────────────────────────────────
function RegimeTimeline({ regimes }: { regimes: RegimeLog[] }) {
  if (!regimes.length) return <div style={{ height: 12, background: '#1e1e42', borderRadius: 4, opacity: 0.4, marginTop: 10 }} />
  return (
    <div style={{ display: 'flex', gap: 2, marginTop: 10, height: 12 }}>
      {regimes.slice(-50).map((r, i) => (
        <div key={i} title={`${fmtDate(r.ts)} ${r.regime} · VIX ${r.vix?.toFixed(1)}`}
          style={{ flex: 1, borderRadius: 3, opacity: 0.75, background: REGIME_COLOR[r.regime] ?? '#6b6b9a' }} />
      ))}
    </div>
  )
}

// ── AutoTradingToggle ─────────────────────────────────────────────
function AutoTradingToggle({ enabled, onToggle }: { enabled: boolean | null; onToggle: (v: boolean) => void }) {
  if (enabled === null) return <div style={{ width: 80, height: 28, background: '#1e1e42', borderRadius: 6, opacity: 0.5 }} />
  return (
    <button
      onClick={() => onToggle(!enabled)}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: enabled ? '#22d37a18' : '#f04f5b18',
        border: `1px solid ${enabled ? '#22d37a' : '#f04f5b'}`,
        borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
        color: enabled ? '#22d37a' : '#f04f5b', fontSize: 12, fontWeight: 700,
        transition: 'all 0.2s',
      }}
    >
      <div style={{
        width: 28, height: 16, background: enabled ? '#22d37a' : '#3a3a6a',
        borderRadius: 8, position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}>
        <div style={{
          width: 12, height: 12, background: '#e8e8f8', borderRadius: '50%',
          position: 'absolute', top: 2, left: enabled ? 14 : 2, transition: 'left 0.2s',
        }} />
      </div>
      자동매매 {enabled ? 'ON' : 'OFF'}
    </button>
  )
}

// ── BrokerToggle ──────────────────────────────────────────────────
function BrokerToggle({ value, onChange }: { value: ViewBroker; onChange: (v: ViewBroker) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['all', 'Alpaca', 'KIS'] as ViewBroker[]).map(v => (
        <button key={v} onClick={() => onChange(v)} style={{
          background: value === v ? '#7c6af718' : 'transparent',
          border: `1px solid ${value === v ? '#7c6af7' : '#1e1e42'}`,
          borderRadius: 8, padding: '5px 12px',
          color: value === v ? '#7c6af7' : '#6b6b9a',
          fontSize: 12, fontWeight: value === v ? 700 : 500, cursor: 'pointer',
        }}>{v === 'all' ? '전체' : v}</button>
      ))}
    </div>
  )
}

// ── 메인 대시보드 ──────────────────────────────────────────────────
export default function Dashboard() {
  const [trades, setTrades]               = useState<Trade[]>([])
  const [positions, setPositions]         = useState<Position[]>([])
  const [bots, setBots]                   = useState<BotStatus[]>([])
  const [regimes, setRegimes]             = useState<RegimeLog[]>([])
  const [marketSummary, setMarketSummary] = useState<MarketSummary[]>([])
  const [watchlist, setWatchlist]         = useState<WatchlistQuote[]>([])
  const [investors, setInvestors]         = useState<InvestorPortfolio[]>([])
  const [autoTrading, setAutoTrading]     = useState<boolean | null>(null)
  const [lastRefresh, setLastRefresh]     = useState(new Date())
  const [loading, setLoading]             = useState(true)
  const [tab, setTab]                     = useState<Tab>('overview')
  const [viewBroker, setViewBroker]       = useState<ViewBroker>('all')
  const [filterSide, setFilterSide]       = useState<'all' | 'buy' | 'sell'>('all')
  const [filterBroker, setFilterBroker]   = useState('all')
  const [investorFilter, setInvestorFilter] = useState('all')

  // ── 데이터 패칭 ────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [t, p, b, r, ms, wq, ip, st] = await Promise.all([
        supabase.from('trades').select('*').order('ts', { ascending: false }).limit(500),
        supabase.from('positions').select('*').order('pl_pct', { ascending: false }),
        supabase.from('bot_status').select('*'),
        supabase.from('regime_log').select('*').order('ts', { ascending: false }).limit(200),
        supabase.from('market_summary').select('*'),
        supabase.from('watchlist_quotes').select('*').order('symbol'),
        supabase.from('investor_portfolios').select('*').order('investor').order('weight_pct', { ascending: false }),
        supabase.from('settings').select('*').eq('key', 'auto_trading').limit(1),
      ])
      if (t.data)  setTrades(t.data)
      if (p.data)  setPositions(p.data)
      if (b.data)  setBots(b.data)
      if (r.data)  setRegimes(r.data.reverse())
      if (ms.data) setMarketSummary(ms.data)
      if (wq.data) setWatchlist(wq.data)
      if (ip.data) setInvestors(ip.data)
      if (st.data && st.data.length > 0) {
        setAutoTrading(st.data[0].value?.toLowerCase() === 'true')
      } else {
        setAutoTrading(false)
      }
    } finally {
      setLoading(false)
      setLastRefresh(new Date())
    }
  }, [])

  const handleAutoTradingToggle = useCallback(async (val: boolean) => {
    setAutoTrading(val)
    await supabase.from('settings').upsert({ key: 'auto_trading', value: String(val), updated_at: new Date().toISOString() })
  }, [])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 30_000)
    const ch1 = supabase.channel('t-rt').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, () => fetchAll()).subscribe()
    const ch2 = supabase.channel('p-rt').on('postgres_changes', { event: '*',      schema: 'public', table: 'positions' }, () => fetchAll()).subscribe()
    const ch3 = supabase.channel('b-rt').on('postgres_changes', { event: '*',      schema: 'public', table: 'bot_status' }, () => fetchAll()).subscribe()
    const ch4 = supabase.channel('ms-rt').on('postgres_changes', { event: '*',     schema: 'public', table: 'market_summary' }, () => fetchAll()).subscribe()
    const ch5 = supabase.channel('st-rt').on('postgres_changes', { event: '*',     schema: 'public', table: 'settings' }, () => fetchAll()).subscribe()
    return () => {
      clearInterval(iv)
      supabase.removeChannel(ch1); supabase.removeChannel(ch2); supabase.removeChannel(ch3)
      supabase.removeChannel(ch4); supabase.removeChannel(ch5)
    }
  }, [fetchAll])

  // ── 브로커 필터 적용 ───────────────────────────────────────────
  const filteredPositions = useMemo(() => positions.filter(p => {
    if (viewBroker === 'all') return true
    if (viewBroker === 'Alpaca') return p.broker === 'Alpaca'
    if (viewBroker === 'KIS') return p.broker === 'KIS'
    return true
  }), [positions, viewBroker])

  const filteredBots = useMemo(() => bots.filter(b => {
    if (viewBroker === 'all') return true
    if (viewBroker === 'Alpaca') return b.broker.toLowerCase().includes('alpaca')
    if (viewBroker === 'KIS') return b.broker.toLowerCase().includes('kis')
    return true
  }), [bots, viewBroker])

  // ── 집계 ───────────────────────────────────────────────────────
  const todayTrades   = useMemo(() => trades.filter(t => isToday(parseISO(t.ts))), [trades])
  const totalEquity   = useMemo(() => filteredBots.reduce((s, b) => s + b.equity, 0), [filteredBots])
  const totalPnl      = useMemo(() => {
    if (!filteredBots.length) return 0
    const eq = totalEquity
    return eq > 0
      ? filteredBots.reduce((s, b) => s + b.daily_pnl * b.equity, 0) / eq
      : filteredBots.reduce((s, b) => s + b.daily_pnl, 0) / filteredBots.length
  }, [filteredBots, totalEquity])

  const currentRegime = useMemo(() => regimes.length ? regimes[regimes.length - 1].regime : '-', [regimes])
  const latestVix     = useMemo(() => regimes.length ? regimes[regimes.length - 1].vix : null, [regimes])

  const filteredTrades = useMemo(() => {
    const brokerFiltered = viewBroker === 'all' ? trades : trades.filter(t => {
      if (viewBroker === 'Alpaca') return t.broker === 'Alpaca'
      if (viewBroker === 'KIS') return t.broker === 'KIS'
      return true
    })
    return brokerFiltered.filter(t => {
      if (filterSide !== 'all' && t.side !== filterSide) return false
      if (filterBroker !== 'all' && t.broker !== filterBroker) return false
      return true
    })
  }, [trades, viewBroker, filterSide, filterBroker])

  const sellTrades = useMemo(() => filteredTrades.filter(t => t.side === 'sell' && t.reason?.includes('P&L:')), [filteredTrades])

  const { wins, losses, winRate } = useMemo(() => {
    const w = sellTrades.filter(t => (parsePnl(t.reason) ?? -1) > 0).length
    return { wins: w, losses: sellTrades.length - w, winRate: sellTrades.length ? w / sellTrades.length * 100 : 0 }
  }, [sellTrades])

  const profitFactor = useMemo(() => {
    const gains = sellTrades.reduce((s, t) => { const p = parsePnl(t.reason); return p && p > 0 ? s + p : s }, 0)
    const loss  = Math.abs(sellTrades.reduce((s, t) => { const p = parsePnl(t.reason); return p && p < 0 ? s + p : s }, 0))
    return loss === 0 ? (gains > 0 ? 99 : 1) : parseFloat((gains / loss).toFixed(2))
  }, [sellTrades])

  const { avgWin, avgLoss } = useMemo(() => {
    const wt = sellTrades.filter(t => (parsePnl(t.reason) ?? -1) > 0)
    const lt = sellTrades.filter(t => (parsePnl(t.reason) ?? 1) < 0)
    return {
      avgWin:  wt.length ? wt.reduce((s, t) => s + (parsePnl(t.reason) ?? 0), 0) / wt.length : 0,
      avgLoss: lt.length ? lt.reduce((s, t) => s + (parsePnl(t.reason) ?? 0), 0) / lt.length : 0,
    }
  }, [sellTrades])

  const cumulativePnl = useMemo(() => {
    const sorted = [...sellTrades].sort((a, b) => parseISO(a.ts).getTime() - parseISO(b.ts).getTime())
    let cum = 0
    return sorted.map((t, i) => {
      const pnl = parsePnl(t.reason) ?? 0
      cum += pnl
      return { n: i + 1, t: fmtTime(t.ts), pnl, cum, symbol: t.symbol, side: t.side }
    })
  }, [sellTrades])

  const pnlDistribution = useMemo(() => {
    const allPnl = sellTrades.map(t => parsePnl(t.reason)).filter((p): p is number => p !== null)
    if (!allPnl.length) return []
    const step = 1, lo = Math.floor(Math.min(...allPnl, -5)), hi = Math.ceil(Math.max(...allPnl, 5))
    const buckets: Record<number, number> = {}
    for (let b = lo; b <= hi; b += step) buckets[b] = 0
    allPnl.forEach(p => {
      const k = Math.floor(p / step) * step
      buckets[Math.max(lo, Math.min(hi, k))] = (buckets[Math.max(lo, Math.min(hi, k))] ?? 0) + 1
    })
    return Object.entries(buckets).map(([range, count]) => ({ range: `${range}%`, count, pos: Number(range) >= 0 }))
  }, [sellTrades])

  const hourlyActivity = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: `${i}시`, count: 0, pnl: 0 }))
    filteredTrades.forEach(t => { try { hours[parseISO(t.ts).getHours()].count++ } catch {} })
    sellTrades.forEach(t => { try { hours[parseISO(t.ts).getHours()].pnl += parsePnl(t.reason) ?? 0 } catch {} })
    return hours
  }, [filteredTrades, sellTrades])

  const runningWinRate = useMemo(() => {
    const sorted = [...sellTrades].sort((a, b) => parseISO(a.ts).getTime() - parseISO(b.ts).getTime())
    let w = 0
    return sorted.map((t, i) => {
      if ((parsePnl(t.reason) ?? -1) > 0) w++
      return { n: i + 1, wr: parseFloat((w / (i + 1) * 100).toFixed(1)), t: fmtDate(t.ts) }
    })
  }, [sellTrades])

  const dailyVolume = useMemo(() => {
    const m: Record<string, { date: string; buys: number; sells: number }> = {}
    filteredTrades.forEach(t => {
      const day = fmtDate(t.ts)
      if (!m[day]) m[day] = { date: day, buys: 0, sells: 0 }
      if (t.side === 'buy') m[day].buys++; else m[day].sells++
    })
    return Object.values(m).slice(-14)
  }, [filteredTrades])

  const regimeChart = useMemo(() => regimes.slice(-40).map(r => ({
    t: fmtDate(r.ts), VIX: r.vix, SPY: r.sp500,
  })), [regimes])

  const posPie = useMemo(() => filteredPositions.map((p, i) => ({
    name: p.symbol, value: p.qty * p.avg_price, color: PIE_COLORS[i % PIE_COLORS.length],
  })), [filteredPositions])

  const dailyPnl = useMemo(() => {
    const m: Record<string, { date: string; pnl: number; count: number }> = {}
    sellTrades.forEach(t => {
      const pnl = parsePnl(t.reason); if (pnl === null) return
      const day = fmtDate(t.ts)
      if (!m[day]) m[day] = { date: day, pnl: 0, count: 0 }
      m[day].pnl += pnl; m[day].count++
    })
    return Object.values(m).slice(-14)
  }, [sellTrades])

  const symbolPnl = useMemo(() => {
    const m: Record<string, { symbol: string; pnl: number; count: number }> = {}
    sellTrades.forEach(t => {
      const pnl = parsePnl(t.reason); if (pnl === null) return
      if (!m[t.symbol]) m[t.symbol] = { symbol: t.symbol, pnl: 0, count: 0 }
      m[t.symbol].pnl += pnl; m[t.symbol].count++
    })
    return Object.values(m).sort((a, b) => b.pnl - a.pnl).slice(0, 12)
  }, [sellTrades])

  const brokerStats = useMemo(() => {
    const m: Record<string, { broker: string; wins: number; losses: number; pnl: number }> = {}
    sellTrades.forEach(t => {
      const pnl = parsePnl(t.reason); if (pnl === null) return
      if (!m[t.broker]) m[t.broker] = { broker: t.broker, wins: 0, losses: 0, pnl: 0 }
      m[t.broker].pnl += pnl
      if (pnl > 0) m[t.broker].wins++; else m[t.broker].losses++
    })
    return Object.values(m)
  }, [sellTrades])

  // 브로커별 overview 비교 카드
  const alpacaBot = useMemo(() => bots.find(b => b.broker.toLowerCase().includes('alpaca')), [bots])
  const kisBot    = useMemo(() => bots.find(b => b.broker.toLowerCase().includes('kis')), [bots])
  const alpacaMS  = useMemo(() => marketSummary.find(m => m.broker === 'Alpaca'), [marketSummary])
  const kisMS     = useMemo(() => marketSummary.filter(m => m.broker.startsWith('KIS')), [marketSummary])

  // trade filter brokers
  const tradesBrokers = useMemo(() => ['all', ...Array.from(new Set(trades.map(t => t.broker)))], [trades])

  // investors filter
  const investorNames = useMemo(() => ['all', ...Array.from(new Set(investors.map(i => i.investor)))], [investors])
  const filteredInvestors = useMemo(() => {
    if (investorFilter === 'all') return investors
    return investors.filter(i => i.investor === investorFilter)
  }, [investors, investorFilter])

  const finalCumPnl = cumulativePnl.length ? cumulativePnl[cumulativePnl.length - 1].cum : 0
  const cumColor    = finalCumPnl >= 0 ? '#22d37a' : '#f04f5b'

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 14 }}>
      <div className="live-dot" />
      <span style={{ color: '#6b6b9a', fontSize: 14 }}>데이터 로딩 중…</span>
    </div>
  )

  const pnlColor = totalPnl >= 0 ? '#22d37a' : '#f04f5b'
  const pnlGlow  = totalPnl >= 0 ? 'glow-green' : 'glow-red'

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 20px 48px' }}>

      {/* ── 헤더 ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div className="live-dot" />
            <span style={{ fontSize: 10, color: '#6b6b9a', letterSpacing: 3, textTransform: 'uppercase' }}>Live</span>
            <span style={{ fontSize: 10, color: '#2a2a52', letterSpacing: 1 }}>· 30초 자동갱신</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: -1, color: '#e8e8f8', margin: 0 }}>
            AI Trading<span style={{ color: '#7c6af7' }}> · </span>Dashboard
          </h1>
          <p style={{ fontSize: 11, color: '#6b6b9a', margin: '3px 0 0' }}>KIS (한국·미국·홍콩) + Alpaca · Supabase 실시간</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <BrokerToggle value={viewBroker} onChange={setViewBroker} />
          <AutoTradingToggle enabled={autoTrading} onToggle={handleAutoTradingToggle} />
          {latestVix !== null && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: REGIME_COLOR[currentRegime] ?? '#6b6b9a' }}>{currentRegime} · VIX {latestVix.toFixed(1)}</div>
              <div style={{ fontSize: 10, color: '#3a3a5a' }}>{format(lastRefresh, 'HH:mm:ss')}</div>
            </div>
          )}
          <button onClick={fetchAll} style={{ background: '#14142e', border: '1px solid #1e1e42', borderRadius: 10, padding: '8px 16px', color: '#7c6af7', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            ↻ 갱신
          </button>
        </div>
      </div>

      {/* ── 탭 ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 18, borderBottom: '1px solid #1e1e42' }}>
        {([
          { key: 'overview',  label: '📊 개요' },
          { key: 'trades',    label: '📋 거래내역' },
          { key: 'analytics', label: '📈 분석' },
          { key: 'market',    label: '🌐 시장' },
          { key: 'investors', label: '👔 투자자' },
        ] as { key: Tab; label: string }[]).map(item => (
          <button key={item.key} onClick={() => setTab(item.key)} style={{
            background: 'none', border: 'none',
            borderBottom: tab === item.key ? '2px solid #7c6af7' : '2px solid transparent',
            padding: '8px 18px', marginBottom: -1,
            color: tab === item.key ? '#e8e8f8' : '#6b6b9a',
            fontSize: 13, fontWeight: tab === item.key ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s',
          }}>{item.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#3a3a5a', alignSelf: 'center', paddingRight: 4 }}>
          {filteredTrades.length}건 · {filteredPositions.length}포지션
          {viewBroker !== 'all' && <span style={{ color: '#7c6af7' }}> · {viewBroker}</span>}
        </span>
      </div>

      {/* ══════════ 개요 탭 ════════════════════════════════════════ */}
      {tab === 'overview' && (
        <>
          {/* 6 메트릭 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="card-glow" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div className="metric-label">총 평가 자산 {viewBroker !== 'all' && `(${viewBroker})`}</div>
              <div>
                <div className="big-number glow-purple" style={{ color: '#e8e8f8' }}>${fmt(totalEquity)}</div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge" style={{ background: pnlColor + '18', color: pnlColor, fontSize: 12, padding: '3px 10px' }}>
                    {totalPnl >= 0 ? '▲' : '▼'} {fmtPct(totalPnl)}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b6b9a' }}>오늘 기준</span>
                </div>
              </div>
            </div>
            <MetricCard label="오늘 P&L" color={pnlColor} glow={pnlGlow} value={fmtPct(totalPnl)} sub={`${todayTrades.length}건 체결`} />
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
              <WinRateRing rate={winRate} wins={wins} losses={losses} />
            </div>
            <MetricCard label="Profit Factor"
              color={profitFactor >= 1.5 ? '#22d37a' : profitFactor >= 1 ? '#f5a623' : '#f04f5b'}
              value={profitFactor === 99 ? '∞' : profitFactor.toFixed(2)}
              sub={<span>수익 <span style={{ color: '#22d37a' }}>{avgWin.toFixed(1)}%</span> · 손실 <span style={{ color: '#f04f5b' }}>{avgLoss.toFixed(1)}%</span></span>} />
            <MetricCard label="마켓 레짐" color={REGIME_COLOR[currentRegime] ?? '#6b6b9a'}
              value={currentRegime} sub={latestVix !== null ? `VIX ${latestVix.toFixed(1)}` : '—'} />
            <MetricCard label="오픈 포지션" color="#5b8af7" glow="glow-blue" value={filteredPositions.length.toString()} sub="종목 보유중" />
          </div>

          {/* ── 브로커별 비교 카드 ───────────────────────────────── */}
          {viewBroker === 'all' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
              {/* Alpaca */}
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span className="badge" style={{ background: '#7c6af718', color: '#7c6af7', fontSize: 12 }}>Alpaca</span>
                  <span style={{ fontSize: 11, color: '#6b6b9a' }}>US 주식</span>
                </div>
                {alpacaBot ? (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#e8e8f8', letterSpacing: -1 }}>${fmt(alpacaBot.equity)}</div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
                      <span>P&L <strong style={{ color: alpacaBot.daily_pnl >= 0 ? '#22d37a' : '#f04f5b' }}>{fmtPct(alpacaBot.daily_pnl)}</strong></span>
                      <span style={{ color: '#6b6b9a' }}>포지션 {positions.filter(p => p.broker === 'Alpaca').length}개</span>
                    </div>
                    {alpacaMS && <div style={{ fontSize: 11, color: '#6b6b9a', marginTop: 6 }}>현금 ${fmt(alpacaMS.cash)}</div>}
                  </>
                ) : <EmptyChart h={80} msg="Alpaca 봇 없음" sub="" />}
              </div>

              {/* KIS 합산 */}
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span className="badge" style={{ background: '#5b8af718', color: '#5b8af7', fontSize: 12 }}>KIS</span>
                  <span style={{ fontSize: 11, color: '#6b6b9a' }}>한국·미국·홍콩</span>
                </div>
                {kisBot ? (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#e8e8f8', letterSpacing: -1 }}>${fmt(kisBot.equity)}</div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
                      <span>P&L <strong style={{ color: kisBot.daily_pnl >= 0 ? '#22d37a' : '#f04f5b' }}>{fmtPct(kisBot.daily_pnl)}</strong></span>
                      <span style={{ color: '#6b6b9a' }}>포지션 {positions.filter(p => p.broker === 'KIS').length}개</span>
                    </div>
                    {kisMS.length > 0 && (
                      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                        {kisMS.map(m => (
                          <span key={m.broker} style={{ fontSize: 10, color: '#6b6b9a' }}>
                            {m.broker} <strong style={{ color: '#9898c8' }}>
                              {m.currency === 'KRW' ? '₩' : m.currency === 'HKD' ? 'HK$' : '$'}{fmt(m.equity)}
                            </strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : <EmptyChart h={80} msg="KIS 봇 없음" sub="" />}
              </div>

              {/* FX */}
              <div className="card">
                <div className="metric-label" style={{ marginBottom: 10 }}>환율 & 포지션 현황</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {kisMS.map(m => (
                    <div key={m.broker} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#6b6b9a' }}>{m.broker}</span>
                      <span>FX <strong style={{ color: '#f5a623' }}>{m.fx_rate?.toFixed(1)}</strong> · {m.positions_count}포지션</span>
                    </div>
                  ))}
                  {kisMS.length === 0 && <EmptyChart h={60} msg="시장 요약 없음" sub="sync 모듈 실행 후 표시" />}
                </div>
              </div>
            </div>
          )}

          {/* 누적 P&L 에쿼티 커브 */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div className="metric-label">누적 P&L 커브 {viewBroker !== 'all' && `(${viewBroker})`}</div>
                {cumulativePnl.length > 0 && (
                  <span style={{ fontSize: 20, fontWeight: 800, color: cumColor, letterSpacing: -0.5 }}
                    className={finalCumPnl >= 0 ? 'glow-green' : 'glow-red'}>
                    {fmtPct(finalCumPnl)}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#6b6b9a' }}>
                <span>{sellTrades.length}건 청산</span>
                <span style={{ color: '#22d37a' }}>{wins}승</span>
                <span style={{ color: '#f04f5b' }}>{losses}패</span>
              </div>
            </div>
            {cumulativePnl.length > 1 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={cumulativePnl} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={cumColor} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={cumColor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                  <XAxis dataKey="n" tick={{ fill: '#6b6b9a', fontSize: 9 }} label={{ value: '거래 #', fill: '#3a3a6a', fontSize: 9, position: 'insideBottomRight', offset: -4 }} />
                  <YAxis tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                  <ReferenceLine y={0} stroke="#3a3a6a" strokeDasharray="5 5" />
                  <Tooltip
                    contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number, name: string) => [name === 'cum' ? `${v.toFixed(2)}%` : `${v.toFixed(2)}%`, name === 'cum' ? '누적 P&L' : '단건 P&L']}
                    labelFormatter={(n) => {
                      const d = cumulativePnl[Number(n) - 1]
                      return d ? `#${n} ${d.symbol} · ${d.t}` : `#${n}`
                    }}
                  />
                  <Area type="monotone" dataKey="cum" stroke={cumColor} strokeWidth={2.5} fill="url(#cumGrad)" dot={false} name="cum" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart h={200} msg="누적 P&L 데이터 없음" sub="매도 거래가 발생하면 에쿼티 커브가 표시됩니다" />
            )}
          </div>

          {/* VIX+SPY + 봇상태 */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="metric-label">VIX · SPY 추이</div>
                <div style={{ display: 'flex', gap: 14, fontSize: 10 }}>
                  <span style={{ color: '#f5a623' }}>● VIX</span>
                  <span style={{ color: '#7c6af7' }}>● SPY</span>
                </div>
              </div>
              {regimeChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={140}>
                  <ComposedChart data={regimeChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                    <XAxis dataKey="t" tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                    <YAxis yAxisId="l" tick={{ fill: '#6b6b9a', fontSize: 9 }} domain={['auto', 'auto']} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fill: '#6b6b9a', fontSize: 9 }} domain={['auto', 'auto']} />
                    <Tooltip content={<CT />} />
                    <Line yAxisId="l" type="monotone" dataKey="VIX" stroke="#f5a623" strokeWidth={2} dot={false} name="VIX" />
                    <Line yAxisId="r" type="monotone" dataKey="SPY" stroke="#7c6af7" strokeWidth={2} dot={false} name="SPY" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart h={140} msg="레짐 데이터 없음" />
              )}
              <div className="metric-label" style={{ marginTop: 12, marginBottom: 2 }}>레짐 히스토리</div>
              <RegimeTimeline regimes={regimes} />
            </div>
            <div className="card">
              <div className="metric-label" style={{ marginBottom: 10 }}>봇 상태 {viewBroker !== 'all' && `(${viewBroker})`}</div>
              {filteredBots.length === 0
                ? <EmptyChart h={120} msg="봇 상태 없음" sub="봇을 실행하세요" />
                : filteredBots.map(b => <BotBadge key={b.broker} s={b} />)
              }
              {filteredBots.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1e1e42', fontSize: 11, color: '#6b6b9a' }}>
                  봇 {filteredBots.length}개 · running {filteredBots.filter(b => b.status === 'running').length}개
                </div>
              )}
            </div>
          </div>

          {/* 포지션 파이 + 리스트 + 최근거래 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
            <div className="card">
              <div className="metric-label" style={{ marginBottom: 8 }}>포지션 구성</div>
              {posPie.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={posPie} cx="50%" cy="50%" innerRadius={36} outerRadius={54} dataKey="value" nameKey="name" paddingAngle={4}>
                        {posPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `$${fmt(v)}`} contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {posPie.map((p, i) => (
                      <span key={p.name} style={{ fontSize: 10, color: PIE_COLORS[i % PIE_COLORS.length], display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], display: 'inline-block' }} />{p.name}
                      </span>
                    ))}
                  </div>
                </>
              ) : <EmptyChart h={140} msg="포지션 없음" sub="보유 종목이 없습니다" />}
            </div>
            <div className="card">
              <div className="metric-label" style={{ marginBottom: 8 }}>보유 포지션 ({filteredPositions.length})</div>
              {filteredPositions.length === 0
                ? <EmptyChart h={140} msg="포지션 없음" sub="" />
                : filteredPositions.slice(0, 8).map(p => <PositionRow key={`${p.broker}-${p.symbol}`} p={p} />)
              }
            </div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div className="metric-label">최근 거래</div>
                <button onClick={() => setTab('trades')} style={{ fontSize: 11, color: '#7c6af7', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>전체 보기 →</button>
              </div>
              {filteredTrades.length === 0 ? <EmptyChart h={160} msg="거래 내역 없음" /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead><tr><th>시각</th><th>구분</th><th>종목</th><th>브로커</th><th style={{ textAlign: 'right' }}>금액</th><th style={{ textAlign: 'right' }}>P&L</th></tr></thead>
                    <tbody>
                      {filteredTrades.slice(0, 12).map(t => {
                        const isBuy = t.side === 'buy'; const pnl = parsePnl(t.reason)
                        return (
                          <tr key={t.id}>
                            <td style={{ color: '#6b6b9a', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtTime(t.ts)}</td>
                            <td><span className="badge" style={{ background: isBuy ? '#22d37a18' : '#f04f5b18', color: isBuy ? '#22d37a' : '#f04f5b' }}>{isBuy ? '매수' : '매도'}</span></td>
                            <td><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{t.symbol}</span></td>
                            <td><span style={{ fontSize: 11, color: '#6b6b9a' }}>{t.broker}</span></td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{t.currency === 'KRW' ? '₩' : '$'}{fmt(t.value)}</td>
                            <td style={{ textAlign: 'right' }}>
                              {pnl !== null ? <span style={{ fontSize: 12, fontWeight: 700, color: pnl >= 0 ? '#22d37a' : '#f04f5b' }}>{fmtPct(pnl)}</span>
                                : <span style={{ color: '#3a3a6a', fontSize: 11 }}>—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ══════════ 거래내역 탭 ════════════════════════════════════ */}
      {tab === 'trades' && (
        <div className="card">
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#6b6b9a', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginRight: 4 }}>필터</span>
            {(['all', 'buy', 'sell'] as const).map(s => (
              <button key={s} onClick={() => setFilterSide(s)} style={{
                background: filterSide === s ? '#7c6af718' : 'transparent',
                border: `1px solid ${filterSide === s ? '#7c6af7' : '#1e1e42'}`,
                borderRadius: 8, padding: '5px 12px',
                color: filterSide === s ? '#7c6af7' : '#6b6b9a', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>{s === 'all' ? '전체' : s === 'buy' ? '매수' : '매도'}</button>
            ))}
            <div style={{ width: 1, height: 18, background: '#1e1e42', margin: '0 4px' }} />
            {tradesBrokers.map(b => (
              <button key={b} onClick={() => setFilterBroker(b)} style={{
                background: filterBroker === b ? '#5b8af718' : 'transparent',
                border: `1px solid ${filterBroker === b ? '#5b8af7' : '#1e1e42'}`,
                borderRadius: 8, padding: '5px 12px',
                color: filterBroker === b ? '#5b8af7' : '#6b6b9a', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>{b === 'all' ? '전체 브로커' : b}</button>
            ))}
            <div style={{ flex: 1, textAlign: 'right', fontSize: 11, color: '#6b6b9a' }}>{filteredTrades.length}건</div>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: '68vh', overflowY: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>시각</th><th>구분</th><th>종목</th><th>브로커</th><th>마켓</th><th>수량</th><th style={{ textAlign: 'right' }}>단가</th><th style={{ textAlign: 'right' }}>금액</th><th style={{ textAlign: 'right' }}>P&L</th><th>사유</th></tr></thead>
              <tbody>
                {filteredTrades.map(t => {
                  const isBuy = t.side === 'buy'; const pnl = parsePnl(t.reason)
                  return (
                    <tr key={t.id}>
                      <td style={{ color: '#6b6b9a', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtTime(t.ts)}</td>
                      <td><span className="badge" style={{ background: isBuy ? '#22d37a18' : '#f04f5b18', color: isBuy ? '#22d37a' : '#f04f5b' }}>{isBuy ? '매수' : '매도'}</span></td>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{t.symbol}</span></td>
                      <td><span style={{ fontSize: 11, color: '#9898c8' }}>{t.broker}</span></td>
                      <td><span style={{ fontSize: 11, color: '#3a3a6a' }}>{t.market}</span></td>
                      <td style={{ fontSize: 12 }}>{fmt(t.qty, 0)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>{t.currency === 'KRW' ? '₩' : '$'}{fmt(t.price)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{t.currency === 'KRW' ? '₩' : '$'}{fmt(t.value)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {pnl !== null ? <span style={{ fontSize: 12, fontWeight: 700, color: pnl >= 0 ? '#22d37a' : '#f04f5b' }}>{fmtPct(pnl)}</span>
                          : <span style={{ color: '#3a3a6a', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ fontSize: 10, color: '#3a3a6a', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.reason}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredTrades.length === 0 && <EmptyChart h={120} msg="거래 내역 없음" />}
          </div>
        </div>
      )}

      {/* ══════════ 분석 탭 ════════════════════════════════════════ */}
      {tab === 'analytics' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 14 }}>
            <MetricCard label="총 매도 거래" color="#7c6af7" glow="glow-purple" value={sellTrades.length.toString()} sub="익절 + 손절 합계" />
            <MetricCard label="승률" color="#22d37a" glow="glow-green" value={`${winRate.toFixed(1)}%`} sub={`${wins}승 ${losses}패`} />
            <MetricCard label="Profit Factor" color={profitFactor >= 1.5 ? '#22d37a' : profitFactor >= 1 ? '#f5a623' : '#f04f5b'}
              value={profitFactor === 99 ? '∞' : profitFactor.toFixed(2)} sub="총수익합 / 총손실합" />
            <MetricCard label="평균 수익률" color={avgWin > 0 ? '#22d37a' : '#6b6b9a'} value={`${avgWin.toFixed(2)}%`}
              sub={<span>손실 평균 <span style={{ color: '#f04f5b' }}>{avgLoss.toFixed(2)}%</span></span>} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="metric-label">누적 P&L 커브</div>
                {cumulativePnl.length > 0 && <span style={{ fontWeight: 800, fontSize: 16, color: cumColor }}>{fmtPct(finalCumPnl)}</span>}
              </div>
              {cumulativePnl.length > 1 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={cumulativePnl}>
                    <defs>
                      <linearGradient id="cumGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={cumColor} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={cumColor} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                    <XAxis dataKey="n" tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                    <YAxis tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                    <ReferenceLine y={0} stroke="#3a3a6a" strokeDasharray="5 5" />
                    <Tooltip contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 11 }}
                      formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name === 'cum' ? '누적 P&L' : '단건 P&L']}
                      labelFormatter={(n) => { const d = cumulativePnl[Number(n)-1]; return d ? `#${n} ${d.symbol}` : `#${n}` }} />
                    <Area type="monotone" dataKey="cum" stroke={cumColor} strokeWidth={2.5} fill="url(#cumGrad2)" dot={false} name="cum" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <EmptyChart h={200} />}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="metric-label">승률 추이 (누적)</div>
                {runningWinRate.length > 0 && <span style={{ fontWeight: 800, fontSize: 16, color: '#22d37a' }}>{runningWinRate[runningWinRate.length-1]?.wr.toFixed(1)}%</span>}
              </div>
              {runningWinRate.length > 1 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={runningWinRate}>
                    <defs>
                      <linearGradient id="wrGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#7c6af7" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#7c6af7" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                    <XAxis dataKey="n" tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#6b6b9a', fontSize: 9 }} unit="%" />
                    <ReferenceLine y={50} stroke="#3a3a6a" strokeDasharray="5 5" label={{ value: '50%', fill: '#3a3a6a', fontSize: 9 }} />
                    <Tooltip contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 11 }}
                      formatter={(v: number) => [`${v.toFixed(1)}%`, '누적 승률']}
                      labelFormatter={(n) => `${n}번째 거래`} />
                    <Area type="monotone" dataKey="wr" stroke="#7c6af7" strokeWidth={2} fill="url(#wrGrad)" dot={false} name="wr" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <EmptyChart h={200} msg="승률 추이 없음" />}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="metric-label">P&L 분포 히스토그램</div>
                <span style={{ fontSize: 10, color: '#6b6b9a' }}>{sellTrades.length}건 기준</span>
              </div>
              {pnlDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={pnlDistribution} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                    <XAxis dataKey="range" tick={{ fill: '#6b6b9a', fontSize: 8 }} interval={1} />
                    <YAxis tick={{ fill: '#6b6b9a', fontSize: 9 }} allowDecimals={false} />
                    <ReferenceLine x="0%" stroke="#4a4a7a" />
                    <Tooltip contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 11 }}
                      formatter={(v: number) => [`${v}건`, '거래 수']} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {pnlDistribution.map((d, i) => <Cell key={i} fill={d.pos ? '#22d37a' : '#f04f5b'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart h={200} msg="P&L 분포 없음" sub="청산 거래가 쌓이면 분포가 표시됩니다" />}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="metric-label">시간대별 거래 활동</div>
                <span style={{ fontSize: 10, color: '#6b6b9a' }}>24시간 기준</span>
              </div>
              {filteredTrades.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={hourlyActivity} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                    <XAxis dataKey="hour" tick={{ fill: '#6b6b9a', fontSize: 8 }} interval={2} />
                    <YAxis tick={{ fill: '#6b6b9a', fontSize: 9 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 11 }}
                      formatter={(v: number, name: string) => [name === 'count' ? `${v}건` : `${v.toFixed(1)}%`, name === 'count' ? '거래 수' : 'P&L 합계']} />
                    <Bar dataKey="count" fill="#7c6af7" radius={[3, 3, 0, 0]} opacity={0.85} name="count" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart h={200} msg="활동 데이터 없음" />}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="card">
              <div className="metric-label" style={{ marginBottom: 10 }}>일별 누적 P&L (%)</div>
              {dailyPnl.length > 0 ? (
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={dailyPnl}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                    <XAxis dataKey="date" tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                    <YAxis tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                    <ReferenceLine y={0} stroke="#3a3a6a" />
                    <Tooltip contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 11 }}
                      formatter={(v: number) => [`${v.toFixed(2)}%`, 'P&L']} />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {dailyPnl.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#22d37a' : '#f04f5b'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart h={190} />}
            </div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="metric-label">일별 매수/매도 건수</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
                  <span style={{ color: '#22d37a' }}>● 매수</span>
                  <span style={{ color: '#f04f5b' }}>● 매도</span>
                </div>
              </div>
              {dailyVolume.length > 0 ? (
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={dailyVolume}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                    <XAxis dataKey="date" tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                    <YAxis tick={{ fill: '#6b6b9a', fontSize: 9 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 11 }} />
                    <Bar dataKey="buys"  name="매수" fill="#22d37a" radius={[3, 3, 0, 0]} opacity={0.85} stackId="a" />
                    <Bar dataKey="sells" name="매도" fill="#f04f5b" radius={[3, 3, 0, 0]} opacity={0.85} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart h={190} msg="거래 볼륨 없음" />}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div className="card">
              <div className="metric-label" style={{ marginBottom: 10 }}>심볼별 누적 P&L (%)</div>
              {symbolPnl.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(160, symbolPnl.length * 30)}>
                  <BarChart data={symbolPnl} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                    <XAxis type="number" tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                    <YAxis dataKey="symbol" type="category" width={68} tick={{ fill: '#9898c8', fontSize: 10, fontFamily: 'monospace' }} />
                    <ReferenceLine x={0} stroke="#3a3a6a" />
                    <Tooltip contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 11 }}
                      formatter={(v: number, _, p) => [`${v.toFixed(2)}% (${p.payload.count}건)`, 'P&L']} />
                    <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                      {symbolPnl.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#22d37a' : '#f04f5b'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart h={200} msg="심볼별 데이터 없음" />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card" style={{ flex: 1 }}>
                <div className="metric-label" style={{ marginBottom: 12 }}>브로커별 성과</div>
                {brokerStats.length === 0 ? <EmptyChart h={80} msg="데이터 없음" sub="" /> : (
                  brokerStats.map(b => {
                    const total = b.wins + b.losses
                    const wr = total > 0 ? b.wins / total * 100 : 0
                    return (
                      <div key={b.broker} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{b.broker}</span>
                          <span style={{ fontWeight: 700, color: b.pnl >= 0 ? '#22d37a' : '#f04f5b' }}>{fmtPct(b.pnl)}</span>
                        </div>
                        <div style={{ background: '#1e1e42', borderRadius: 4, height: 6 }}>
                          <div style={{ width: `${wr}%`, height: '100%', background: '#22d37a', borderRadius: 4, transition: 'width 0.6s' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#6b6b9a' }}>
                          <span>{total}거래 · 승률 {wr.toFixed(0)}%</span>
                          <span><span style={{ color: '#22d37a' }}>{b.wins}W</span> / <span style={{ color: '#f04f5b' }}>{b.losses}L</span></span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="card">
                <div className="metric-label" style={{ marginBottom: 10 }}>레짐 분포</div>
                {regimes.length === 0 ? <EmptyChart h={60} msg="없음" sub="" /> : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {Object.entries(
                        regimes.reduce((acc, r) => { acc[r.regime] = (acc[r.regime] || 0) + 1; return acc }, {} as Record<string, number>)
                      ).map(([regime, count]) => {
                        const pct = count / regimes.length * 100
                        return (
                          <div key={regime}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
                              <span style={{ color: REGIME_COLOR[regime] ?? '#6b6b9a', fontWeight: 700 }}>{regime}</span>
                              <span style={{ color: '#6b6b9a' }}>{count}회 · {pct.toFixed(0)}%</span>
                            </div>
                            <div style={{ background: '#1e1e42', borderRadius: 3, height: 5 }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: REGIME_COLOR[regime] ?? '#6b6b9a', borderRadius: 3, opacity: 0.8 }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <RegimeTimeline regimes={regimes} />
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══════════ 시장 탭 ════════════════════════════════════════ */}
      {tab === 'market' && (
        <>
          {/* US / KR / HK 시장 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            {/* US (Alpaca) */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>🇺🇸</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#e8e8f8' }}>US 시장</div>
                  <div style={{ fontSize: 11, color: '#6b6b9a' }}>Alpaca Paper</div>
                </div>
              </div>
              {alpacaBot ? (
                <>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#7c6af7', letterSpacing: -1 }}>${fmt(alpacaBot.equity)}</div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12 }}>
                    <div><div style={{ color: '#6b6b9a', fontSize: 10 }}>오늘 P&L</div><div style={{ color: alpacaBot.daily_pnl >= 0 ? '#22d37a' : '#f04f5b', fontWeight: 700 }}>{fmtPct(alpacaBot.daily_pnl)}</div></div>
                    <div><div style={{ color: '#6b6b9a', fontSize: 10 }}>포지션</div><div style={{ fontWeight: 700 }}>{positions.filter(p => p.broker === 'Alpaca').length}개</div></div>
                    {alpacaMS && <div><div style={{ color: '#6b6b9a', fontSize: 10 }}>현금</div><div style={{ fontWeight: 700 }}>${fmt(alpacaMS.cash)}</div></div>}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#6b6b9a' }}>레짐 <strong style={{ color: REGIME_COLOR[currentRegime] ?? '#6b6b9a' }}>{currentRegime}</strong> · VIX {latestVix?.toFixed(1) ?? '—'}</div>
                </>
              ) : <EmptyChart h={100} msg="Alpaca 데이터 없음" sub="봇 실행 후 표시" />}
            </div>

            {/* KR */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>🇰🇷</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#e8e8f8' }}>KR 시장</div>
                  <div style={{ fontSize: 11, color: '#6b6b9a' }}>KIS 한국</div>
                </div>
              </div>
              {(() => {
                const m = kisMS.find(x => x.broker === 'KIS_KR')
                return m ? (
                  <>
                    <div style={{ fontSize: 26, fontWeight: 900, color: '#5b8af7', letterSpacing: -1 }}>₩{fmt(m.equity, 0)}</div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12 }}>
                      <div><div style={{ color: '#6b6b9a', fontSize: 10 }}>현금</div><div style={{ fontWeight: 700 }}>₩{fmt(m.cash, 0)}</div></div>
                      <div><div style={{ color: '#6b6b9a', fontSize: 10 }}>포지션</div><div style={{ fontWeight: 700 }}>{m.positions_count}개</div></div>
                      <div><div style={{ color: '#6b6b9a', fontSize: 10 }}>환율</div><div style={{ fontWeight: 700, color: '#f5a623' }}>₩{m.fx_rate?.toFixed(0)}</div></div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#6b6b9a' }}>USD 환산 <strong style={{ color: '#e8e8f8' }}>${fmt(m.equity / (m.fx_rate || 1380))}</strong></div>
                  </>
                ) : <EmptyChart h={100} msg="KR 데이터 없음" sub="sync 모듈 실행 후 표시" />
              })()}
            </div>

            {/* HK */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>🇭🇰</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#e8e8f8' }}>HK 시장</div>
                  <div style={{ fontSize: 11, color: '#6b6b9a' }}>KIS 홍콩</div>
                </div>
              </div>
              {(() => {
                const m = kisMS.find(x => x.broker === 'KIS_HK')
                return m ? (
                  <>
                    <div style={{ fontSize: 26, fontWeight: 900, color: '#14b8a6', letterSpacing: -1 }}>HK${fmt(m.equity)}</div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12 }}>
                      <div><div style={{ color: '#6b6b9a', fontSize: 10 }}>현금</div><div style={{ fontWeight: 700 }}>HK${fmt(m.cash)}</div></div>
                      <div><div style={{ color: '#6b6b9a', fontSize: 10 }}>포지션</div><div style={{ fontWeight: 700 }}>{m.positions_count}개</div></div>
                      <div><div style={{ color: '#6b6b9a', fontSize: 10 }}>환율</div><div style={{ fontWeight: 700, color: '#f5a623' }}>HK${m.fx_rate?.toFixed(2)}</div></div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#6b6b9a' }}>USD 환산 <strong style={{ color: '#e8e8f8' }}>${fmt(m.equity / (m.fx_rate || 7.78))}</strong></div>
                  </>
                ) : <EmptyChart h={100} msg="HK 데이터 없음" sub="sync 모듈 실행 후 표시" />
              })()}
            </div>
          </div>

          {/* 관심종목 테이블 */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="metric-label">관심종목 시세</div>
              <span style={{ fontSize: 11, color: '#6b6b9a' }}>{watchlist.length}종목</span>
            </div>
            {watchlist.length === 0 ? (
              <EmptyChart h={120} msg="관심종목 데이터 없음" sub="supabase_extended_sync.py로 sync 후 표시" />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>종목</th>
                      <th style={{ textAlign: 'right' }}>현재가</th>
                      <th style={{ textAlign: 'right' }}>등락률</th>
                      <th style={{ textAlign: 'right' }}>거래량</th>
                      <th style={{ textAlign: 'right' }}>업데이트</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchlist.map(q => (
                      <tr key={q.symbol}>
                        <td><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{q.symbol}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>${fmt(q.price)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ color: q.change_pct >= 0 ? '#22d37a' : '#f04f5b', fontWeight: 700 }}>
                            {fmtPct(q.change_pct)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', color: '#6b6b9a', fontSize: 11 }}>{(q.volume / 1_000_000).toFixed(1)}M</td>
                        <td style={{ textAlign: 'right', color: '#3a3a6a', fontSize: 10 }}>{fmtTime(q.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════ 투자자 탭 ══════════════════════════════════════ */}
      {tab === 'investors' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div className="metric-label">유명 투자자 포트폴리오</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: '#6b6b9a' }}>투자자 필터:</span>
              <select
                value={investorFilter}
                onChange={e => setInvestorFilter(e.target.value)}
                style={{
                  background: '#14142e', border: '1px solid #1e1e42', borderRadius: 8,
                  padding: '5px 10px', color: '#e8e8f8', fontSize: 12, cursor: 'pointer',
                }}
              >
                {investorNames.map(n => (
                  <option key={n} value={n}>{n === 'all' ? '전체 투자자' : n}</option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: '#6b6b9a' }}>{filteredInvestors.length}개 보유</span>
            </div>
          </div>
          {filteredInvestors.length === 0 ? (
            <EmptyChart h={160} msg="투자자 데이터 없음" sub="supabase_extended_sync.py 실행 후 표시" />
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: '72vh', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>투자자</th>
                    <th>종목</th>
                    <th style={{ textAlign: 'right' }}>보유주수</th>
                    <th style={{ textAlign: 'right' }}>평가액(M$)</th>
                    <th style={{ textAlign: 'right' }}>비중</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvestors.map((row, i) => (
                    <tr key={`${row.investor}-${row.symbol}-${i}`}>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 12, color: '#9898c8' }}>{row.investor}</span>
                      </td>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{row.symbol}</span></td>
                      <td style={{ textAlign: 'right', fontSize: 11, color: '#6b6b9a' }}>
                        {row.shares >= 1_000_000
                          ? `${(row.shares / 1_000_000).toFixed(1)}M`
                          : row.shares >= 1_000
                          ? `${(row.shares / 1_000).toFixed(0)}K`
                          : row.shares.toString()}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>${fmt(row.value / 1_000_000, 1)}M</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                          <div style={{ width: 60, background: '#1e1e42', borderRadius: 3, height: 5 }}>
                            <div style={{ width: `${Math.min(row.weight_pct, 100)}%`, height: '100%', background: '#7c6af7', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontWeight: 700, color: '#7c6af7', minWidth: 38, textAlign: 'right' }}>{row.weight_pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ textAlign: 'center', color: '#2a2a52', fontSize: 10, marginTop: 36 }}>
        KIS + Alpaca AI Trading Bot · Supabase + Vercel · 30초 자동갱신 + 실시간 구독
      </div>
    </div>
  )
}
