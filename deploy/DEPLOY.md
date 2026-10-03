# Tabimaru 배포 가이드 (Render, 선택: Supabase)

- 운영 주소: https://japanjapantravel.onrender.com (Render 무료 플랜, `main` 푸시 시 자동 배포)
- 저장소: https://github.com/wsxc94/tabimaru-japan-travel-planner
- 이름 변경(JapanTravel Suite → Tabimaru)은 코드·문서의 표기만 바꿨습니다. 운영 주소와 Render 서비스(`japanjapantravel`, render.yaml 안의 이름은 `japantravel-suite`), OAuth 콜백 주소, Rakuten에 등록한 사이트 주소, 세션 쿠키 이름(`sid`), 브라우저 저장소(localStorage) 키는 그대로이므로 콘솔 설정을 다시 할 필요가 없습니다.

기본 설정(키 없음)으로도 앱 전체가 동작합니다. 장소 추천은 무료 모드(내장 큐레이션 + 위키미디어 사진), 지도는 OpenFreeMap 벡터(실패하면 OpenStreetMap 타일), 항공·숙소는 키가 없으면 "예시 데이터"로 표시됩니다.

## 1) 배포 직후 확인(체크리스트)

1. **Render 로그의 `[proxy]` 줄부터 확인합니다.** 서버는 프록시 구성을 알 수 있게 두 줄을 남깁니다(IP 자체는 남기지 않음).
   - 첫 요청: `[proxy] 첫 요청: X-Forwarded-For 항목 N개 …, TRUST_PROXY_HOPS=1.`
   - 요청 50개 뒤: `[proxy] 처음 50개 요청의 X-Forwarded-For 항목 수 분포 {1개:…건, 2개:…건}, 마지막 값이 Cloudflare 주소 …건, CF-Connecting-IP 헤더 …건, True-Client-IP 헤더 …건 (TRUST_PROXY_HOPS=1).`

   이 줄로 `TRUST_PROXY_HOPS`를 정합니다.

   | 로그에 보이는 모양 | 뜻 | 할 일 |
   |---|---|---|
   | 대부분 항목 1개 | Render가 붙인 값 하나뿐 | 없음(기본값 1) |
   | 대부분 항목 2개 이상이고, "마지막 값이 Cloudflare 주소"가 거의 전부 | Render 앞에 Cloudflare가 있음. 서버가 Cloudflare 주소면 한 칸 앞 값을 자동으로 씀 | 없음(기본값 1) |
   | 대부분 항목 N개(2 이상)로 같고, 마지막 값이 Cloudflare 주소가 아님 | Render 앞에 다른 프록시가 한 단 더 있어 모든 방문자가 그 프록시 주소 하나로 보임 → 레이트리밋(분당 60회)을 모두가 나눠 씀 | Render 환경변수 `TRUST_PROXY_HOPS=N`을 넣고 다시 배포 |
   | 항목 수가 요청마다 제각각 | 방문자가 직접 보낸 값이 섞여 있음 | 값을 올리지 말 것. 가장 흔한 개수를 기준으로 다시 판단 |
   | "0개"가 많고 나머지는 모두 같은 N개 | 0개는 Render 내부 헬스체크(`/api/health`)라 프록시를 거치지 않음. 실제 방문은 N개 | 0개는 빼고 N개 요청만으로 위 표를 다시 적용. 2026-10-01 실측: 방문 요청은 항목 3개·`CF-Connecting-IP` 있음·마지막 값은 Cloudflare 아님 → `TRUST_PROXY_HOPS=3` |

   `TRUST_PROXY_HOPS`를 필요보다 크게 잡으면 방문자가 직접 보낸 `X-Forwarded-For` 값이 기준 IP가 되어 레이트리밋을 우회할 수 있습니다. 로그로 확인한 뒤에만 바꾸세요.
