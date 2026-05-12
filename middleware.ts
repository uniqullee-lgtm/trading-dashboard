import { NextRequest, NextResponse } from 'next/server'

const AUTH_COOKIE = 'dash_auth'
const MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1000  // 7일

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

// 상수 시간 문자열 비교 (timing attack 방지)
function constTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

async function verifyToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false
  const dot = token.lastIndexOf('.')
  if (dot < 1) return false
  const ts  = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!ts || !sig) return false

  const expected = await hmacSign(ts, secret)
  if (!constTimeEqual(expected, sig)) return false
  if (Date.now() - parseInt(ts, 10) > MAX_AGE_MS) return false
  return true
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 공개 경로
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const secret = process.env.DASHBOARD_SECRET ?? ''
  if (!secret) {
    return new NextResponse('서버 설정 오류: DASHBOARD_SECRET 미설정', { status: 500 })
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value
  const valid = await verifyToken(token, secret)

  if (!valid) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search   = ''
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
