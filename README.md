# JapanTravel Suite Prototype

트리플/Skyscanner/KAYAK/Tabelog 스타일 UX를 참고한 웹+모바일 반응형 프로토타입입니다.

## 핵심 기능
- 여행지 추천: `/api/destinations`
  - 도시 + 테마 기반 AI 점수 추천
  - 일본 공항 보유 지역(대도시+소도시) 대량 지원
- 일정 생성: `/api/itinerary`
  - 추천 여행지를 기반으로 일자별 플랜 자동 생성
  - 소도시(예: 다카마쓰, 가고시마 등)도 동일하게 일정 생성 지원
- 통합 생성: `/api/travel-plan`
  - 추천 여행지 + AI 일정을 한 번에 생성
- 항공권 탐색: `/api/flights`
  - KAYAK/Skyscanner 스타일 결과 + 딥링크
  - 여행 타입: `oneway`, `roundtrip`, `multicity`
  - 다구간은 UI에서 `구간 추가/삭제`로 동적 입력
  - 선호도(`balanced`, `cheap`, `fast`) 기반 랭킹
  - 필터: 가격 범위, 출발 시간대 범위, 공항, 항공사
  - UI 탭: 편도/왕복/다구간 + 공항/항공사 체크박스
  - 공항 자동완성: 한국/일본 공항 코드+이름 유사문자열 추천
- 맛집 탐색: `/api/foods`
  - Tabelog 스타일 큐레이션 + 지도/Tabelog 링크
  - `GOOGLE_MAPS_API_KEY` 설정 시 Google Places 결과 확장

## 실행
```powershell
cd "C:\Users\wx94\OneDrive\바탕 화면\이거"
node server.js
```

브라우저: `http://localhost:3000`

포트 충돌 시:
```powershell
$env:PORT="3011"
node server.js
```
브라우저: `http://localhost:3011`

## 환경 변수
```powershell
$env:GOOGLE_MAPS_API_KEY="YOUR_KEY"
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

## 현재 상태
- 실제 플랫폼의 비공개/제휴 API는 키/계약 이슈로 기본 미연동
- 대신 플랫폼형 응답 구조와 딥링크/확장 포인트를 구현해 즉시 데모 가능
- UI는 각 입력 항목 라벨/필터 설명을 포함한 사용자 친화형 레이아웃으로 구성
- 현재 일본 도시 데이터: 62개 지역(공항 코드 포함)

## 저장 API (Supabase)
- `GET /api/health`
  - Supabase 연결 설정 여부 확인 (`supabaseConfigured`)
- `POST /api/travel-plan/save`
  - 통합 추천+AI 일정 결과를 DB에 upsert 저장
- `GET /api/travel-plan/list?limit=20&userLabel=guest`
  - 저장된 일정 목록 조회
- `GET /api/travel-plan/get?planKey=...`
  - 단건 일정 상세 조회

상세 배포 순서: `deploy/DEPLOY.md`