2. `GET /api/health` → `app`이 `tabimaru`, `brand`가 `Tabimaru`, `providers`가 `{ "places": "free", "map": "osm" }`(무료 모드)인지 확인합니다.
3. Render 로그의 `[place-images] 195곳 로드 (사진 185곳, 좌표 192곳, en/ja 이름 195곳), 도시 사진 58곳, 음식 장르 사진 23개` 줄로 사진 데이터가, `[city-places] 도시 주변 실제 명소 …곳(…개 도시), 큐레이션 명소 사진·좌표 …곳 로드` 줄로 도시 주변 명소 데이터가 읽혔는지 확인합니다. 파일이 없으면 사진·좌표 없이(또는 큐레이션 명소만으로) 동작하고 경고가 남습니다.
4. 사이트에서 [일정 만들기]를 눌러 확인합니다(요청칸에 "오사카 3일, 유니버셜은 꼭, 도톤보리는 빼고"처럼 써 보면 채팅 해석까지 한 번에 확인됩니다).
   - 카드에 사진과 "사진: 저작자 · 라이선스" 표기가 나온다. 도시 대표 사진·음식 예시 사진에는 앞에 "도시 대표 사진" / "음식 예시 사진"이 붙는다.
   - 채팅 말풍선 아래 의도 칩(꼭 갈 곳·제외·조건)이 나오고, 일정에 꼭 갈 곳이 들어가고 제외한 곳이 없다. AI 한도가 바닥나 있으면 "AI 사용량이 잠시 몰려 기본 일정으로 만들었어요" 안내와 함께 규칙 기반 일정이 나온다(정상 동작).
   - 일정 지도가 뜨고 지명이 화면 언어로 나오며 "OpenFreeMap © OpenMapTiles Data from OpenStreetMap"이 보인다(OpenFreeMap이 실패하면 OSM 타일과 "© OpenStreetMap contributors").
   - 페이지 제목과 머리글이 "Tabimaru — AI 일본 여행 플래너"다(영어·일본어로 바꾸면 제목도 바뀜). 휴대폰 다크 모드에서는 어두운 화면이 된다.
   - 첫 화면만 열었을 때는 일정·항공·숙소 조회가 일어나지 않는 것이 정상입니다.
   - 정적 파일(html/js/css)은 `Cache-Control: no-cache` + `ETag`라서 배포 직후에도 새 화면을 받습니다(따로 캐시를 비울 필요 없음).
5. `GET /api/health`의 `sessionSecretConfigured`가 `true`, `sessionSecretWeak`가 `false`인지 봅니다. `sessionSecretConfigured: false`이거나 로그에 `[session] SESSION_SECRET이 없어…` 경고가 있으면 `SESSION_SECRET`을 넣습니다(없으면 재시작할 때마다 로그인이 풀림). `sessionSecretWeak: true`이거나 `[session] SESSION_SECRET이 너무 짧거나 단순해서 쓰지 않습니다` 경고가 있으면 넣어 둔 값이 32자 미만이거나 너무 단순해서 서버가 버린 것이니 아래 3)의 명령으로 만든 값으로 바꿉니다.
   `ALLOWED_LOGINS`를 넣었다면 `loginRestricted: true`인지도 봅니다(3) 참고. 운영은 지금 비워 둠).
   Supabase를 쓰면 같은 응답의 `supabaseConfigured: true`, `supabaseReachable: true`, `supabaseCheck: "ok"`(서버 시작 직후 한 번 실제 조회로 확인해 채움)와 `GET /api/keepalive`의 `"supabase":"ok"`도 확인합니다(5번 참고).
6. 저장소 이름을 바꾼 뒤 처음 배포할 때: Render 서비스 Settings → Build & Deploy의 Repository가 `wsxc94/tabimaru-japan-travel-planner`로 보이는지, push 뒤 자동 배포가 도는지 확인합니다. 연결이 끊겼으면 Repository를 다시 고릅니다. GitHub Actions 탭에서 CI 첫 실행이 초록색인지도 봅니다.

## 2) Render 서비스

| 항목 | 값 |
|---|---|
| Runtime | Node |
| Build Command | `npm install` (외부 패키지가 없어 사실상 아무것도 설치하지 않음) |
| Start Command | `node server.js` |
| Health Check Path | `/api/health` (외부 API를 부르지 않음) |
| Node 버전 | `package.json`의 `engines`(`>=20`) 범위에서 Render가 고른다. 고정하려면 환경변수 `NODE_VERSION`(예: `22`)을 넣는다. 배포 로그 첫 부분에서 실제 버전을 확인할 것 |

`render.yaml`은 Blueprint로 서비스를 만들 때 쓰는 설정이고, 환경변수는 이름만 적혀 있습니다(값은 대시보드에서 입력). 운영 서비스가 대시보드에서 직접 만든 서비스라면 이 파일을 고쳐도 설정이 바뀌지 않으니, 설정은 대시보드에서 바꾸세요. 서비스 이름(`japantravel-suite`)은 운영 서비스와 묶여 있어 바꾸지 않습니다.

