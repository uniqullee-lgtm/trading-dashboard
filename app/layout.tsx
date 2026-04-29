import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '트레이딩 봇 대시보드',
  description: 'KIS + Alpaca 자동매매 실시간 모니터링',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen" style={{ background: '#0f172a' }}>
        {children}
      </body>
    </html>
  )
}
