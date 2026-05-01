#!/bin/zsh
cd "$(dirname "$0")"

# PAT를 ~/.trading_pat 파일에서 읽거나 없으면 에러
PAT_FILE="$HOME/Desktop/.trading_pat"
if [ ! -f "$PAT_FILE" ]; then
  echo "❌ PAT 파일 없음. 다음 명령으로 생성:"
  echo "   echo 'ghp_YOUR_PAT' > ~/Desktop/.trading_pat && chmod 600 ~/Desktop/.trading_pat"
  exit 1
fi
PAT=$(cat "$PAT_FILE")

# 락 파일 정리
rm -f .git/HEAD.lock .git/index.lock 2>/dev/null

echo "🚀 GitHub 푸시 → Vercel 자동 배포 시작..."
git remote set-url origin "https://uniqullee-lgtm:${PAT}@github.com/uniqullee-lgtm/trading-dashboard.git"
git add -A
git diff --cached --quiet || git commit -m "feat: 대시보드 고도화 $(date '+%Y-%m-%d %H:%M')"
git push -u origin main
STATUS=$?
git remote set-url origin https://github.com/uniqullee-lgtm/trading-dashboard.git
if [ $STATUS -eq 0 ]; then
  echo "✅ Push 완료 — Vercel 배포 1~2분 내 반영"
  echo "   https://trading-dashboard-lilac-rho.vercel.app/"
else
  echo "❌ Push 실패 (네트워크 확인)"
fi
read "?엔터로 닫기..."
