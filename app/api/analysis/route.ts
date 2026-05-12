import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// analysis_results/ 폴더는 trading-dashboard 한 단계 위 (프로젝트 루트)
const RESULTS_DIR = join(process.cwd(), '..', 'analysis_results')

function readJSON(filename: string): unknown {
  const filepath = join(RESULTS_DIR, filename)
  if (!existsSync(filepath)) return null
  try {
    return JSON.parse(readFileSync(filepath, 'utf-8'))
  } catch {
    return null
  }
}

export async function GET() {
  const backtest  = readJSON('backtest_results.json')
  const scenario  = readJSON('scenario_results.json')
  const prediction = readJSON('prediction_results.json')

  return NextResponse.json({
    backtest,
    scenario,
    prediction,
    has_backtest:   !!backtest,
    has_scenario:   !!scenario,
    has_prediction: !!prediction,
  })
}