**자동 배포와 CI:** GitHub Actions(`.github/workflows/ci.yml`)가 push·PR마다 `npm test`를 돌립니다. Render 서비스 Settings → Build & Deploy → Auto-Deploy를 **After CI Checks Pass**로 바꾸면 테스트가 깨진 커밋은 배포되지 않습니다.

## 3) 환경 변수

필수 값은 없습니다. 운영에서는 아래 "권장"을 넣으세요. 전체 설명은 README의 "환경 변수" 표에 있습니다.

2026-10-01 화면·의도 개편(주 버튼 하나, 채팅 후속 대화, AI 일정 후처리, 직접 배치, 초안 보관, 다크 모드)은 **새 환경변수가 없습니다.** Render 설정을 바꾸지 않고 배포하면 됩니다.

2026-10-01 로그인·내 일정 영구 저장(서명 쿠키 30일, 고정 사용자 id, "내 일정" → Supabase, `/api/keepalive`)도 새 **필수** 변수는 없습니다. 다만 효과를 보려면 `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 Render에 들어 있어야 합니다(5번). 예전 형식 로그인 쿠키는 배포 뒤 한 번 로그아웃 상태가 되므로 다시 로그인하면 됩니다. `TABIMARU_DATA_DIR`은 로컬용이라 Render에서는 비워 둡니다.

**이번 배포 전에 할 일(권장):**

1. **`SESSION_SECRET`을 새 무작위 값으로 바꿉니다.** 이제는 이 값 하나로 누구의 로그인 쿠키든 만들 수 있으므로(서버에 세션 기록이 없음) 추측할 수 없어야 합니다. 서버는 32자 미만이거나 서로 다른 글자가 10개 미만인 값은 쓰지 않습니다. 어차피 이번 배포로 예전 쿠키가 한 번 로그아웃되므로 지금 바꾸면 추가로 잃는 것이 없습니다.
   만들기: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` → 나온 43자를 Render의 `SESSION_SECRET`에 붙여 넣습니다.
2. (선택, 운영은 사용자 결정으로 지금 비워 둠) **`ALLOWED_LOGINS`에 자기 계정만 넣을 수 있습니다**(혼자 쓰는 앱). 비워 두면 아무 Google·Kakao·Naver 계정이나 로그인해 Supabase에 일정을 저장할 수 있습니다(사용자당 50개·하나 400KB 상한은 있지만, 계정을 여러 개 만들면 무료 500MB를 채울 수 있음).
   - 가장 쉬운 방법: Google 계정 이메일을 넣습니다(예: `ALLOWED_LOGINS=me@gmail.com`). Google이 확인한 이메일일 때만 통과합니다. Kakao는 카카오가 확인한 이메일만, Naver 이메일은 보지 않습니다.
   - 또는 한 번 로그인한 뒤 `https://japanjapantravel.onrender.com/api/auth/me`에 보이는 `userId`(`u_`로 시작)를 넣습니다. 여러 개는 쉼표로 구분합니다(`u_…,me@gmail.com`).
   - 목록 밖 계정은 로그인 화면으로 돌아가며 "이 앱은 허용된 계정만 로그인할 수 있어요." 안내가 뜹니다. 목록을 바꾸면 모든 기기가 한 번 로그아웃됩니다.

**Gemini 무료 한도는 프로젝트 단위로 함께 씁니다**(같은 Google 프로젝트라면 키를 여러 개 만들어도 한도는 같음). 로컬 `.env`와 Render가 같은 프로젝트의 `GEMINI_API_KEY`를 쓴다면, 로컬에서 시험하거나 `node scripts/prompt-matrix.mjs`(16건 = Gemini 약 32회)를 돌린 만큼 운영의 하루·분당 한도도 줄어듭니다. 한도가 바닥나면 운영 화면은 규칙 기반 일정 + `AI_BUSY` 안내로 바뀝니다(서버는 429·503을 받은 모델을 60초부터 최대 5분까지 쉬게 하고 다음 모델을 씁니다). 시험용 키를 따로 쓰거나, 시험은 몇 건만(`--only`) 돌리세요.

