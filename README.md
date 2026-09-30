# JapanTravel Suite

일본 여행 계획을 한 화면에서 만드는 웹 앱입니다. 지역·날짜·일수·테마를 고르거나 AI 채팅으로 조건을 말하면, 여행지 추천과 일자별 일정을 만들고 항공권·숙소·맛집·투어를 같이 찾아 줍니다.

**운영 주소:** https://japanjapantravel.onrender.com/ (Render 무료 플랜 — 한동안 접속이 없으면 첫 로딩이 느릴 수 있습니다)

## 화면

아래는 운영 사이트의 실제 화면입니다(2026-09-30).

### 여행 조건 + AI 조건 채팅

지역·출발일·일수·테마를 고르고 [추천+AI일정 통합 생성]을 누르거나, "유니버셜 스튜디오랑 도톤보리 꼭 가고 싶고 3박 4일" 처럼 자연어로 입력하면 조건을 자동으로 채웁니다. 상단 툴바에서 내보내기·체크리스트·긴급 연락처·회화·날씨·찜·검색 기록을 쓸 수 있고, 한국어/영어/일본어로 바꿀 수 있습니다.

![여행 조건](docs/screenshots/main.png)

### 추천 결과 — 추천 여행지 + AI 일정

추천 여행지 카드는 AI 점수와 함께 나오고, 끌어다 놓아 일정에 넣을 수 있습니다. 일정은 오전·오후·종일 블록과 아침·점심·저녁 맛집 칸으로 나뉘며, 되돌리기/다시 실행과 경로 교통비 계산을 지원합니다.

![추천 결과](docs/screenshots/plan.png)

### 탐색 — 여행지·맛집

![탐색](docs/screenshots/explore.png)

### 항공권 탐색

편도·왕복·다구간을 지원하고, 추천순·최저가순·최단시간순으로 정렬합니다. Skyscanner·KAYAK 딥링크를 제공합니다.

![항공권 탐색](docs/screenshots/flights.png)

## 주요 기능

| 기능 | 데이터 출처 | 키가 없을 때 |
|---|---|---|
| 여행지 추천 · 일정 생성 | Gemini(또는 OpenAI) | 규칙 기반 추천·일정(`local_curated_fallback`) |
| AI 조건 채팅 | Gemini(또는 OpenAI) | 규칙 기반 파싱 |
| 항공권 | Travelpayouts → Amadeus | 참고용 예시 데이터(`mock`) |
| 숙소 | Rakuten Travel(좌표 기반, 34개 도시) → Amadeus | 참고용 예시 데이터(`mock`) |
| 맛집 | Google Places(New) · 영업시간 표시 | 내장 큐레이션 |
| 지도 · 장소 사진 · 경로 | Google Maps JS · Geocoding · Directions | 지도 영역 숨김 |
| 투어 | Klook 위젯(시간 초과 시 Klook·Viator·GetYourGuide 링크) | — |
| 날씨 · 환율 | open-meteo · 환율 조회 | 환율은 `FX_*` 고정값 |
| 로그인 · 내 일정 저장 | Google · Naver · Kakao OAuth | 로그인 사용 불가 |
| 플랜 저장 | Supabase | 저장 사용 불가 |

그 밖에 일정 되돌리기/다시 실행, 계절 추천, 경로 최적화, 한/영/일 다국어, 레이트 리밋·보안 헤더·XSS 방어가 있습니다.

## 로컬 실행

요구사항: **Node.js 18 이상**(전역 `fetch` 사용). 외부 패키지가 없어서 `npm install`은 필요 없습니다.

```powershell
copy .env.example .env    # 필요한 키만 채우면 됩니다. 비워 두면 위 표의 대체 동작으로 돕니다.
node server.js            # 또는 npm start
```

브라우저에서 `http://localhost:3000`을 엽니다. 포트를 바꾸려면 `PORT` 환경 변수를 씁니다.

`server.js`는 저장소 루트의 `.env`를 직접 읽습니다. 이미 셸에 설정된 변수는 `.env`보다 우선합니다.

## 테스트

```powershell
node test_all.js
```

