# 트레이딩 대시보드 배포 가이드

## 1단계 — Supabase 프로젝트 생성

1. https://supabase.com → 로그인
2. **New Project** → 이름: `trading-bot`, 비밀번호 설정, Region: Northeast Asia (Seoul)
3. 프로젝트 생성 후 **SQL Editor** 탭 → `supabase_schema.sql` 내용 전체 붙여넣기 → **Run**
4. **Settings → API** 에서 복사:
   - Project URL: `https://xxxx.supabase.co`
   - anon public key: `eyJ...`

## 2단계 — 봇에 Supabase 연결

`kis_config.json` 에 추가:
```json
{
  "supabase_url": "https://YOUR_PROJECT_ID.supabase.co",
  "supabase_anon_key": "eyJ...YOUR_ANON_KEY..."
}
```

연결 테스트:
```bash
cd ~/Desktop/trading_bot
python3 supabase_logger.py
```
→ `연결 테스트: 성공` 뜨면 OK

## 3단계 — GitHub 리포지토리 생성

```bash
cd ~/Desktop/trading_bot/trading-dashboard
git init
git add .
git commit -m "feat: initial trading dashboard"
```

GitHub.com → New Repository → 이름: `trading-dashboard` → Create

```bash
git remote add origin https://github.com/YOUR_USERNAME/trading-dashboard.git
git branch -M main
git push -u origin main
```

## 4단계 — Vercel 배포

1. https://vercel.com → 로그인
2. **Add New → Project** → GitHub 리포 선택
3. **Environment Variables** 추가:
   - `NEXT_PUBLIC_SUPABASE_URL` = Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public key
4. **Deploy** 클릭

→ 완료! `https://trading-dashboard-xxx.vercel.app` 링크 생성

## 이후 업데이트

```bash
git add . && git commit -m "update" && git push
```
→ Vercel 자동 재배포
