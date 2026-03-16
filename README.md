# JapanTravel Suite Prototype

일본 여행 계획을 한 번에 생성하는 웹 프로토타입입니다.
여행지 추천, 일정 생성, 항공권/숙소/맛집 탐색, 저장 기능까지 포함합니다.

## 최근 반영 내용 요약
- **숙소**: Rakuten Travel API 좌표 기반 검색 전환 (34개 도시), Origin 헤더 추가로 403 해결
- **투어**: Klook 위젯 타임아웃 폴백 (Klook/Viator/GetYourGuide 링크)
- **항공권**: Travelpayouts 실시간 API → Amadeus 폴백 → Mock 3단계
- Google OAuth 소셜 로그인 + 일정 저장/불러오기
- AI 서킷 브레이커 + 보안 강화 (레이트 리밋, XSS/CSRF 방지)
- 일정 Undo/Redo + 계절 추천 + 경로 최적화

## 현재 기능
- 통합 여행 플랜 생성: `POST /api/travel-plan`
  - 여행지 추천 + 일정 생성 + (선택) 항공권/숙소 반영
- 여행지 추천: `POST /api/destinations`
  - 도시/테마/예산/인원 기반 추천
- 일정 생성: `POST /api/itinerary`
  - 일자별 일정 자동 생성
- 항공권 탐색: `POST /api/flights`
  - 타입: `oneway`, `roundtrip`, `multicity`
  - 필터: 가격/시간대/공항/항공사
  - 선호도: `balanced`, `cheap`, `fast`
  - 딥링크: Skyscanner, KAYAK
- 숙소 탐색: `POST /api/stays`
  - 데이터: Rakuten Travel 실시간 (좌표 기반) → Amadeus 폴백 → Mock
  - 가격/성급/평점/편의시설 기반 필터
- 맛집 탐색: `GET /api/foods`
  - 도시/장르/예산 기반 큐레이션
  - Google Maps/Tabelog 링크 제공

## 저장 기능 (Supabase)
- `GET /api/health`: Supabase 설정 상태 확인
- `GET /api/ai-diagnostics`: AI 키/모델 설정 진단 (`?probe=1`이면 외부 API 연결까지 실제 점검)
- `POST /api/travel-plan/save`: 여행 플랜 저장(upsert)
- `GET /api/travel-plan/list?limit=20&userLabel=guest`: 저장 목록 조회
- `GET /api/travel-plan/get?planKey=...`: 저장 상세 조회

## 프로젝트 구조
```text
project-root/
  public/            # 프론트엔드 정적 파일
  deploy/            # 배포 가이드/설정
  server.js          # Node.js API 서버
  .env.example       # 환경 변수 예시
  render.yaml        # Render 배포 설정
```

## 실행 방법
1. 예시 경로로 이동
```powershell
cd "C:\path\to\project"
```
2. 서버 실행
```powershell
node server.js
```
3. 브라우저 접속: `http://localhost:3000`

포트 변경 예시:
```powershell
$env:PORT="3011"
node server.js
```
접속 주소: `http://localhost:3011`

## 서비스 URL
- 운영 주소: `https://japanjapantravel.onrender.com/`

## 환경 변수
`.env.example`를 참고해 `.env`를 생성해서 사용하세요.

```env
PORT=3000
GOOGLE_MAPS_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
APP_ENV=
AI_REQUEST_TIMEOUT_MS=
CHAT_PARSE_STRICT_AI=
GEMINI_API_KEY=
GEMINI_API_MODEL=
OPENAI_API_KEY=
OPENAI_MODEL=
TRAVELPAYOUTS_TOKEN=
RAKUTEN_APP_ID=
RAKUTEN_ACCESS_KEY=
AMADEUS_API_KEY=
AMADEUS_API_SECRET=
AMADEUS_ENV=test
```

AI 연결 체크 예시:
```powershell
curl "http://localhost:3000/api/ai-diagnostics"
curl "http://localhost:3000/api/ai-diagnostics?probe=1"
```

## 보안/공개 주의사항
- 실제 API 키/토큰/개인 경로/개인 식별 정보는 커밋하지 마세요.
- `.env`는 Git에 포함하지 않고, `.env.example`만 공유하세요.

## 배포
- 배포 상세: `deploy/DEPLOY.md`
