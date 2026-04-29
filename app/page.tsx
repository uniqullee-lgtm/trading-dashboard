'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, Trade, Position, BotStatus, RegimeLog } from '@/lib/supabase'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { format, parseISO, isToday } from 'date-fns'

// ── 색상 상수 ──────────────────────────────────────────────────────
const REGIME_COLOR: Record<string, string> = {
  BULL: '#22d37a', SIDEWAYS: '#f5a623', BEAR: '#f04f5b', PANIC: '#dc2626',
}
const STATUS_COLOR: Record<string, string> = {
  running: '#22d37a', stopped: '#6b6b9a', error: '#f04f5b',
}
const PIE_COLORS = ['#7c6af7', '#22d37a', '#f5a623', '#5b8af7', '#f04f5b', '#14b8a6']

// ── 포맷 헬퍼 ─────────────────────────────────────────────────────
const fmt = (n: number, d = 2) => n.toLocaleString('ko-KR', { maximumFractionDigits: d })
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${fmt(n)}%`
const fmtTime = (ts: string) => {
  try { return format(parseISO(ts), 'MM/dd HH:mm') } catch { return ts }
}

// ── 커스텀 툴팁 ───────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#14142e', border:'1px solid #252550', borderRadius:10, padding:'8px 12px', fontSize:12 }}>
      <div style={{ color:'#6b6b9a', marginBottom:2 }}>{label}</div>
      <div style={{ color:'#7c6af7', fontWeight:700 }}>{payload[0].value?.toFixed(3)}%</div>
    </div>
  )
}

// ── 섹션 카드 ─────────────────────────────────────────────────────
function Card({ title, children, className = '', glow = false }: {
  title: string; children: React.ReactNode; className?: string; glow?: boolean
}) {
  return (
    <div className={`${glow ? 'card-glow' : 'card'} ${className}`}>
      <div className="metric-label mb-4">{title}</div>
      {children}
    </div>
  )
}

// ── 봇 상태 배지 ──────────────────────────────────────────────────
function BotBadge({ s }: { s: BotStatus }) {
  const color = STATUS_COLOR[s.status] ?? '#6b6b9a'
  const elapsed = Math.floor((Date.now() - new Date(s.updated_at).getTime()) / 60000)
  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid rgba(30,30,66,0.6)' }}>
      <div className="status-ring mt-1" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{s.broker}</span>
          <span className="badge" style={{ background: color + '18', color }}>{s.status}</span>
          {s.regime && (
            <span className="badge" style={{ background: (REGIME_COLOR[s.regime] ?? '#6b6b9a') + '18', color: REGIME_COLOR[s.regime] ?? '#6b6b9a' }}>
              {s.regime}
            </span>
          )}
        </div>
        <div className="text-xs mt-1.5" style={{ color: '#6b6b9a' }}>
          자산&nbsp;<span style={{ color: '#e8e8f8', fontWeight: 600 }}>${fmt(s.equity)}</span>
          &nbsp;·&nbsp;오늘 P&amp;L&nbsp;
          <span style={{ color: s.daily_pnl >= 0 ? '#22d37a' : '#f04f5b', fontWeight: 600 }}>{fmtPct(s.daily_pnl)}</span>
        </div>
        <div className="text-xs mt-0.5" style={{ color: '#3a3a6a' }}>{elapsed}분 전 · {s.detail}</div>
      </div>
    </div>
  )
}

// ── 포지션 행 ────────────────────────────────────────────────────
function PositionRow({ p }: { p: Position }) {
  const color = p.pl_pct >= 0 ? '#22d37a' : '#f04f5b'
  const isBrokerKIS = p.broker === 'KIS'
  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid rgba(30,30,66,0.5)' }}>
      <div className="flex items-center gap-2.5">
        <span className="badge" style={{ background: isBrokerKIS ? '#5b8af718' : '#7c6af718', color: isBrokerKIS ? '#5b8af7' : '#7c6af7' }}>
          {p.broker}
        </span>
        <div>
          <span className="font-mono font-bold text-sm">{p.symbol}</span>
          <span className="text-xs ml-1.5" style={{ color: '#6b6b9a' }}>{p.market}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold" style={{ color }}>{fmtPct(p.pl_pct)}</div>
        <div className="text-xs" style={{ color: '#6b6b9a' }}>
          {fmt(p.qty)}주 @ {p.currency === 'KRW' ? '₩' : '$'}{fmt(p.avg_price)}
        </div>
      </div>
    </div>
  )
}

// ── 거래 행 (compact) ────────────────────────────────────────────
function TradeRow({ t }: { t: Trade }) {
  const isBuy = t.side === 'buy'
  return (
    <tr>
      <td style={{ color: '#6b6b9a', fontSize: 11 }}>{fmtTime(t.ts)}</td>
      <td>
        <span className="badge" style={{ background: isBuy ? '#22d37a18' : '#f04f5b18', color: isBuy ? '#22d37a' : '#f04f5b' }}>
          {isBuy ? '매수' : '매도'}
        </span>
      </td>
      <td><span className="font-mono font-bold text-sm">{t.symbol}</span></td>
      <td style={{ color: '#6b6b9a', fontSize: 11 }}>{t.broker} {t.market}</td>
      <td className="text-right" style={{ fontWeight: 600 }}>
        {t.currency === 'KRW' ? '₩' : '$'}{fmt(t.value)}
      </td>
    </tr>
  )
}

// ── 승률 도넛 (SVG) ───────────────────────────────────────────────
function WinRateRing({ rate, wins, losses }: { rate: number; wins: number; losses: number }) {
  const r = 48; const circ = 2 * Math.PI * r
  const filled = (rate / 100) * circ
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="60" cy="60" r={r} fill="none" stroke="#1e1e42" strokeWidth="10" />
          <circle cx="60" cy="60" r={r} fill="none" stroke="#22d37a" strokeWidth="10"
            strokeDasharray={`${filled} ${circ - filled}`}
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 6px #22d37a88)', transition: 'stroke-dasharray 1s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: '#22d37a', letterSpacing: -1 }}
            className="glow-green">{rate.toFixed(0)}%</span>
          <span style={{ fontSize: 10, color: '#6b6b9a', marginTop: 1 }}>WIN RATE</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#6b6b9a' }}>
        <span><span style={{ color: '#22d37a', fontWeight: 700 }}>{wins}W</span></span>
        <span><span style={{ color: '#f04f5b', fontWeight: 700 }}>{losses}L</span></span>
      </div>
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

  const fetchAll = useCallback(async () => {
    try {
      const [t, p, b, r] = await Promise.all([
        supabase.from('trades').select('*').order('ts', { ascending: false }).limit(100),
        supabase.from('positions').select('*').order('pl_pct', { ascending: false }),
        supabase.from('bot_status').select('*'),
        supabase.from('regime_log').select('*').order('ts', { ascending: false }).limit(50),
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
    const interval = setInterval(fetchAll, 60_000)  // 1분마다 자동 갱신

    // 실시간 구독
    const tradeSub = supabase.channel('trades-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, () => fetchAll())
      .subscribe()
    const posSub = supabase.channel('positions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, () => fetchAll())
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(tradeSub)
      supabase.removeChannel(posSub)
    }
  }, [fetchAll])

  // ── 집계 ────────────────────────────────────────────────────────
  const todayTrades  = trades.filter(t => isToday(parseISO(t.ts)))
  const totalEquity  = bots.reduce((s, b) => s + b.equity, 0)
  const totalPnl     = bots.reduce((s, b) => s + b.daily_pnl, 0)
  const currentRegime = regimes.length > 0 ? regimes[regimes.length - 1].regime : '-'

  // 레짐 히스토리 차트용 (VIX)
  const regimeChart = regimes.slice(-20).map(r => ({
    t: format(parseISO(r.ts), 'MM/dd'),
    VIX: r.vix,
  }))

  // 포지션 파이 차트
  const posPie = positions.map((p, i) => ({
    name: p.symbol,
    value: p.qty * p.avg_price,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }))

  // 오늘 거래 타임라인 차트
  const tradeTimeline = todayTrades.slice().reverse().map((t, i) => ({
    i: i + 1,
    amt: t.value,
    side: t.side === 'buy' ? 1 : -1,
  }))

  // 승률 계산
  const sellTrades = trades.filter(t => t.side === 'sell' && t.reason?.includes('P&L:'))
  const wins   = sellTrades.filter(t => { try { return parseFloat(t.reason.split('P&L:')[1]) > 0 } catch { return false } }).length
  const losses = sellTrades.length - wins
  const winRate = sellTrades.length > 0 ? (wins / sellTrades.length) * 100 : 0

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
      <div className="live-dot" />
      <span style={{ color: '#6b6b9a', fontSize: 14 }}>데이터 로딩 중…</span>
    </div>
  )

  const pnlColor = totalPnl >= 0 ? '#22d37a' : '#f04f5b'
  const pnlGlow  = totalPnl >= 0 ? 'glow-green' : 'glow-red'

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 20px' }}>

      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div className="live-dot" />
            <span style={{ fontSize: 11, color: '#6b6b9a', letterSpacing: 2, textTransform: 'uppercase' }}>Live</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: '#e8e8f8' }}>
            AI Trading Dashboard
          </h1>
          <p style={{ fontSize: 12, color: '#6b6b9a', marginTop: 2 }}>
            KIS (한국 · 미국 · 홍콩) + Alpaca · 실시간 모니터링
          </p>
        </div>
        <button onClick={fetchAll}
          style={{ background: '#14142e', border: '1px solid #1e1e42', borderRadius: 10, padding: '8px 16px',
            color: '#7c6af7', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          ↻ &nbsp;갱신 · {format(lastRefresh, 'HH:mm:ss')}
        </button>
      </div>

      {/* ── TOP ROW: 총자산 + P&L + 거래 + 레짐 + 승률 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>

        {/* 총 자산 — 가장 큰 카드 */}
        <div className="card-glow" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="metric-label">총 평가 자산</div>
          <div>
            <div className="big-number glow-purple" style={{ color: '#e8e8f8' }}>
              ${fmt(totalEquity)}
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge" style={{ background: pnlColor + '18', color: pnlColor, fontSize: 13, padding: '3px 10px' }}>
                {totalPnl >= 0 ? '▲' : '▼'} {fmtPct(totalPnl)}
              </span>
              <span style={{ fontSize: 11, color: '#6b6b9a' }}>오늘 기준</span>
            </div>
          </div>
        </div>

        {/* P&L */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="metric-label">P&amp;L</div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: pnlColor, letterSpacing: -1 }} className={pnlGlow}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}%
            </div>
            <div style={{ fontSize: 11, color: '#6b6b9a', marginTop: 4 }}>{todayTrades.length}건 체결</div>
          </div>
        </div>

        {/* 승률 */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <WinRateRing rate={winRate} wins={wins} losses={losses} />
        </div>

        {/* 레짐 */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="metric-label">마켓 레짐</div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: REGIME_COLOR[currentRegime] ?? '#6b6b9a', letterSpacing: -0.5 }}>
              {currentRegime}
            </div>
            <div style={{ fontSize: 11, color: '#6b6b9a', marginTop: 4 }}>
              {regimes.length > 0 ? `VIX ${regimes[regimes.length-1]?.vix?.toFixed(1) ?? '-'}` : '데이터 없음'}
            </div>
          </div>
        </div>

        {/* 오픈 포지션 수 */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="metric-label">오픈 포지션</div>
          <div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#5b8af7', letterSpacing: -1 }} className="glow-blue">
              {positions.length}
            </div>
            <div style={{ fontSize: 11, color: '#6b6b9a', marginTop: 4 }}>종목 보유중</div>
          </div>
        </div>

      </div>

      {/* ── MIDDLE ROW: VIX 차트 + 포지션 파이 + 봇 상태 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, marginBottom: 16 }}>

        {/* VIX 추이 */}
        <Card title="VIX 추이 · 시장 레짐">
          {regimeChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={regimeChart}>
                <defs>
                  <linearGradient id="vixGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f5a623" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f5a623" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e42" />
                <XAxis dataKey="t" tick={{ fill: '#6b6b9a', fontSize: 9 }} />
                <YAxis tick={{ fill: '#6b6b9a', fontSize: 9 }} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 11 }} />
                <Area type="monotone" dataKey="VIX" stroke="#f5a623" strokeWidth={2} fill="url(#vixGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a6a', fontSize: 13 }}>레짐 데이터 없음</div>}
        </Card>

        {/* 포지션 파이 */}
        <Card title="포지션 구성">
          {posPie.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={posPie} cx="50%" cy="50%" innerRadius={38} outerRadius={58}
                  dataKey="value" nameKey="name" paddingAngle={4}>
                  {posPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `$${fmt(v)}`}
                  contentStyle={{ background: '#14142e', border: '1px solid #252550', borderRadius: 10, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a6a', fontSize: 13 }}>
              포지션 없음
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {posPie.map((p, i) => (
              <span key={p.name} style={{ fontSize: 10, color: PIE_COLORS[i % PIE_COLORS.length], display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], display: 'inline-block' }} />
                {p.name}
              </span>
            ))}
          </div>
        </Card>

        {/* 봇 상태 */}
        <Card title="봇 상태">
          {bots.length === 0
            ? <div style={{ color: '#3a3a6a', fontSize: 13, paddingTop: 12 }}>봇 상태 없음 — 봇을 실행하세요</div>
            : bots.map(b => <BotBadge key={b.broker} s={b} />)
          }
        </Card>

      </div>

      {/* ── BOTTOM ROW: 포지션 리스트 + 최근 거래 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>

        {/* 보유 포지션 */}
        <Card title={`보유 포지션 (${positions.length})`}>
          {positions.length === 0
            ? <div style={{ color: '#3a3a6a', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>보유 포지션 없음</div>
            : positions.slice(0, 10).map(p => <PositionRow key={`${p.broker}-${p.symbol}`} p={p} />)
          }
        </Card>

        {/* 최근 거래 */}
        <Card title={`최근 거래 (${trades.length}건)`}>
          {trades.length === 0
            ? <div style={{ color: '#3a3a6a', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>거래 내역 없음</div>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr><th>시각</th><th>구분</th><th>종목</th><th>브로커</th><th style={{ textAlign: 'right' }}>금액</th></tr>
                  </thead>
                  <tbody>
                    {trades.slice(0, 20).map(t => <TradeRow key={t.id} t={t} />)}
                  </tbody>
                </table>
              </div>
            )
          }
        </Card>

      </div>

      {/* ── 푸터 ── */}
      <div style={{ textAlign: 'center', color: '#2a2a52', fontSize: 11, marginTop: 32, paddingBottom: 20 }}>
        KIS + Alpaca AI Trading Bot · Powered by Supabase + Vercel · 1분마다 자동 갱신
      </div>

    </div>
  )
}
