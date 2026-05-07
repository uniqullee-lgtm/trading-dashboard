import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'

const BOT_DIR = join(process.cwd(), '..')

// analytics_engine.py 위치
const ENGINE_PATH = join(BOT_DIR, 'analytics_engine.py')

function runPython(symbols: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const args = ['analytics_engine.py', '--save-json', '--symbols', ...symbols]
    const proc = spawn('python3', args, {
      cwd:  BOT_DIR,
      env:  { ...process.env },
    })

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code: number | null) => resolve({ stdout, stderr, code: code ?? 1 }))
    proc.on('error', (err: Error) => resolve({ stdout: '', stderr: err.message, code: 1 }))
  })
}

export async function POST(request: Request) {
  if (!existsSync(ENGINE_PATH)) {
    return NextResponse.json(
      { error: `analytics_engine.py not found at ${ENGINE_PATH}` },
      { status: 503 }
    )
  }

  let symbols: string[] = ['AMZN', 'NVDA', 'AAPL', 'MSFT', 'TSLA']
  try {
    const body = await request.json()
    if (Array.isArray(body?.symbols) && body.symbols.length > 0) {
      symbols = body.symbols.map((s: unknown) => String(s).toUpperCase()).slice(0, 8)
    }
  } catch { /* body 없으면 기본값 사용 */ }

  const { stdout, stderr, code } = await runPython(symbols)

  if (code !== 0) {
    return NextResponse.json(
      { error: 'Python 실행 실패', stderr: stderr.slice(-1000), stdout: stdout.slice(-500) },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok:      true,
    symbols,
    message: 'analysis_results/*.json 저장 완료. /api/analysis 를 다시 조회하세요.',
    log:     stdout.slice(-800),
  })
}
