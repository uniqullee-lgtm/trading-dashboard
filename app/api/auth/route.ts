import { NextRequest, NextResponse } from 'next/server'

const AUTH_COOKIE   = 'dash_auth'
const MAX_AGE_SEC   = 7 * 24 * 60 * 60   // 7일
const RATE_LIMIT_MS = 2000               // 실패 시 최소 딜레이

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSign(value: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value))
  return bufToHex(sig)
}

function constTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

async function makeToken(secret: string): Promise<string> {
  const ts = Date.now().toString()
  const sig = await hmacSign(ts, secret)
  return `${ts}.${sig}`
}

// POST /api/auth  — 로그인
export async function POST(req: NextRequest) {
  const start = Date.now()

  const secret   = process.env.DASHBOARD_SECRET   ?? ''
  const password = process.env.DASHBOARD_PASSWORD ?? ''

  if (!secret || !password) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })
  }

  let body: { password?: string } = {}
  try { body = await req.json() } catch { /* 빈 바디 */ }

  const input = body.password ?? ''
  const ok    = constTimeEqual(input, password)

  if (!ok) {
    // 브루트포스 방지: 최소 2초 응답 딜레이
    const elapsed = Date.now() - start
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed))
    }
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다' }, { status: 401 })
  }

  const token = await makeToken(secret)
  const res   = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   MAX_AGE_SEC,
    path:     '/',
  })
  return res
}

// DELETE /api/auth  — 로그아웃
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   0,
    path:     '/',
  })
  return res
}
