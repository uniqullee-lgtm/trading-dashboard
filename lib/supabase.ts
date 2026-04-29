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
