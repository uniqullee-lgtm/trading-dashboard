'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { supabase, Trade, Position, BotStatus, RegimeLog } from '@/lib/supabase'
import {
  ComposedChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine,
} from 'recharts'
import { format, parseISO, isToday } from 'date-fns'

// ── 색상 상수 ──────────────────────────────────────────────────────
const REGIME_COLOR: Record<string, string> = {
  BULL: '#22d37a', SIDEWAYS: '#f5a623', BEAR: '#f04f5b', PANIC: '#dc2626',
}
const STATUS_COLOR: Record<string, string> = {
  running: '#22d37a', stopped: '#6b6b9a', error: '#f04f5b',
}
const PIE_COLORS = ['#7c6af7', '#22d37a', '#f5a623', '#5b8af7', '#f04f5b', '#14b8a6', '#e879f9', '#fb923c']

// ── 포맷 헬퍼 ──────────────────────────────────────────────────────
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

type Tab = 'overview' | 'trades' | 'analytics'

// ── 커스텀 툴팁 ───────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
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

// ── 메트릭 카드 ──────────────────────────────────────────────────
function MetricCard({ label, value, sub, color = '#e8e8f8', glow = '', accent = false }: {
  label: string; value: ReactNode; sub?: ReactNode; color?: string; glow?: string; accent?: boolean
}) {
  return (
    <div className={accent ? 'card-glow' : 'card'} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 108 }}>
      <div className="metric-label">{label}</div>
      <div>
        <div style={{ fontSize: 'clamp(18px, 2.2vw, 30px)', fontWeight: 800, color, letterSpacing: -1, lineHeight: 1 }} className={glow}>
          {value}
        </div>
        {sub !== undefined && (
          <div style={{ fontSize: 11, color: '#6b6b9a', marginTop: 5 }}>{sub}</div>
        )}
      </div>
    </div>
  )
}

// ── 봇 배지 ──────────────────────────────────────────────────────
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
          {s.regime && (
            <span className="badge" style={{ background: (REGIME_COLOR[s.regime] ?? '#6b6b9a') + '18', color: REGIME_COLOR[s.regime] ?? '#6b6b9a' }}>
              {s.regime}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#9898c8' }}>
          자산&nbsp;<strong style={{ color: '#e8e8f8' }}>${fmt(s.equity)}</strong>
          &nbsp;·&nbsp;P&L&nbsp;
          <strong style={{ color: s.daily_pnl >= 0 ? '#22d37a' : '#f04f5b' }}>{fmtPct(s.daily_pnl)}</strong>
        </div>
        <div style={{ fontSize: 11, color: '#3a3a6a', marginTop: 3 }}>{elapsed}분 전 · {s.detail}</div>
      </div>
    </div>
  )
}

// ── 포지션 행 ─────────────────────────────────────────────────────
function PositionRow({ p }: { p: Position }) {
  const color = p.pl_pct >= 0 ? '#22d37a' : '#f04f5b'
  const unrealized = (p.current_price - p.avg_price) * p.qty
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(30,30,66,0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="badge" style={{ background: p.broker === 'KIS' ? '#5b8af718' : '#7c6af718', color: p.broker === 'KIS' ? '#5b8af7' : '#7c6af7' }}>
          {p.broker}
        </span>
        <div>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{p.symbol}</span>
          <span style={{ fontSize: 10, color: '#6b6b9a', marginLeft: 6 }}>{p.market}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color }}>{fmtPct(p.pl_pct)}</div>
        <div style={{ fontSize: 10, color: '#6b6b9a' }}>
          {p.currency === 'KRW' ? '₩' : '$'}{fmt(Math.abs(unrealized))} · {fmt(p.qty, 0)}주
        </div>
      </div>
    </div>
  )
}