포트 13581에 서버를 띄워 API·보안 동작 59개를 확인합니다(2026-09-30: 59/59 통과, 키 없이 실행).

AI 연결 진단:

```powershell
curl "http://localhost:3000/api/ai-diagnostics"          # 키·모델 설정 확인
curl "http://localhost:3000/api/ai-diagnostics?probe=1"  # 외부 API 실제 호출까지 확인
```

## 환경 변수

`.env.example`에 전체 목록이 있습니다. 모두 선택 사항이며, 없으면 해당 기능만 대체 동작으로 바뀝니다.

| 구분 | 변수 |
|---|---|
| 서버 | `PORT`, `APP_ENV`, `AI_REQUEST_TIMEOUT_MS`, `CHAT_PARSE_STRICT_AI` |
| AI | `GEMINI_API_KEY`(별칭 `GOOGLE_API_KEY`), `GEMINI_API_MODEL`, `OPENAI_API_KEY`(별칭 `OPENAI_KEY`), `OPENAI_MODEL` |
| 지도 | `GOOGLE_MAPS_API_KEY` |
| 항공·숙소 | `TRAVELPAYOUTS_TOKEN`, `RAKUTEN_APP_ID`, `RAKUTEN_ACCESS_KEY`, `AMADEUS_API_KEY`, `AMADEUS_API_SECRET`, `AMADEUS_ENV` |
| 로그인 | `SESSION_SECRET`, `OAUTH_BASE_URL`, `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `NAVER_CLIENT_ID/SECRET`, `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET` |
| 저장 | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| 환율 대체값 | `FX_USD_KRW`, `FX_JPY_KRW` |

## API

| 경로 | 설명 |
|---|---|
| `POST /api/travel-plan` | 여행지 추천 + 일정 생성 통합 |
| `POST /api/destinations`, `POST /api/dest-search` | 여행지 추천·검색 |
| `POST /api/itinerary` | 일자별 일정 생성 |
| `POST /api/ai-travel-chat` | 자연어 여행 조건 파싱 |
| `POST /api/flights` | 항공권(`oneway` · `roundtrip` · `multicity`, 가격·시간대·공항·항공사 필터) |
| `POST /api/stays` | 숙소(가격·성급·평점·편의시설 필터) |
| `GET /api/foods` | 맛집 |
| `POST /api/route-cost` | 경로 교통비 |
| `GET /api/weather`, `GET /api/fx-rate`, `GET /api/cities` | 날씨·환율·도시 목록 |
| `GET /api/maps-config`, `GET /api/rakuten-config` | 클라이언트용 지도·숙소 설정 |
| `/api/auth/*` | Google·Naver·Kakao 로그인, `me`, `logout`, `providers` |
| `/api/my-plans/save · list · load · delete` | 로그인 사용자의 내 일정 |
| `/api/travel-plan/save · list · get` | Supabase 플랜 저장·조회 |
| `GET /api/health`, `GET /api/ai-diagnostics` | 상태·AI 진단 |

## 프로젝트 구조

```text
server.js            Node.js API 서버(외부 패키지 없음)
public/              프론트엔드(index.html, app.js, styles.css, manifest)
test_all.js          API·보안 통합 테스트
deploy/              배포 가이드(DEPLOY.md), Supabase 스키마
docs/screenshots/    README 화면
render.yaml          Render 배포 설정(main 푸시 시 자동 배포)
ARCHITECTURE.md      구조 설명
data/                로그인 세션·내 일정(로컬 전용, Git 제외)
```

## 배포

Render에 `render.yaml`로 배포합니다. `main`에 푸시하면 자동으로 배포됩니다(`autoDeploy: true`). 키는 Render 대시보드의 환경 변수로만 넣습니다. 자세한 내용은 [deploy/DEPLOY.md](deploy/DEPLOY.md)를 보세요.

## 보안 주의

- 실제 키는 `.env`(Git 제외)와 Render 환경 변수에만 둡니다. `.env.example`에는 빈 값만 둡니다.
- `GOOGLE_MAPS_API_KEY`는 브라우저로 전달됩니다. Google Cloud 콘솔에서 HTTP 리퍼러와 API 범위를 제한하세요.
