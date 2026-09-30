# Tabimaru 배포 가이드 (Render, 선택: Supabase)

- 운영 주소: https://japanjapantravel.onrender.com (Render 무료 플랜, `main` 푸시 시 자동 배포)
- 저장소: https://github.com/wsxc94/tabimaru-japan-travel-planner
- 이름 변경(JapanTravel Suite → Tabimaru)은 코드·문서의 표기만 바꿨습니다. 운영 주소와 Render 서비스(`japanjapantravel`, render.yaml 안의 이름은 `japantravel-suite`), OAuth 콜백 주소, Rakuten에 등록한 사이트 주소, 세션 쿠키 이름(`sid`), 브라우저 저장소(localStorage) 키는 그대로이므로 콘솔 설정을 다시 할 필요가 없습니다.

기본 설정(키 없음)으로도 앱 전체가 동작합니다. 장소 추천은 무료 모드(내장 큐레이션 + 위키미디어 사진), 지도는 OpenStreetMap, 항공·숙소는 키가 없으면 "예시 데이터"로 표시됩니다.

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

   `TRUST_PROXY_HOPS`를 필요보다 크게 잡으면 방문자가 직접 보낸 `X-Forwarded-For` 값이 기준 IP가 되어 레이트리밋을 우회할 수 있습니다. 로그로 확인한 뒤에만 바꾸세요.
2. `GET /api/health` → `app`이 `tabimaru`, `brand`가 `Tabimaru`, `providers`가 `{ "places": "free", "map": "osm" }`(무료 모드)인지 확인합니다.
3. Render 로그의 `[place-images] 197곳 로드 (사진 187곳, 좌표 194곳, en/ja 이름 197곳), 도시 사진 58곳, 음식 장르 사진 23개` 줄로 사진 데이터가 읽혔는지 확인합니다. 파일이 없으면 사진·좌표 없이 동작하고 경고가 남습니다.
4. 사이트에서 [추천+AI일정 통합 생성]을 눌러 확인합니다.
   - 카드에 사진과 "사진: 저작자 · 라이선스" 표기가 나온다. 도시 대표 사진·음식 예시 사진에는 앞에 "도시 대표 사진" / "음식 예시 사진"이 붙는다.
   - 일정 지도(OpenStreetMap)가 뜨고 "© OpenStreetMap contributors"가 보인다.
   - 페이지 제목과 머리글이 "Tabimaru — AI 일본 여행 플래너"다(영어·일본어로 바꾸면 제목도 바뀜).
   - 첫 화면만 열었을 때는 일정·항공·숙소 조회가 일어나지 않는 것이 정상입니다.
5. `[session] SESSION_SECRET이 없어…` 경고가 있으면 `SESSION_SECRET`을 넣습니다.
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