// ── 승률 링 ──────────────────────────────────────────────────────
function WinRateRing({ rate, wins, losses }: { rate: number; wins: number; losses: number }) {
  const r = 44; const circ = 2 * Math.PI * r
  const filled = (rate / 100) * circ
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
          <span style={{ fontSize: 22, fontWeight: 800, color: '#22d37a', letterSpacing: -1 }} className="glow-green">
            {rate.toFixed(0)}%
          </span>
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

// ── 레짐 타임라인 ─────────────────────────────────────────────────
function RegimeTimeline({ regimes }: { regimes: RegimeLog[] }) {
  if (regimes.length === 0) return (
    <div style={{ height: 12, background: '#1e1e42', borderRadius: 4, opacity: 0.4, marginTop: 10 }} />
  )
  return (
    <div style={{ display: 'flex', gap: 2, marginTop: 10, height: 12 }}>
      {regimes.slice(-40).map((r, i) => (
        <div key={i} title={`${fmtDate(r.ts)} ${r.regime} · VIX ${r.vix?.toFixed(1)}`}
          style={{ flex: 1, borderRadius: 3, opacity: 0.75, background: REGIME_COLOR[r.regime] ?? '#6b6b9a' }} />
      ))}
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const [trades, setTrades]       = useState<Trade[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [bots, setBots]           = useState<BotStatus[]>([])
  const [regimes, setRegimes]     = useState<RegimeLog[]>([])
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<Tab>('overview')
  const [filterSide, setFilterSide]   = useState<'all' | 'buy' | 'sell'>('all')
  const [filterBroker, setFilterBroker] = useState('all')

  const fetchAll = useCallback(async () => {
    try {
      const [t, p, b, r] = await Promise.all([
        supabase.from('trades').select('*').order('ts', { ascending: false }).limit(500),
        supabase.from('positions').select('*').order('pl_pct', { ascending: false }),
        supabase.from('bot_status').select('*'),
        supabase.from('regime_log').select('*').order('ts', { ascending: false }).limit(100),
      ])
      if (t.data) setTrades(t.data)
      if (p.data) setPositions(p.data)
      if (b.data) setBots(b.data)
      if (r.data) setRegimes(r.data.reverse())
    } finally {
      setLoading(false)
      setLastRefresh(new Date())
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 30_000)

    const tradeSub = supabase.channel('trades-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, () => fetchAll())
      .subscribe()
    const posSub = supabase.channel('positions-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, () => fetchAll())
      .subscribe()
    const botSub = supabase.channel('bot-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_status' }, () => fetchAll())
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(tradeSub)
      supabase.removeChannel(posSub)
      supabase.removeChannel(botSub)
    }
  }, [fetchAll])

  // ── 집계 ─────────────────────────────────────────────────────────
  const todayTrades   = useMemo(() => trades.filter(t => isToday(parseISO(t.ts))), [trades])
  const totalEquity   = useMemo(() => bots.reduce((s, b) => s + b.equity, 0), [bots])
  const totalPnl      = useMemo(() => {
    if (!bots.length) return 0
    const weighted = bots.reduce((s, b) => s + b.daily_pnl * b.equity, 0)
    const eq = totalEquity
    return eq > 0 ? weighted / eq : bots.reduce((s, b) => s + b.daily_pnl, 0) / bots.length
  }, [bots, totalEquity])
  const currentRegime = useMemo(() => regimes.length > 0 ? regimes[regimes.length - 1].regime : '-', [regimes])
  const latestVix     = useMemo(() => regimes.length > 0 ? regimes[regimes.length - 1].vix : null, [regimes])

  const sellTrades = useMemo(() => trades.filter(t => t.side === 'sell' && t.reason?.includes('P&L:')), [trades])

  const { wins, losses, winRate } = useMemo(() => {
    const w = sellTrades.filter(t => (parsePnl(t.reason) ?? -1) > 0).length
    const l = sellTrades.length - w
    return { wins: w, losses: l, winRate: sellTrades.length > 0 ? (w / sellTrades.length) * 100 : 0 }
  }, [sellTrades])

  const profitFactor = useMemo(() => {
    const gains  = sellTrades.reduce((s, t) => { const p = parsePnl(t.reason); return p && p > 0 ? s + p : s }, 0)
    const losses = Math.abs(sellTrades.reduce((s, t) => { const p = parsePnl(t.reason); return p && p < 0 ? s + p : s }, 0))
    if (losses === 0) return gains > 0 ? 99 : 1
    return parseFloat((gains / losses).toFixed(2))
  }, [sellTrades])

  const { avgWin, avgLoss } = useMemo(() => {
    const wt = sellTrades.filter(t => (parsePnl(t.reason) ?? -1) > 0)
    const lt = sellTrades.filter(t => (parsePnl(t.reason) ?? 1) < 0)
    return {
      avgWin:  wt.length ? wt.reduce((s, t) => s + (parsePnl(t.reason) ?? 0), 0) / wt.length : 0,
      avgLoss: lt.length ? lt.reduce((s, t) => s + (parsePnl(t.reason) ?? 0), 0) / lt.length : 0,
    }
  }, [sellTrades])

  // VIX + SPY 차트
  const regimeChart = useMemo(() => regimes.slice(-30).map(r => ({
    t: fmtDate(r.ts), VIX: r.vix, SPY: r.sp500, regime: r.regime,
  })), [regimes])

  // 포지션 파이
  const posPie = useMemo(() => positions.map((p, i) => ({
    name: p.symbol, value: p.qty * p.avg_price, color: PIE_COLORS[i % PIE_COLORS.length],
  })), [positions])

  // 일별 P&L
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

  // 심볼별 P&L
  const symbolPnl = useMemo(() => {
    const m: Record<string, { symbol: string; pnl: number; count: number }> = {}
    sellTrades.forEach(t => {
      const pnl = parsePnl(t.reason); if (pnl === null) return
      if (!m[t.symbol]) m[t.symbol] = { symbol: t.symbol, pnl: 0, count: 0 }
      m[t.symbol].pnl += pnl; m[t.symbol].count++
    })
    return Object.values(m).sort((a, b) => b.pnl - a.pnl).slice(0, 12)
  }, [sellTrades])

  // 브로커별 성과
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

  // 필터된 거래
  const brokers = useMemo(() => ['all', ...Array.from(new Set(trades.map(t => t.broker)))], [trades])
  const filteredTrades = useMemo(() => trades.filter(t => {
    if (filterSide !== 'all' && t.side !== filterSide) return false
    if (filterBroker !== 'all' && t.broker !== filterBroker) return false
    return true
  }), [trades, filterSide, filterBroker])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 14 }}>
      <div className="live-dot" />
      <span style={{ color: '#6b6b9a', fontSize: 14 }}>데이터 로딩 중…</span>
    </div>
  )

  const pnlColor = totalPnl >= 0 ? '#22d37a' : '#f04f5b'
  const pnlGlow  = totalPnl >= 0 ? 'glow-green' : 'glow-red'

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 20px 48px' }}>

      {/* ── 헤더 ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div className="live-dot" />
            <span style={{ fontSize: 10, color: '#6b6b9a', letterSpacing: 3, textTransform: 'uppercase' }}>Live</span>
            <span style={{ fontSize: 10, color: '#2a2a52', letterSpacing: 1 }}>· 30초 자동갱신</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: -1, color: '#e8e8f8', margin: 0 }}>
            AI Trading<span style={{ color: '#7c6af7' }}> · </span>Dashboard
          </h1>
          <p style={{ fontSize: 11, color: '#6b6b9a', margin: '3px 0 0' }}>
            KIS (한국 · 미국 · 홍콩) + Alpaca · Supabase 실시간
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {latestVix !== null && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: REGIME_COLOR[currentRegime] ?? '#6b6b9a' }}>
                {currentRegime} · VIX {latestVix.toFixed(1)}
              </div>
              <div style={{ fontSize: 10, color: '#3a3a5a' }}>{format(lastRefresh, 'HH:mm:ss')}</div>
            </div>
          )}
          <button onClick={fetchAll} style={{
            background: '#14142e', border: '1px solid #1e1e42', borderRadius: 10,
            padding: '8px 16px', color: '#7c6af7', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            ↻ 갱신
          </button>
        </div>
      </div>

      {/* ── 탭 네비게이션 ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 18, borderBottom: '1px solid #1e1e42' }}>
        {([
          { key: 'overview',  label: '📊 개요' },
          { key: 'trades',    label: '📋 거래내역' },
          { key: 'analytics', label: '📈 분석' },
        ] as { key: Tab; label: string }[]).map(item => (
          <button key={item.key} onClick={() => setTab(item.key)} style={{
            background: 'none', border: 'none', borderBottom: tab === item.key ? '2px solid #7c6af7' : '2px solid transparent',
            padding: '8px 18px', marginBottom: -1,
            color: tab === item.key ? '#e8e8f8' : '#6b6b9a',
            fontSize: 13, fontWeight: tab === item.key ? 700 : 500,
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {item.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#3a3a5a', alignSelf: 'center', paddingRight: 4 }}>
          {trades.length}건 · {positions.length}포지션
        </span>
      </div>

      {/* ══════════════════════════════════════════════════════════
          개요 탭
      ══════════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <>
          {/* Row 1: 6 메트릭 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>

            {/* 총 자산 */}
            <div className="card-glow" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div className="metric-label">총 평가 자산</div>
              <div>
                <div className="big-number glow-purple" style={{ color: '#e8e8f8' }}>
                  ${fmt(totalEquity)}
                </div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge" style={{ background: pnlColor + '18', color: pnlColor, fontSize: 12, padding: '3px 10px' }}>
                    {totalPnl >= 0 ? '▲' : '▼'} {fmtPct(totalPnl)}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b6b9a' }}>오늘 기준</span>
                </div>
              </div>
            </div>

            {/* P&L */}
            <MetricCard label="오늘 P&L" color={pnlColor} glow={pnlGlow}
              value={fmtPct(totalPnl)}
              sub={`${todayTrades.length}건 체결`} />

            {/* 승률 링 */}
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
              <WinRateRing rate={winRate} wins={wins} losses={losses} />
            </div>

            {/* Profit Factor */}
            <MetricCard label="Profit Factor"
              color={profitFactor >= 1.5 ? '#22d37a' : profitFactor >= 1 ? '#f5a623' : '#f04f5b'}
              value={profitFactor === 99 ? '∞' : profitFactor.toFixed(2)}
              sub={<span>수익 <span style={{ color: '#22d37a' }}>{avgWin.toFixed(1)}%</span> · 손실 <span style={{ color: '#f04f5b' }}>{avgLoss.toFixed(1)}%</span></span>} />

            {/* 레짐 */}
            <MetricCard label="마켓 레짐"
              color={REGIME_COLOR[currentRegime] ?? '#6b6b9a'}
              value={currentRegime}
              sub={latestVix !== null ? `VIX ${latestVix.toFixed(1)}` : '데이터 없음'} />

            {/* 포지션 */}
            <MetricCard label="오픈 포지션" color="#5b8af7" glow="glow-blue"
              value={positions.length.toString()}
              sub="종목 보유중" />
          </div>

          {/* Row 2: VIX+SPY 차트 + 봇 상태 */}
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
                <ResponsiveContainer width="100%" height={155}>
                  <ComposedChart data={regimeChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                    <XAxis dataKey="t" tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                    <YAxis yAxisId="left"  tick={{ fill: '#6b6b9a', fontSize: 9 }} domain={['auto', 'auto']} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b6b9a', fontSize: 9 }} domain={['auto', 'auto']} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line yAxisId="left"  type="monotone" dataKey="VIX" stroke="#f5a623" strokeWidth={2} dot={false} name="VIX" />
                    <Line yAxisId="right" type="monotone" dataKey="SPY" stroke="#7c6af7" strokeWidth={2} dot={false} name="SPY" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 155, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a6a', fontSize: 13 }}>
                  레짐 데이터 없음
                </div>
              )}
              <div className="metric-label" style={{ marginTop: 12, marginBottom: 2 }}>레짐 히스토리</div>
              <RegimeTimeline regimes={regimes} />
            </div>

            <div className="card">
              <div className="metric-label" style={{ marginBottom: 10 }}>봇 상태</div>
              {bots.length === 0
                ? <div style={{ color: '#3a3a6a', fontSize: 13, padding: '16px 0' }}>봇 상태 없음 — 봇을 실행하세요</div>
                : bots.map(b => <BotBadge key={b.broker} s={b} />)
              }
              {bots.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1e1e42', fontSize: 11, color: '#6b6b9a' }}>
                  봇 {bots.length}개 · running {bots.filter(b => b.status === 'running').length}개
                </div>
              )}
            </div>
          </div>

          {/* Row 3: 포지션 파이 + 포지션 리스트 + 최근 거래 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>

            {/* 포지션 파이 */}
            <div className="card">
              <div className="metric-label" style={{ marginBottom: 8 }}>포지션 구성</div>
              {posPie.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={posPie} cx="50%" cy="50%" innerRadius={36} outerRadius={54}
                        dataKey="value" nameKey="name" paddingAngle={4}>
                        {posPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `$${fmt(v)}`}
                        contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {posPie.map((p, i) => (
                      <span key={p.name} style={{ fontSize: 10, color: PIE_COLORS[i % PIE_COLORS.length], display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], display: 'inline-block' }} />
                        {p.name}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a6a', fontSize: 13 }}>
                  포지션 없음
                </div>
              )}
            </div>

            {/* 포지션 리스트 */}
            <div className="card">
              <div className="metric-label" style={{ marginBottom: 8 }}>보유 포지션 ({positions.length})</div>
              {positions.length === 0
                ? <div style={{ color: '#3a3a6a', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>보유 포지션 없음</div>
                : positions.slice(0, 8).map(p => <PositionRow key={`${p.broker}-${p.symbol}`} p={p} />)
              }
            </div>

            {/* 최근 거래 */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div className="metric-label">최근 거래</div>
                <button onClick={() => setTab('trades')}
                  style={{ fontSize: 11, color: '#7c6af7', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  전체 보기 →
                </button>
              </div>
              {trades.length === 0
                ? <div style={{ color: '#3a3a6a', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>거래 내역 없음</div>
                : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr><th>시각</th><th>구분</th><th>종목</th><th>브로커</th><th style={{ textAlign: 'right' }}>금액</th><th style={{ textAlign: 'right' }}>P&L</th></tr>
                      </thead>
                      <tbody>
                        {trades.slice(0, 12).map(t => {
                          const isBuy = t.side === 'buy'
                          const pnl = parsePnl(t.reason)
                          return (
                            <tr key={t.id}>
                              <td style={{ color: '#6b6b9a', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtTime(t.ts)}</td>
                              <td><span className="badge" style={{ background: isBuy ? '#22d37a18' : '#f04f5b18', color: isBuy ? '#22d37a' : '#f04f5b' }}>{isBuy ? '매수' : '매도'}</span></td>
                              <td><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{t.symbol}</span></td>
                              <td><span style={{ fontSize: 11, color: '#6b6b9a' }}>{t.broker}</span></td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>{t.currency === 'KRW' ? '₩' : '$'}{fmt(t.value)}</td>
                              <td style={{ textAlign: 'right' }}>
                                {pnl !== null
                                  ? <span style={{ fontSize: 12, fontWeight: 700, color: pnl >= 0 ? '#22d37a' : '#f04f5b' }}>{fmtPct(pnl)}</span>
                                  : <span style={{ color: '#3a3a6a', fontSize: 11 }}>—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          거래내역 탭
      ══════════════════════════════════════════════════════════ */}
      {tab === 'trades' && (
        <div className="card">
          {/* 필터 바 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#6b6b9a', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginRight: 4 }}>필터</span>
            {(['all', 'buy', 'sell'] as const).map(s => (
              <button key={s} onClick={() => setFilterSide(s)} style={{
                background: filterSide === s ? '#7c6af718' : 'transparent',
                border: `1px solid ${filterSide === s ? '#7c6af7' : '#1e1e42'}`,
                borderRadius: 8, padding: '5px 12px',
                color: filterSide === s ? '#7c6af7' : '#6b6b9a',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                {s === 'all' ? '전체' : s === 'buy' ? '매수' : '매도'}
              </button>
            ))}
            <div style={{ width: 1, height: 18, background: '#1e1e42', margin: '0 4px' }} />
            {brokers.map(b => (
              <button key={b} onClick={() => setFilterBroker(b)} style={{
                background: filterBroker === b ? '#5b8af718' : 'transparent',
                border: `1px solid ${filterBroker === b ? '#5b8af7' : '#1e1e42'}`,
                borderRadius: 8, padding: '5px 12px',
                color: filterBroker === b ? '#5b8af7' : '#6b6b9a',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                {b === 'all' ? '전체 브로커' : b}
              </button>
            ))}
            <div style={{ flex: 1, textAlign: 'right', fontSize: 11, color: '#6b6b9a' }}>{filteredTrades.length}건</div>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '68vh', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>시각</th><th>구분</th><th>종목</th><th>브로커</th>
                  <th>마켓</th><th>수량</th>
                  <th style={{ textAlign: 'right' }}>단가</th>
                  <th style={{ textAlign: 'right' }}>금액</th>
                  <th style={{ textAlign: 'right' }}>P&L</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map(t => {
                  const isBuy = t.side === 'buy'
                  const pnl   = parsePnl(t.reason)
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
                        {pnl !== null
                          ? <span style={{ fontSize: 12, fontWeight: 700, color: pnl >= 0 ? '#22d37a' : '#f04f5b' }}>{fmtPct(pnl)}</span>
                          : <span style={{ color: '#3a3a6a', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ fontSize: 10, color: '#3a3a6a', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.reason}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredTrades.length === 0 && (
              <div style={{ textAlign: 'center', color: '#3a3a6a', padding: '48px 0', fontSize: 13 }}>거래 내역 없음</div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          분석 탭
      ══════════════════════════════════════════════════════════ */}
      {tab === 'analytics' && (
        <>
          {/* 성과 요약 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
            <MetricCard label="총 매도 거래" color="#7c6af7" glow="glow-purple"
              value={sellTrades.length.toString()} sub="익절 + 손절 합계" />
            <MetricCard label="승률" color="#22d37a" glow="glow-green"
              value={`${winRate.toFixed(1)}%`} sub={`${wins}승 ${losses}패`} />
            <MetricCard label="Profit Factor"
              color={profitFactor >= 1.5 ? '#22d37a' : profitFactor >= 1 ? '#f5a623' : '#f04f5b'}
              value={profitFactor === 99 ? '∞' : profitFactor.toFixed(2)} sub="총수익합 / 총손실합" />
            <MetricCard label="평균 수익률" color={avgWin > 0 ? '#22d37a' : '#6b6b9a'}
              value={`${avgWin.toFixed(2)}%`}
              sub={<span>손실 평균 <span style={{ color: '#f04f5b' }}>{avgLoss.toFixed(2)}%</span></span>} />
          </div>

          {/* 일별 P&L + 심볼별 P&L */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>

            <div className="card">
              <div className="metric-label" style={{ marginBottom: 10 }}>일별 누적 P&L (%)</div>
              {dailyPnl.length > 0 ? (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={dailyPnl}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                    <XAxis dataKey="date" tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                    <YAxis tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                    <Tooltip contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 11 }}
                      formatter={(v: number) => [`${v.toFixed(2)}%`, 'P&L']} />
                    <ReferenceLine y={0} stroke="#3a3a6a" />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {dailyPnl.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#22d37a' : '#f04f5b'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a6a', fontSize: 13, textAlign: 'center', lineHeight: 1.8 }}>
                  데이터 없음<br />
                  <span style={{ fontSize: 11 }}>봇이 거래를 시작하면 표시됩니다</span>
                </div>
              )}
            </div>

            <div className="card">
              <div className="metric-label" style={{ marginBottom: 10 }}>심볼별 누적 P&L (%)</div>
              {symbolPnl.length > 0 ? (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={symbolPnl} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                    <XAxis type="number" tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                    <YAxis dataKey="symbol" type="category" width={64} tick={{ fill: '#9898c8', fontSize: 10, fontFamily: 'monospace' }} />
                    <Tooltip contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 11 }}
                      formatter={(v: number) => [`${v.toFixed(2)}%`, 'P&L']} />
                    <ReferenceLine x={0} stroke="#3a3a6a" />
                    <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                      {symbolPnl.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#22d37a' : '#f04f5b'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a6a', fontSize: 13 }}>
                  데이터 없음
                </div>
              )}
            </div>
          </div>

          {/* 브로커별 성과 + 레짐 히스토리 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>

            <div className="card">
              <div className="metric-label" style={{ marginBottom: 14 }}>브로커별 성과</div>
              {brokerStats.length === 0 ? (
                <div style={{ color: '#3a3a6a', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>데이터 없음</div>
              ) : (
                brokerStats.map(b => {
                  const total = b.wins + b.losses
                  const wr = total > 0 ? b.wins / total * 100 : 0
                  return (
                    <div key={b.broker} style={{ marginBottom: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{b.broker}</span>
                        <span style={{ fontWeight: 700, color: b.pnl >= 0 ? '#22d37a' : '#f04f5b' }}>{fmtPct(b.pnl)}</span>
                      </div>
                      <div style={{ background: '#1e1e42', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${wr}%`, height: '100%', background: '#22d37a', borderRadius: 4, transition: 'width 0.6s ease' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, color: '#6b6b9a' }}>
                        <span>{total}거래 · 승률 {wr.toFixed(0)}%</span>
                        <span><span style={{ color: '#22d37a' }}>{b.wins}W</span> / <span style={{ color: '#f04f5b' }}>{b.losses}L</span></span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="card">
              <div className="metric-label" style={{ marginBottom: 10 }}>레짐 히스토리</div>
              {regimes.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={155}>
                    <ComposedChart data={regimeChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                      <XAxis dataKey="t" tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                      <YAxis yAxisId="left"  tick={{ fill: '#6b6b9a', fontSize: 9 }} domain={['auto', 'auto']} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b6b9a', fontSize: 9 }} domain={['auto', 'auto']} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line yAxisId="left"  type="monotone" dataKey="VIX" stroke="#f5a623" strokeWidth={2} dot={false} name="VIX" />
                      <Line yAxisId="right" type="monotone" dataKey="SPY" stroke="#7c6af7" strokeWidth={2} dot={false} name="SPY" />
                    </ComposedChart>
                  </ResponsiveContainer>

                  <div className="metric-label" style={{ marginTop: 14, marginBottom: 8 }}>레짐 분포</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(
                      regimes.reduce((acc, r) => { acc[r.regime] = (acc[r.regime] || 0) + 1; return acc }, {} as Record<string, number>)
                    ).map(([regime, count]) => (
                      <div key={regime} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: (REGIME_COLOR[regime] ?? '#6b6b9a') + '18' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: REGIME_COLOR[regime] ?? '#6b6b9a', display: 'inline-block' }} />
                        <span style={{ fontSize: 12, color: REGIME_COLOR[regime] ?? '#6b6b9a', fontWeight: 700 }}>{regime}</span>
                        <span style={{ fontSize: 11, color: '#6b6b9a' }}>{count}회 ({(count / regimes.length * 100).toFixed(0)}%)</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <RegimeTimeline regimes={regimes} />
                  </div>
                </>
              ) : (
                <div style={{ height: 155, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a6a', fontSize: 13 }}>
                  레짐 데이터 없음
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── 푸터 ─────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', color: '#2a2a52', fontSize: 10, marginTop: 36, paddingBottom: 4 }}>
        KIS + Alpaca AI Trading Bot · Supabase + Vercel · 30초 자동갱신 + 실시간 구독
      </div>
    </div>
  )
}