**Gemini 모델 체인(2026-10-01).** 무료 한도는 모델마다 하루 20회라, 서버는 1순위 모델(`GEMINI_API_MODEL`, 운영은 `gemini-2.5-flash-lite` 권장) 다음에 대체 모델을 차례로 씁니다. 기본 순서(실측): `gemini-2.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-3-flash-preview` → `gemini-3.5-flash-lite` → `gemini-2.5-flash` → `gemini-3.6-flash` → `gemini-flash-latest`(1순위와 같은 이름은 빠짐). **새 필수 변수는 없습니다** — Render 설정을 바꾸지 않아도 이 순서가 적용됩니다.
- 순서를 바꾸려면 `GEMINI_FALLBACK_MODELS`에 쉼표로 적습니다(예: `gemini-3.1-flash-lite,gemini-2.5-flash`). `none`이면 1순위 모델만 씁니다. 형식이 틀린 이름(대문자·공백 등)은 빼고 로그에 개수만 남깁니다.
- 모델을 쉬게 하는 기준: 분당 한도(429)·과부하(503)·5xx·시간 초과는 60초(연속이면 두 배, 최대 5분), 하루 한도(429 `PerDay`)는 태평양 시간 자정까지(최대 6시간), 종료된 모델(404 `no longer available`)은 하루. 키 문제 400(`API_KEY_INVALID`)·401·403은 모델을 바꿔도 같아서 바로 규칙 기반으로 갑니다.
- 기다리는 시간: 한 번 생성(채팅 해석·일정 하나)에 체인 전체가 `GEMINI_TOTAL_BUDGET_MS`(기본 40초)까지만 씁니다. 다 쓰면 남은 모델은 시도하지 않고 규칙 기반 + `AI_BUSY` 안내로 바뀝니다.
- 확인: `https://japanjapantravel.onrender.com/api/health`의 `ai.geminiModelChain`(실제 순서), `ai.geminiCoolingModels`(지금 쉬는 모델 이름과 남은 초). 어느 모델이 일정을 만들었는지는 `/api/travel-plan` 응답의 `itinerarySource`(예: `gemini_itinerary_v1 (gemini-3.5-flash-lite)`)에 남습니다.
- 넣지 않은 모델: `gemini-3.5-flash`(10초 뒤 503), `gemini-3.7-flash`(계속 503), `gemma-4`(같은 말을 반복하다 잘림), `gemini-flash-lite-latest`(`gemini-3.5-flash-lite`의 별칭이라 한도를 같이 씀).

