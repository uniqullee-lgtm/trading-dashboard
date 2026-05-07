import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── 타입 정의 ──────────────────────────────────────────────────────
export interface Trade {
  id: number
  ts: string
  broker: string
  mode: string
  market: string
  symbol: string
  side: 'buy' | 'sell'
  qty: number
  price: number
  currency: string
  value: number
  reason: string
}

export interface Position {
  id: number
  broker: string
  market: string
  symbol: string
  qty: number
  avg_price: number
  current_price: number
  pl_pct: number
  currency: string
  updated_at: string
}

export interface BotStatus {
  id: number
  broker: string
  status: 'running' | 'stopped' | 'error'
  regime: string
  detail: string
  equity: number
  daily_pnl: number
  updated_at: string
}

export interface RegimeLog {
  id: number
  ts: string
  regime: string
  vix: number
  sp500: number
}

export interface MarketSummary {
  id: number
  broker: string
  equity: number
  cash: number
  positions_count: number
  fx_rate: number
  currency: string
  updated_at: string
}

export interface WatchlistQuote {
  id: number
  symbol: string
  price: number
  change_pct: number
  volume: number
  updated_at: string
}

export interface InvestorPortfolio {
  id: number
  investor: string
  symbol: string
  shares: number
  value: number
  weight_pct: number
  updated_at: string
}

export interface Setting {
  key: string
  value: string
  updated_at: string
}

export interface SurvivalModeState {
  id: number
  seed_capital: number
  survival_floor: number
  active_capital: number
  peak_equity: number
  total_realized_pnl: number
  pnl_pct: number
  positions_count: number
  positions_json: string
  reached_milestones: string
  updated_at: string
}

export interface SurvivalPosition {
  entry_price: number
  qty: number
  cost: number
  atr: number
  trailing_stop: number
  peak_price: number
  entry_time: string
}
