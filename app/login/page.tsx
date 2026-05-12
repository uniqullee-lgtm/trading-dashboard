'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password }),
      })

      if (res.ok) {
        router.replace('/')
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '로그인 실패')
      }
    } catch {
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#06060f',
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(124,106,247,0.10) 0%, transparent 60%)',
      fontFamily: 'Inter, sans-serif',
      padding: '24px',
    }}>
      <div style={{
        background: '#10102a',
        border: '1px solid #1e1e42',
        borderRadius: 20,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 380,
        boxShadow: '0 0 60px rgba(124,106,247,0.08)',
      }}>
        {/* 로고 영역 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
          <h1 style={{ color: '#e8e8f8', fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
            트레이딩 대시보드
          </h1>
          <p style={{ color: '#6b6b9a', fontSize: 13, margin: '6px 0 0' }}>
            KIS + Alpaca 자동매매 모니터링
          </p>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#6b6b9a', fontSize: 12, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              required
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#14142e',
                border: error ? '1px solid #f04f5b' : '1px solid #252550',
                borderRadius: 10,
                color: '#e8e8f8',
                fontSize: 15,
                outline: 'none',
                transition: 'border 0.2s',
                boxSizing: 'border-box',
              }}
              onFocus={e => { if (!error) e.target.style.border = '1px solid #7c6af7' }}
              onBlur={e => { if (!error) e.target.style.border = '1px solid #252550' }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(240,79,91,0.12)',
              border: '1px solid rgba(240,79,91,0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#f04f5b',
              fontSize: 13,
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%',
              padding: '13px',
              background: loading ? '#3a3a6a' : 'linear-gradient(135deg, #7c6af7, #5b8af7)',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
              opacity: loading || !password ? 0.7 : 1,
            }}
          >
            {loading ? '확인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