| 구분 | 변수 | 비고 |
|---|---|---|
| 권장 | `SESSION_SECRET` | 32자 이상 무작위 값(만들기: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). 로그인 쿠키 서명용. 32자 미만이거나 서로 다른 글자가 10개 미만이면 서버가 쓰지 않음(health `sessionSecretWeak: true`). 없거나 약하면 재시작 때마다 로그인이 풀림. 바꾸면 모든 기기가 로그아웃되지만 저장한 일정은 그대로 |
| 선택 | `ALLOWED_LOGINS` | 로그인할 수 있는 계정(쉼표 구분): Google·Kakao가 확인한 이메일, `u_…`(`/api/auth/me`의 `userId`), `google:<id>` 등. 비우면 누구나 로그인. 운영은 사용자 결정으로 꼭 필요할 때만 설정(지금은 비워 둠). 위 "이번 배포 전에 할 일" 2번 |
| 권장 | `PUBLIC_BASE_URL` | `https://japanjapantravel.onrender.com` (CSRF 허용 출처) |
| 로그인 | `OAUTH_BASE_URL` | 운영 주소와 같은 값. OAuth 콜백 기준 |
| 로그인 | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET` | 없는 공급자의 로그인 버튼은 숨겨지고, 그 주소(`/api/auth/<공급자>`)로 직접 들어오면 `/?authError=<공급자>`로 돌려보냄 |
| AI | `GEMINI_API_KEY`, `GEMINI_API_MODEL`, `GEMINI_FALLBACK_MODELS`, `GEMINI_TOTAL_BUDGET_MS`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_REQUEST_TIMEOUT_MS`, `CHAT_PARSE_STRICT_AI` | 없으면 규칙 기반 일정·채팅 해석(`AI_KEY_MISSING`). 대체 모델 순서·시간 예산은 아래 "Gemini 모델 체인" 문단. 무료 한도 공유 주의는 위 문단 |
| AI(Groq) | `GROQ_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_FALLBACK_MODELS`, `OPENAI_MAX_OUTPUT_TOKENS`, `OPENAI_REASONING_EFFORT`, `AI_CHAT_PROVIDER_ORDER` | 운영 값은 README "Groq 무료 연결". Groq 키는 `OPENAI_API_KEY`가 아니라 `GROQ_API_KEY`에 넣는다(Groq 주소에만 보냄). 확인: health `ai.openaiKeySource`·`ai.openaiModelChain`·`ai.chatProviderOrder` |
| 맛집 | `HOTPEPPER_API_KEY` | ホットペッパー グルメサーチAPI(무료, 메일로 신청). 없으면 내장 맛집 목록. 확인: health `hotpepperConfigured` |
| 항공 | `TRAVELPAYOUTS_TOKEN` | 없으면 예시 데이터 |
| 숙소 | `RAKUTEN_APP_ID`, `RAKUTEN_ACCESS_KEY` | 없으면 예시 데이터 |
| 환율 | `FX_USD_KRW`, `FX_JPY_KRW` | 실시간 조회가 모두 실패할 때만 쓰는 고정값 |
| 장소·지도 | `PLACES_PROVIDER`, `MAP_PROVIDER`, `GOOGLE_MAPS_SERVER_KEY`, `GOOGLE_MAPS_BROWSER_KEY` | 비워 두면 무료 모드. 아래 4)에서 Google을 켤 때만 설정 |
| Google 상한 | `GOOGLE_DAILY_CALL_LIMIT`(기본 30), `GOOGLE_MONTHLY_CALL_LIMIT`(기본 900), `GOOGLE_PHOTO_DAILY_LIMIT`(기본 30), `GOOGLE_PHOTO_MONTHLY_LIMIT`(기본 900) | google 모드에서만 의미가 있음. UTC 기준, 서버 메모리라 재시작하면 0부터 다시 셈 |
| 진단 | `DIAGNOSTICS_TOKEN` | `/api/ai-diagnostics?probe=1` 실행용. 없으면 probe는 403 |
| 프록시 | `TRUST_PROXY`, `TRUST_PROXY_HOPS` | Render에서는 `RENDER` 변수가 있어 자동으로 프록시를 믿음. `TRUST_PROXY_HOPS`는 1) 체크리스트 1번을 보고 정함 |
| 저장소 | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 권장("내 일정"이 재시작·재배포에도 남음). 5) 참고 |
| 로컬 폴더 | `TABIMARU_DATA_DIR` | Render에서는 비워 둠(무료 플랜 디스크는 재시작 때 지워짐). 로컬에서 파일 저장 폴더를 바꿀 때만 |
| 예전 | `GOOGLE_MAPS_API_KEY` | 예전 단일 키. 무료 모드에서는 쓰이지 않고, 브라우저로도 보내지 않음. 이미 공개된 적이 있으니 폐기 후 삭제 권장 |

더 이상 쓰지 않는 변수(지워도 됨): `AMADEUS_API_KEY`, `AMADEUS_API_SECRET`, `AMADEUS_ENV`, `APP_ENV`.

## 4) Google 다시 켜기(선택, 요금 발생 가능)