| 구분 | 변수 | 비고 |
|---|---|---|
| 권장 | `SESSION_SECRET` | 32바이트 이상 무작위 값. 없으면 재시작 때마다 로그인이 풀림 |
| 권장 | `PUBLIC_BASE_URL` | `https://japanjapantravel.onrender.com` (CSRF 허용 출처) |
| 로그인 | `OAUTH_BASE_URL` | 운영 주소와 같은 값. OAuth 콜백 기준 |
| 로그인 | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET` | 없는 공급자의 로그인 버튼은 숨겨짐 |
| AI | `GEMINI_API_KEY`, `GEMINI_API_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_REQUEST_TIMEOUT_MS`, `CHAT_PARSE_STRICT_AI` | 없으면 규칙 기반 일정·채팅 해석 |
| 항공 | `TRAVELPAYOUTS_TOKEN` | 없으면 예시 데이터 |
| 숙소 | `RAKUTEN_APP_ID`, `RAKUTEN_ACCESS_KEY` | 없으면 예시 데이터 |
| 환율 | `FX_USD_KRW`, `FX_JPY_KRW` | 실시간 조회가 모두 실패할 때만 쓰는 고정값 |
| 장소·지도 | `PLACES_PROVIDER`, `MAP_PROVIDER`, `GOOGLE_MAPS_SERVER_KEY`, `GOOGLE_MAPS_BROWSER_KEY` | 비워 두면 무료 모드. 아래 4)에서 Google을 켤 때만 설정 |
| Google 상한 | `GOOGLE_DAILY_CALL_LIMIT`(기본 30), `GOOGLE_MONTHLY_CALL_LIMIT`(기본 900), `GOOGLE_PHOTO_DAILY_LIMIT`(기본 30), `GOOGLE_PHOTO_MONTHLY_LIMIT`(기본 900) | google 모드에서만 의미가 있음. UTC 기준, 서버 메모리라 재시작하면 0부터 다시 셈 |
| 진단 | `DIAGNOSTICS_TOKEN` | `/api/ai-diagnostics?probe=1` 실행용. 없으면 probe는 403 |
| 프록시 | `TRUST_PROXY`, `TRUST_PROXY_HOPS` | Render에서는 `RENDER` 변수가 있어 자동으로 프록시를 믿음. `TRUST_PROXY_HOPS`는 1) 체크리스트 1번을 보고 정함 |
| 저장소 | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 선택. 5) 참고 |
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

## 5) Supabase(선택)

`/api/travel-plan/save · list · get`은 로그인한 사용자의 플랜만 저장·조회합니다(화면에서는 아직 쓰지 않음). 쓰지 않을 거면 `SUPABASE_*`를 비워 두면 되고, 이때 이 경로는 503을 돌려줍니다.

1. https://supabase.com 에서 프로젝트를 만든다.
2. SQL Editor에서 `deploy/supabase/schema.sql` 전체를 실행한다(여러 번 실행해도 된다). 테이블 이름(`travel_plans`)은 이름 변경과 관계없이 그대로다.
3. Project Settings → API에서 `SUPABASE_URL`(프로젝트 주소), `SUPABASE_SERVICE_ROLE_KEY`(service role 키)를 Render 환경변수에 넣는다. service role 키는 서버에서만 쓰고 브라우저에 노출하지 않는다.
4. 배포 후 `GET /api/health`의 `supabaseConfigured: true`를 확인한다. `supabaseReachable`은 저장 요청을 한 번 처리한 뒤에 채워진다.

## 6) OAuth 콜백 등록

각 공급자 콘솔에 아래 리디렉션 URI를 등록합니다(`OAUTH_BASE_URL`과 같은 주소). 이름 변경 뒤에도 바뀌지 않습니다.

- Google: `https://japanjapantravel.onrender.com/api/auth/google/callback`
- Naver: `https://japanjapantravel.onrender.com/api/auth/naver/callback`
- Kakao: `https://japanjapantravel.onrender.com/api/auth/kakao/callback`

공급자 콘솔에 표시되는 앱 이름은 서비스 이름을 바꾸고 싶을 때만 각 콘솔에서 Tabimaru로 바꾸면 됩니다(코드와 관계없음).

## 7) 주의

- 로그인 세션은 서버 메모리에, "내 일정"과 사용자 정보는 서버 디스크의 `data/*.json`에 저장됩니다. Render 무료 플랜은 재시작·재배포 때 디스크와 메모리가 초기화되므로 이 데이터는 사라질 수 있습니다.
- Rakuten Travel 요청의 Referer/Origin 헤더는 운영 도메인으로 고정되어 있습니다. Rakuten 앱에 등록한 사이트 주소와 같아야 합니다.
- Rakuten accessKey는 예전 `/api/rakuten-config`로 공개된 적이 있으니 새로 발급해 `RAKUTEN_ACCESS_KEY`를 교체하세요.
- 날씨(Open-Meteo)와 환율(ExchangeRate-API) 출처는 화면에 표기합니다(날씨 위젯·패널 하단, 환율 칩). Open-Meteo 무료 API는 비상업적 사용 조건이라, 제휴 수익이 생기면 유료 요금제 여부를 다시 판단해야 합니다(README "데이터 출처와 저작자 표시").
- 키는 Render 환경변수에만 넣고, 저장소나 프런트 코드에 넣지 않습니다.