1. 예전 `GOOGLE_MAPS_API_KEY`는 공개된 적이 있으므로 Google Cloud 콘솔에서 삭제하고 새 키를 만든다.
2. 결제: 프로젝트에 결제 계정을 연결하고, 결제 → 예산 및 알림에서 월 예산 알림을 만든다(알림일 뿐 사용을 막지는 않음).
3. API 사용 설정: Places API (New), Geocoding API, Directions API. 지도도 Google로 바꾸려면 Maps JavaScript API.
4. **콘솔 할당량 상한**: API 및 서비스 → 각 API → 할당량에서 하루 요청 상한을 낮게 둔다(Places API (New)의 Text Search·Place Photos, Geocoding, Directions, Maps JavaScript API). 서버 상한 카운터는 메모리에 있어 재시작하면 0부터 다시 세므로, 요금을 확실히 막는 것은 이 콘솔 할당량이다.
5. **SKU별 월 무료 사용량 확인**: 이 앱의 Text Search는 필드 마스크에 `rating`·`userRatingCount`·`priceLevel`·`currentOpeningHours`가 있어 Text Search Enterprise(월 무료 1,000건)로 계산되고, 카드 사진은 Place Details Photos(월 무료 1,000건)다. Geocoding·Directions·Dynamic Maps는 각 월 10,000건이다(2026-10-01 가격표 기준, 켜기 전에 [가격표](https://developers.google.com/maps/billing-and-pricing/pricing)에서 다시 확인). 서버 기본 월 상한 900회(검색·사진 각각)는 1,000건보다 낮게 잡은 값이다.
6. 키 두 개:
   - `GOOGLE_MAPS_SERVER_KEY` — API 제한: Places API (New), Geocoding API, Directions API. 애플리케이션 제한: 없음 또는 IP(Render 대시보드의 Outbound IP). **HTTP 리퍼러 제한 금지**(서버 호출에는 리퍼러가 없어 모두 거부됨).
   - `GOOGLE_MAPS_BROWSER_KEY` — 애플리케이션 제한: HTTP 리퍼러 `https://japanjapantravel.onrender.com/*`(개발용 `http://localhost:3000/*`). API 제한: Maps JavaScript API(브라우저에서 좌표 없는 장소를 찾게 하려면 Geocoding API 추가).
7. Render 환경변수: `PLACES_PROVIDER=google`, `GOOGLE_MAPS_SERVER_KEY=<서버 키>`, `DIAGNOSTICS_TOKEN=<긴 무작위 값>`. 상한을 바꾸려면 `GOOGLE_DAILY_CALL_LIMIT`, `GOOGLE_MONTHLY_CALL_LIMIT`, `GOOGLE_PHOTO_DAILY_LIMIT`, `GOOGLE_PHOTO_MONTHLY_LIMIT`. 지도까지 바꾸려면 `MAP_PROVIDER=google`, `GOOGLE_MAPS_BROWSER_KEY=<브라우저 키>`.
8. 확인: `GET /api/health`의 `providers.places`가 `google`, `GET /api/ai-diagnostics`의 `google.serverKeyConfigured: true`, `circuitOpen: false`, 호출 수(`callsToday`, `callsThisMonth`, `photoCallsToday`, `photoCallsThisMonth`). 실제 호출 확인은
   `curl -H "x-diagnostics-token: <토큰>" "https://japanjapantravel.onrender.com/api/ai-diagnostics?probe=1"` (Places 1회, 필드 마스크 `places.id`).
   `probe.places.reasonCode`가 `GOOGLE_BILLING_DISABLED`면 결제, `GOOGLE_PERMISSION_DENIED`면 키 제한·API 사용 설정, `GOOGLE_QUOTA_EXCEEDED`면 할당량을 다시 확인한다.
9. 문제가 생기면 `PLACES_PROVIDER`·`MAP_PROVIDER`를 지우거나 `free`·`osm`으로 바꾸면 곧바로 무료 모드로 돌아간다.

서버 보호 장치(google 모드): 결제 꺼짐·권한 거부·할당량 초과를 받으면 30분 동안 모든 Google 호출을 건너뜀, 하루·월 호출 상한(UTC 기준, 검색과 사진을 따로 셈), 결과 캐시 12시간, 사진 캐시(메모리 최대 200장·30MB·24시간). 결과 캐시가 Google Maps Platform 약관의 캐시 제한과 맞는지는 켜기 전에 확인하세요.

## 5) Supabase("내 일정" 저장소, 권장)

Render 무료 플랜은 재시작·재배포 때 서버 디스크와 메모리를 지웁니다. 그래서 운영에서는 "내 일정"(`/api/my-plans/save · list · load · delete`)을 Supabase의 `travel_plans` 표에 둡니다(`source = 'my-plans'` 행, `user_label` = 로그인 사용자 id로 자기 일정만). 로그인은 서버에 저장하지 않는 서명 쿠키라 Supabase와 관계없이 재시작 뒤에도 유지되고, 사용자 id는 OAuth 계정(공급자 + 공급자 id)에서 늘 같은 값으로 만들어져 다시 로그인해도 같은 일정이 보입니다.

- `SUPABASE_*`를 비워 두면 "내 일정"은 서버의 로컬 파일(`data/saved_plans.json`, 로컬 개발용)에 저장되고, Render에서는 재시작 때 사라집니다.
- 설정했는데 Supabase에 닿지 않으면(일시 중지·장애·키 오류·표 없음) 저장·목록·불러오기·삭제가 503 `PROVIDER_UNAVAILABLE`이 되고 화면은 "저장소에 연결할 수 없어요. 잠시 후 다시 시도해 주세요."라고 알립니다. 이때 로컬 파일에 몰래 쓰지 않습니다.
- 저장소가 연결은 되는데 일정 내용을 거절하면(4xx) 400 `INVALID_PLAN`, 화면은 "저장할 수 없는 글자가 들어 있어요…"입니다(NUL·짝 없는 서로게이트는 서버가 미리 정리하므로 보통은 생기지 않음).
- 상한: 사용자당 50개(넘으면 409 `PLAN_LIMIT`, 같은 일정 덮어쓰기는 허용), 일정 하나 400KB(넘으면 413 `PLAN_TOO_LARGE`). 목록은 50개를 모두 보여 주므로 저장한 일정은 모두 화면에서 지울 수 있습니다.
- `/api/travel-plan/save · list · get`(화면에서는 쓰지 않음)도 같은 표와 같은 상한을 씁니다.

**처음 설정 / 일시 중지된 프로젝트 살리기**

1. 무료 프로젝트는 7일 동안 활동이 없으면 일시 중지(Paused)됩니다. Supabase 대시보드에서 프로젝트를 열고 **Restore project**(Resume)를 누른 뒤, 상태가 초록색(Healthy)이 될 때까지 몇 분 기다립니다. 일시 중지된 지 오래돼 복구할 수 없으면 새 프로젝트를 만듭니다(주소와 키가 바뀌므로 3번을 다시 함).
2. SQL Editor에서 `deploy/supabase/schema.sql` 전체를 실행합니다(여러 번 실행해도 됨: 표·트리거·RLS·권한을 있으면 건너뛰거나 다시 맞춤). 테이블 이름(`travel_plans`)은 이름 변경과 관계없이 그대로입니다. 이미 실행한 프로젝트면 다시 할 필요는 없지만, 해도 데이터는 지워지지 않습니다.
3. Render 환경변수:
   - `SUPABASE_URL` = Project Settings → Data API(또는 API)의 Project URL(`https://<프로젝트>.supabase.co`).
   - `SUPABASE_SERVICE_ROLE_KEY` = Project Settings → API Keys의 **secret 키**(`sb_secret_…`, 새 형식). 변수 이름은 예전 그대로지만 새 secret 키를 넣으면 됩니다. 서버는 새 형식 키를 `apikey` 헤더로만 보내고, 예전 JWT 형식 service_role 키(`eyJ…`)일 때만 `Authorization: Bearer`도 붙입니다. **publishable 키(`sb_publishable_…`)나 anon 키는 넣지 마세요**(RLS 때문에 저장이 거부됨). 이 키는 서버에서만 쓰고 브라우저·로그·응답에 나가지 않습니다.
   - `SESSION_SECRET`도 꼭 넣습니다(32자 이상 무작위 값, 없으면 재시작 때마다 로그인이 풀림).
4. 배포 후 확인: `GET /api/health`에서 `supabaseConfigured: true`, `supabaseReachable: true`, `supabaseCheck: "ok"`(서버가 뜬 직후 한 번, 그 뒤 10분마다 `travel_plans`를 실제로 한 번 조회해 주소·키·표를 함께 확인), `sessionSecretConfigured: true`. 이어서 `GET /api/keepalive`가 `{"ok":true,"supabase":"ok",…}`인지 봅니다. 아니면 값으로 원인을 압니다(Render 로그의 `[supabase]` 줄에도 같은 안내, 키·주소는 가림):

   | `supabaseCheck` / keepalive `supabase` | 뜻 | 할 일 |
   |---|---|---|
   | `auth_error` | 키가 거부됨(401·403): 틀린 키, 폐기·교체된 키, publishable/anon 키 | `SUPABASE_SERVICE_ROLE_KEY`에 지금 쓰는 secret 키(`sb_secret_…`)를 다시 넣음 |
   | `schema_error` | `travel_plans` 표가 없음(404·`PGRST205`) | 2번(`schema.sql`)을 실행 |
   | `unreachable` | 연결 실패·시간 초과·5xx | 프로젝트가 일시 중지됐거나 장애. 1번(Restore)부터 |
5. 화면에서 로그인 → 일정 [💾 저장] → "📂 내 일정"에 보이는지, Supabase Table Editor의 `travel_plans`에 `plan_key`가 `my_`로 시작하는 행이 생겼는지 봅니다.

**일시 중지 막기(keepalive)**

- `.github/workflows/keepalive.yml`이 3일마다(매월 1·4·7…일 03:17 UTC) 운영 `https://japanjapantravel.onrender.com/api/keepalive`를 부릅니다. 서버는 그때 Supabase에 가벼운 조회(`travel_plans`의 `id` 1개)를 실제로 한 번 해서 프로젝트가 활동 중으로 남게 합니다. 성공하면 결과를 10분 동안, 실패하면 15초 동안만 재사용합니다. 그래서 누가 자주 불러도 Supabase 조회는 성공 중 10분에 한 번, 실패 중 분당 4번 이하이고, 일시 장애가 지나가면 워크플로의 다음 재시도(30초 뒤)가 실제로 다시 확인합니다. 응답에는 `ok`·`supabase`·`checkedAt`만 있습니다(비밀값·행 데이터 없음).
- 워크플로는 비밀값이 필요 없고 권한도 없습니다(`permissions: {}`). Render가 잠들어 있으면 깨어나는 데 50초쯤 걸리므로 90초 제한으로 30초 간격 5번까지 다시 시도하고, 응답이 `"supabase":"ok"`일 때만 성공합니다. 실패하면 GitHub가 저장소 주인에게 메일로 알립니다.
- 바로 확인하려면 GitHub → **Actions** 탭 → **Supabase keepalive** → **Run workflow**.
- **주의: 공개 저장소의 예약 실행(schedule)은 저장소에 60일 동안 활동(커밋 등)이 없으면 GitHub가 자동으로 끕니다.** 꺼지면 GitHub가 메일로 알리고, Actions 탭의 이 워크플로 화면에 "This scheduled workflow is disabled…" 안내와 **Enable workflow** 버튼이 생깁니다. 눌러서 다시 켜고 Run workflow로 한 번 돌려 두세요. 오래 손대지 않을 때는 그 전에 커밋을 하나 올려 두어도 됩니다.
- Render 로그나 대시보드로도 일시 중지 여부를 알 수 있습니다: `/api/health`의 `supabaseReachable: false`, 화면의 "저장소에 연결할 수 없어요" 안내가 보이면 1번부터 다시 합니다.

## 6) OAuth 콜백 등록

각 공급자 콘솔에 아래 리디렉션 URI를 등록합니다(`OAUTH_BASE_URL`과 같은 주소). 이름 변경 뒤에도 바뀌지 않습니다.

- Google: `https://japanjapantravel.onrender.com/api/auth/google/callback`
- Naver: `https://japanjapantravel.onrender.com/api/auth/naver/callback`
- Kakao: `https://japanjapantravel.onrender.com/api/auth/kakao/callback`

공급자 콘솔에 표시되는 앱 이름은 서비스 이름을 바꾸고 싶을 때만 각 콘솔에서 Tabimaru로 바꾸면 됩니다(코드와 관계없음).

## 7) 주의

- 로그인 세션은 서버에 저장하지 않는 서명 쿠키(`sid`, 30일)라 Render가 재시작해도 같은 `SESSION_SECRET`이면 유지됩니다. "내 일정"은 Supabase를 설정하면 Supabase에 남고, 설정하지 않으면 서버 디스크의 `data/saved_plans.json`이라 Render 무료 플랜에서는 재시작·재배포 때 사라집니다. 로그인 기록 `data/users.json`은 로컬 참고용일 뿐이라 지워져도 상관없습니다(사용자 id는 OAuth 계정에서 다시 계산).
- 로그아웃은 그 브라우저의 쿠키만 지웁니다(서버에 세션 기록이 없어, 로그아웃 전에 복사된 쿠키는 만료(30일)까지 쓸 수 있음). 쿠키가 새어 나갔다고 생각되거나 모든 기기를 한꺼번에 로그아웃시키려면 `SESSION_SECRET`을 바꿉니다(저장한 일정은 그대로). `ALLOWED_LOGINS`를 바꿔도 모든 기기가 로그아웃됩니다.
- Rakuten Travel 요청의 Referer/Origin 헤더는 운영 도메인으로 고정되어 있습니다. Rakuten 앱에 등록한 사이트 주소와 같아야 합니다.
- Rakuten accessKey는 예전 `/api/rakuten-config`로 공개된 적이 있으니 새로 발급해 `RAKUTEN_ACCESS_KEY`를 교체하세요.
- 날씨(Open-Meteo)와 환율(ExchangeRate-API) 출처는 화면에 표기합니다(날씨 위젯·패널 하단, 환율 칩). Open-Meteo 무료 API는 비상업적 사용 조건이라, 제휴 수익이 생기면 유료 요금제 여부를 다시 판단해야 합니다(README "데이터 출처와 저작자 표시").
- 키는 Render 환경변수에만 넣고, 저장소나 프런트 코드에 넣지 않습니다.
