# Tabimaru — Architecture & Feature Documentation

> Tabimaru — AI 일본 여행 플래너(예전 이름 JapanTravel Suite)의 구조, 기능, 알고리즘, 데이터 흐름을 기록합니다. 코드 위치는 줄 번호 대신 **함수 이름**으로 적습니다(줄 번호는 금방 어긋남).
> 마지막 갱신: 2026-10-01 (이름 변경, 도시·음식 장르 사진, en/ja 이름, 무료 공급자 모드, 출처 표시, Google 비용 가드, 테스트 격리 반영)
>
> 저장소: https://github.com/wsxc94/tabimaru-japan-travel-planner · 운영: https://japanjapantravel.onrender.com/

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [서버 아키텍처](#3-서버-아키텍처)
4. [API 엔드포인트](#4-api-엔드포인트)
5. [스코어링 알고리즘](#5-스코어링-알고리즘)
6. [AI 통합](#6-ai-통합)
7. [한국어 주소 변환](#7-한국어-주소-변환)
8. [프론트엔드 아키텍처](#8-프론트엔드-아키텍처)
9. [데이터 흐름](#9-데이터-흐름)
10. [외부 API 연동](#10-외부-api-연동)
11. [테스트](#11-테스트)
12. [OAuth 로그인 및 일정 저장](#12-oauth-로그인-및-일정-저장)
13. [변경 이력](#13-변경-이력)

---

## 1. 프로젝트 개요

일본 여행 계획을 한 번에 만드는 웹 애플리케이션. 여행지 추천, AI 일정 생성, 항공권/숙소/맛집 탐색, 저장 기능을 한 화면에서 제공한다.

### 이름과 도메인 값
- 표기: "Tabimaru — AI 일본 여행 플래너"(ko), "Tabimaru — AI Japan Trip Planner"(en), "Tabimaru — AI日本旅行プランナー"(ja). 서버는 `APP_BRAND`·`APP_TAGLINE`·`APP_ID`(`tabimaru`), 클라이언트는 `BRAND_NAME` + 사전 키 `brand-subtitle`에서 한 번만 정한다.
- 이름을 바꿔도 **그대로 두는 값**(바꾸면 로그인·저장 데이터·배포가 깨짐): 운영 주소 `japanjapantravel.onrender.com`, Render 서비스 이름 `japantravel-suite`, OAuth 콜백 경로(`/api/auth/<공급자>/callback`), Rakuten 요청의 Referer 값, Travelpayouts marker·ID, 세션 쿠키 `sid`, localStorage 키(8.7), Supabase 테이블 이름, 매니페스트 `start_url`.

### 파일 구조
```
project-root/
  server.js                   # Node.js HTTP 서버(백엔드 전체, 외부 패키지 없음)
  public/
    index.html                # 메인 HTML
    app.js                    # 프론트엔드 JS(빌드 단계 없음)
    styles.css                # 전체 스타일(밝은 테마, color-scheme: light)
    manifest.webmanifest      # PWA 매니페스트
    favicon.svg               # 파비콘
  assets/place-images.json    # 무료 모드 장소·도시·음식 장르 사진, 좌표, en/ja 이름(Wikimedia, 서버가 시작할 때 읽음)
  scripts/build-place-images.js  # 위 파일 생성기(Wikipedia·Wikidata·Commons, 키 없음)
  test_all.js                 # 통합 테스트(npm test)
  tests/support/              # 가짜 벤더 서버, 네트워크 차단 프리로드, DOM 흉내
  _test_api.js                # 수동 점검 스크립트(개발용)
  deploy/DEPLOY.md            # 배포 가이드
  deploy/supabase/schema.sql  # Supabase 스키마(재실행 가능)
  .github/workflows/ci.yml    # CI(push·PR마다 npm test, Node 20)
  .env.example                # 환경변수 예시
  render.yaml                 # Render 설정(환경변수 이름 목록)
```

---

## 2. 기술 스택

| 영역 | 기술 |
|------|------|
| 서버 | Node.js 20+ (native `http` module, 프레임워크 없음, 전역 `fetch`) |
| 프론트엔드 | Vanilla JS + CSS (프레임워크·빌드 없음) |
| 장소 데이터 | 기본: 내장 큐레이션(`CITY_DATA`, 62개 도시) + Wikimedia Commons 사진·좌표 / 선택: Google Places API (New) |
| 지도 | 기본: OpenStreetMap 타일 + Leaflet 1.9.4 / 선택: Google Maps JavaScript API |
| 항공권 | Travelpayouts(Aviasales Data API 캐시 가격) → 예시 데이터 |
| 숙소 | Rakuten Travel API(좌표 기반) → 예시 데이터 |
| 투어/액티비티 | Klook 위젯 + Klook/Viator/GetYourGuide 바로가기 |
| AI 일정 생성 | Gemini(기본 `gemini-2.5-flash`) → OpenAI(`gpt-4o-mini`) → 규칙 기반 |
| AI 채팅 해석 | Gemini → OpenAI → 규칙 기반 |
| 날씨·지오코딩 | open-meteo(무료, 키 없음, CC BY 4.0, 비상업적 사용 조건) |
| 환율 | open.er-api(ExchangeRate-API, 출처 표기 필요) → frankfurter(무료) → `FX_*` 고정값 → 대략값, 12시간마다 갱신 |
| 저장 | 로그인 사용자 "내 일정": 서버 `data/*.json` / 선택: Supabase(PostgreSQL) |

---

## 3. 서버 아키텍처

### 3.1 초기화 흐름
1. `.env` 로드(`loadEnvFile()`) — 이미 정의된 환경변수는 덮어쓰지 않는다. `envValue()`는 공백뿐인 값을 미설정으로 본다.
2. 브랜드 상수 `APP_BRAND`(`Tabimaru`)/`APP_TAGLINE`(ko/en/ja)/`APP_ID`(`tabimaru`)/`APP_REPO_URL`, 외부 공개 API용 `OUTBOUND_USER_AGENT`(`TabimaruBot/0.1 (+<저장소 주소>)`), 공급자 모드(`PLACES_PROVIDER`, `MAP_PROVIDER`), 키·주소 설정.
3. `CITY_DATA` 구성(기본 도시 + `JAPAN_CITY_PROFILES`로 만든 도시 = 62곳), 별칭(`CITY_ALIASES`).
4. `loadPlaceImages()`로 `assets/place-images.json`의 `places`·`cities`·`foodGenres`를 읽는다(파일이 없으면 사진 없이 동작). 로그: `[place-images] 197곳 로드 (사진 187곳, 좌표 194곳, en/ja 이름 197곳), 도시 사진 58곳, 음식 장르 사진 23개`.
5. 환율 갱신(`refreshFxRate()` 즉시 1회 + 12시간 간격).
6. HTTP 서버 시작 — 시작 로그 `Tabimaru — AI 일본 여행 플래너 server running at http://localhost:<PORT> (places=…, map=…)`.

### 3.2 공급자 모드
| 변수 | 값 | 동작 |
|---|---|---|
| `PLACES_PROVIDER` | `free`(기본) | Google Maps Platform 호출 0회. `buildCuratedPicks()`가 `CITY_DATA.highlights`에 `attachPlaceMedia()`로 사진·저작자·좌표를 붙이고, 사진이 없는 카드는 `withCityPhotoFallback()`으로 도시 대표 사진을 붙인다. `sourceInfo`는 `{kind:'curated', provider:'curated+wikimedia', reasonCode:null}` |
| | `google` | `fetchGoogleAttractions()`(쿼리 2개, 30km locationBias, 12시간 캐시)로 추천. 실패하면 무료 데이터 + `{kind:'fallback', reasonCode}` |
| `MAP_PROVIDER` | `osm`(기본) | `/api/maps-config` → `{provider:'osm'}` |
| | `google` | `{provider:'google', key: GOOGLE_MAPS_BROWSER_KEY}`. 브라우저 키가 없으면 `osm`(경고 1회). 서버 키는 절대 보내지 않는다 |

### 3.3 Google 비용 가드 (google 모드)
모든 Google 요청(Places 검색·사진, Geocoding, Directions)은 `googleApiFetch()` 하나를 거친다.
- **서킷 브레이커**: `classifyGoogleFailure()`가 `GOOGLE_BILLING_DISABLED`·`GOOGLE_PERMISSION_DENIED`·`GOOGLE_QUOTA_EXCEEDED`로 분류하면 30분 동안 모든 Google 호출을 건너뛴다(그동안 요청은 `GOOGLE_CIRCUIT_OPEN`).
- **호출 상한**(`googleBlockedReason()`, `GOOGLE_BUCKET_LIMITS`): 두 묶음을 따로 센다. 넘으면 `GOOGLE_QUOTA_EXCEEDED`(다음 UTC 자정·다음 UTC 달까지).
  - `search`(Places 검색·Geocoding·Directions): `GOOGLE_DAILY_CALL_LIMIT`(기본 30) / `GOOGLE_MONTHLY_CALL_LIMIT`(기본 900)
  - `photo`(사진): `GOOGLE_PHOTO_DAILY_LIMIT`(기본 30) / `GOOGLE_PHOTO_MONTHLY_LIMIT`(기본 900). 사진이 검색 예산을 쓰지 않는다.
  - 기본 월 상한 900은 Text Search Enterprise·Place Details Photos SKU의 월 무료 사용량(각 1,000건, 2026-10 가격표)보다 낮게 잡은 값이다. 이 앱의 Text Search 필드 마스크에는 `rating`·`userRatingCount`(명소) 또는 `priceLevel`·`currentOpeningHours`(맛집)가 있어 Enterprise로 계산된다. 진단 probe만 `places.id`(Essentials IDs Only)다.
  - 카운터는 프로세스 메모리에 있어 재시작하면 0부터 다시 센다(diagnostics `countersResetOnRestart: true`). 확실한 비용 상한은 Google Cloud 콘솔 할당량이다.
- **HTTP 200 거부 처리**: Geocoding/Directions의 `status: REQUEST_DENIED / OVER_QUERY_LIMIT`도 실패로 분류한다.
- **타임아웃**: `fetchWithTimeout()`(최대 10초).
- **캐시**: `placesCacheGet/Set`(12시간, 300개).
- **사진 프록시**: `googlePhotoFields()`가 `/api/place-photo?name=places/…/photos/…&w=400`을 만들고(`photoCredit.scope: 'place'`), 이름을 허용 목록(`rememberPlacePhotoName`, 24시간·5000개)에 넣는다. `handlePlacePhoto()`는 허용된 이름만 받아 `media?skipHttpRedirect=true`로 photoUri를 얻고, 이미지 요청은 리다이렉트를 오류로 처리(`redirect: 'error'`)하며 `readBodyLimited()`로 5MB를 넘으면 끊는다. 이미지(jpeg/png/webp/gif/avif)만 `Cache-Control: public, max-age=86400`으로 전달한다. 받은 바이트는 메모리 LRU 캐시(최대 200장·30MB·24시간, 응답 헤더 `X-Photo-Cache`)에 두어 같은 사진은 Google을 다시 부르지 않는다. 무료 모드에서는 404.
- **로그**: `warnThrottled()` — 같은 사유는 10분에 한 번, 키는 `redactGoogleKey()`로 가린다.
- **진단**: `/api/ai-diagnostics`는 공개 화면(모드, `google.circuitOpen/circuitReason/callsToday/callsThisMonth/photoCallsToday/photoCallsThisMonth/…Limit/lastErrorCode`, `placeImages` 개수)만 보여 주고, `?probe=1`(실제 호출)은 `DIAGNOSTICS_TOKEN`이 맞을 때만(`diagnosticsTokenMatches()`, 해시 + timingSafeEqual).

### 3.4 핵심 데이터 구조
```js
CITY_DATA[cityKey] = {
  label: string,        // 한국어 도시명 (예: '도쿄')
  airport: string,      // 주요 공항 코드 (예: 'NRT')
  areas: string[],      // 주요 지역 목록
  highlights: [{ name, area, category, stayMin, bestTime, crowdScore }],
  foods: [{ name, area, genre, priceLevel, score }]
}

// assets/place-images.json (version 1, scripts/build-place-images.js가 만든다)
{ "version": 1, "generatedAt": "...",
  "places": {        // 키: "<cityKey>|<highlights의 장소 이름 그대로>" (197곳)
    "tokyo|센소지": { "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/…/500px-….jpg",
                     "filePage": "https://commons.wikimedia.org/wiki/File:…", "license": "CC BY-SA 4.0",
                     "artist": "…", "lat": 35.71, "lng": 139.79, "wikidata": "Q…",
                     "labels": { "en": "…", "ja": "…" } } },
  "cities": {        // 도시(섬) 대표 사진, 키: cityKey (62곳 중 58곳)
    "amami": { "image": "…", "filePage": "…", "license": "…", "artist": "…", "lat": …, "lng": …, "wikidata": "Q…", "labels": { … } } },
  "foodGenres": {    // 음식 장르 예시 사진, 키: CITY_DATA foods[].genre 원문(예: "라멘"), 좌표 없음 (23개)
    "라멘": { "image": "…", "filePage": "…", "license": "…", "artist": "…", "wikidata": "Q…" } } }
```
- `readPlaceMediaEntry()`가 세 칸을 같은 규칙으로 검사한다: Commons 이미지(`upload.wikimedia.org/wikipedia/commons/`) + `filePage`(`commons.wikimedia.org/wiki/`) + `license`가 모두 있어야 사진으로 인정하고, 좌표는 일본 범위만 받는다. `cities`는 사진과 좌표가 모두 있어야, `foodGenres`는 사진이 있어야 받는다. `image`가 `null`인 장소는 좌표만 쓴다.
- `labels.en/ja`는 위키데이터 이름이다(없으면 그 언어를 뺌). 이름을 준 항목이 사진을 빌려 온 항목과 다른 도시(ibaraki 등)는 서버가 도시 이름으로 쓰지 않는다(`cityLabelsFromMedia()`는 en 이름이 cityKey와 맞을 때만 사용).
- 도시 중심 좌표는 `resolveCityCenter()`(정적 표 `CITY_CENTER_COORDS` 62곳 → 동적 도시 center → 명소 좌표 평균 → 공항)로 구하고 Google을 부르지 않는다.

**사진 붙이기와 `photoCredit.scope`**(`mediaCredit(media, scope)`):

| 함수 | scope | 붙는 곳 |
|---|---|---|
| `attachPlaceMedia()` | `place` | 그 장소의 `places` 항목 사진·좌표. 이미 붙은 도시·장르 대체 사진은 장소 사진으로 바꾼다 |
| `withCityPhotoFallback(item, cityKey)` | `city` | 사진이 없는 추천 카드(`/api/destinations`, `/api/dest-search`, travel-plan 추천·규칙 일정이 더한 카드·사용자가 고른 카드). 도시 좌표는 붙이지 않는다 |
| `withGenrePhotoFallback(item, genre)` / `genrePhotoFor()` | `genre` | 내장 맛집(`tabelogStyleFoods()` → `curatedFoodsForCities()`, `/api/foods` 무료 목록). 장르는 원문 → `canonicalFoodGenre()` 동의어 → `FOOD_GENRE_I18N` en/ja 표기 순으로 찾는다 |
| `googlePhotoFields()` | `place` | google 모드의 Google 사진(`/api/place-photo`). Google 결과 맛집에 사진이 없어도 장르 사진은 붙이지 않는다 |

사진 선택 규칙(생성 스크립트): 자유 라이선스만(GFDL 단독 제외), 온천·목욕 사진은 입욕객이 보이지 않는 것만(`BATH_REVIEW` 정규식에 걸리는 사진을 `--review-baths`로 모두 내려받아 확인, 문제가 있으면 `IMAGE_FROM`으로 관련 항목 사진을 대신 씀), 시청·호텔 사진뿐인 도시(akita, odate, okayama, saga)는 도시 사진을 두지 않음(`EXCLUDE_CITY_IMAGES`).

### 3.5 요청 처리 흐름
```
HTTP Request
  -> URL 파싱 (/api/* 이면 handleApi, 아니면 serveStatic)
  -> 레이트리밋: clientIpOf(req) 기준 분당 60회(/api/place-photo는 별도 120회)
  -> CSRF: checkCsrf() — 상태를 바꾸는 요청의 Origin(없으면 Referer)이 허용 출처와 정확히 일치해야 함
  -> readBody(req, 라우트별 한도) — 초과 413, JSON 오류 400
  -> validatePayload() + API_SCHEMAS
  -> 핸들러 -> sendJson() (보안 헤더 포함)
  -> 알 수 없는 오류: 500 + 한국어 일반 안내(원문 오류는 서버 로그에만, 비밀값 가림)
```

### 3.6 보안
- **클라이언트 IP**(`clientIpOf()`): 기본은 소켓 주소. Render(`RENDER` 변수) 또는 `TRUST_PROXY=1`일 때만 `X-Forwarded-For`의 뒤에서 `TRUST_PROXY_HOPS`번째 값(기본 마지막 값)을 쓴다 → 첫 항목을 바꿔도 한도를 우회할 수 없다. 고른 값이 Cloudflare 공개 IP 대역(`isCloudflareIp()`, IPv4·IPv6)이면 한 칸 앞 값을 쓴다(여러 방문자가 Cloudflare 주소 하나로 묶이지 않게). `noteProxyShape()`가 첫 요청 1줄과 처음 50개 요청의 항목 수 분포 1줄을 로그로 남긴다(IP는 남기지 않음, 운영 확인 방법은 deploy/DEPLOY.md 1번).
- **CSRF 허용 출처**: `PUBLIC_BASE_URL`, `OAUTH_BASE_URL`, 요청의 자기 주소(Host), `http://localhost:<PORT>`. `Origin: null`, `*.onrender.com` 부분 일치는 거부. Origin·Referer가 모두 없는 요청(서버 간 호출·CLI)은 통과.
- **본문 한도**: 항공·숙소·장소 검색·이동비 32KB, 일반 64KB, 일정 생성·AI 채팅 128KB, 일정 저장 500KB.
- **보안 헤더**: API는 `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`; 정적 파일은 `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`. CSP는 아직 없다(추가 시 unpkg.com, `*.tile.openstreetmap.org`, `upload.wikimedia.org`, Rakuten 이미지, Travelpayouts/Klook 스크립트를 허용해야 함).
- **세션**: `sid=<uuid>.<HMAC>` 쿠키(HttpOnly, SameSite=Lax, HTTPS면 Secure), 서버 메모리 저장, 7일 만료. `SESSION_SECRET`이 없으면 실행마다 임의 값.
- **OAuth**: Google·Naver·Kakao 모두 `issueOauthState()`가 `state`를 공급자별 서버 기록과 `oauth_state` 쿠키(HttpOnly, SameSite=Lax, Path=/api/auth, 10분)에 함께 묶는다. 콜백의 `consumeOauthState()`가 쿠키와 timingSafeEqual로 대조하고 한 번만 쓰게 한다(로그인 CSRF 방지). OAuth 설정값은 `envValue()`로 읽어 공백뿐인 값은 미설정으로 본다.
- **비밀값**: 어떤 응답에도 서버 키·토큰이 나가지 않는다. Gemini 키는 URL이 아니라 `x-goog-api-key` 헤더로 보낸다.
- **원시 오류**: 응답의 `aiErrors`는 `publicAiErrors()`로 `{provider, code, reasonCode, action}`만 남긴다. 공급자 원문 메시지는 서버 로그에만.
- **외부 값 정리**: open-meteo `daily`는 `sanitizeWeatherDaily()`가 날짜(`YYYY-MM-DD`)와 숫자(모르면 `null`) 4개 필드만 남기고(최대 16일), 모르는 필드는 버린다.

---

## 4. API 엔드포인트

### 4.1 헬스/진단
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/health` | 서버 상태 `{ok, app:'tabimaru', brand:'Tabimaru', providers:{places, map}, ai, supabaseConfigured, …}`. 외부 호출 없음 |
| GET | `/api/ai-diagnostics` | 설정 진단(비밀값 없음). `?probe=1`은 `x-diagnostics-token` 헤더가 `DIAGNOSTICS_TOKEN`과 맞을 때만 실제 호출(Gemini·OpenAI·Places 각 1회) |

### 4.2 도시·지도·날씨·환율
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/cities` | `{cities: [{key, label, airport}]}` |
| GET | `/api/maps-config` | `{provider:'osm'}` 또는 `{provider:'google', key:<브라우저 키>}` |
| GET | `/api/place-photo?name=&w=` | google 모드 사진 프록시(이름 정규식 `^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$`, w 100..1600). 잘못된 이름 400, 발급하지 않은 이름 404, 무료 모드 404 |
| GET | `/api/weather?city=<cityKey>` | 모든 도시. `resolveCityCoordsForInput()` → open-meteo 10일 예보(좌표별 30분 캐시, `sanitizeWeatherDaily()`로 날짜·숫자만). 위치를 모르면 404(다른 도시로 대신하지 않음), 날씨 서버 실패 502 |
| GET | `/api/fx-rate` | `jpyToKrw`, `usdToKrw`, … + `source`(`live`/`env`/`approximate`), `provider`, `approximate`, `stale` |

### 4.3 여행 플랜(핵심)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/travel-plan` | **통합 플랜**: 추천 + AI 일정 + 추천 맛집 |
| POST | `/api/destinations` | 여행지 추천만(`recommendDestinations()`, `sourceInfo` 포함) |
| POST | `/api/itinerary` | 규칙 기반 일정만 |
| POST | `/api/dest-search` | 여행지 탐색(`recommendDestinations()` 재사용, `sourceInfo`) |
| POST | `/api/ai-travel-chat` | 자연어 조건 해석 + 선택 장소 제안 |
| POST | `/api/route-cost` | 경로 교통비(장소 이름 문자열 최대 12개). AI 계산 → (google 모드) Directions → 좌표 기반 거리 추정 |

#### `/api/travel-plan` 요청
```json
{ "city": "osaka", "theme": "mixed|foodie|culture|shopping|nature", "budget": "low|mid|high",
  "days": 4, "startDate": "2026-10-15", "lang": "ko|en|ja", "useAi": true,
  "_picks": [], "flight": {}, "stay": {} }
```

#### `/api/travel-plan` 응답(주요 필드)
```json
{
  "source": "integrated_travel_planner_v1",
  "city": "오사카",
  "recommendationSource": "local_curated_fallback | external_google_places_ai_scored",
  "recommendationInfo": { "kind": "curated", "provider": "curated+wikimedia", "reasonCode": null },
  "recommendations": [{ "name": "오사카성", "photoUrl": "https://upload.wikimedia.org/…",
                        "photoCredit": { "artist": "…", "license": "CC BY-SA 4.0", "filePage": "https://commons.wikimedia.org/wiki/File:…", "scope": "place" },
                        "lat": 34.687, "lng": 135.526, "aiScore": 82 }],
  "recommendedFoods": [{ "name": "…", "genre": "라멘", "photoUrl": "https://upload.wikimedia.org/…",
                         "photoCredit": { "artist": "…", "license": "…", "filePage": "…", "scope": "genre" } }],
  "foodsInfo": { "kind": "curated", "provider": "curated", "reasonCode": null },
  "itinerary": [{ "day": 1, "date": "2026-10-15",
                  "blocks": ["오전(09:00-11:00): 오사카성 (오사카성 공원)", "점심(12:00-13:00): …"],
                  "places": [{ "name": "오사카성", "period": "오전", "lat": 34.687, "lng": 135.526 }] }],
  "placeCoords": { "오사카성": { "lat": 34.687, "lng": 135.526 } },
  "itinerarySource": "gemini_itinerary_v1 (gemini-2.5-flash) | openai_itinerary_v1 | ai_planner_v1(규칙 기반, 예전 이름 그대로)",
  "itineraryInfo": { "kind": "ai|rule", "provider": "gemini|openai|rule_planner", "reasonCode": null },
  "tips": [], "summary": "…", "aiNote": "", "aiErrors": [],
  "budgetBreakdown": { "meal": {}, "transport": {}, "activity": {}, "days": 4, "budgetTier": "mid" }
}
```
`source`·`recommendationSource` 같은 예전 필드는 호환을 위해 그대로 두고, 의미는 `*Info` 객체로 판단한다. `lang`이 en/ja이면 카드의 `name`은 현지화된 이름, `nameKo`는 원래 한국어 이름이다(`city` 같은 내부 키는 한국어 그대로). `photoCredit.scope`는 `place`(그 장소 사진) · `city`(도시 대표 사진) · `genre`(음식 장르 예시 사진)이다(3.4).

#### 출처 정보 객체 `{ kind, provider, reasonCode }`
- `kind`: `live`(실시간 공급자) · `ai` · `curated`(무료 모드 정상 결과) · `fallback`(공급자 실패로 무료 데이터 사용) · `mock`(예시 데이터) · `rule`(규칙 기반 일정)
- `reasonCode`: `GOOGLE_KEY_MISSING`, `GOOGLE_BILLING_DISABLED`, `GOOGLE_PERMISSION_DENIED`, `GOOGLE_QUOTA_EXCEEDED`, `GOOGLE_ERROR`, `GOOGLE_CIRCUIT_OPEN`, `NO_RESULTS`, `AI_KEY_MISSING`, `AI_TRUNCATED`, `AI_INVALID_OUTPUT`, `AI_ERROR`, `PROVIDER_UNAVAILABLE`, `NO_LIVE_DATA`
- `itineraryInfo`: `useAi`가 없으면 `{rule, reasonCode:null}`, AI 키가 없으면 `AI_KEY_MISSING`, 그 밖에는 첫 AI 오류의 `reasonCode`. 빈 AI 일정은 절대 `ai`로 표시하지 않는다.

### 4.4 항공권/숙소
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/flights` | Travelpayouts → 예시 데이터. `sourceInfo`(`live/travelpayouts` 또는 `mock/mock` + `PROVIDER_UNAVAILABLE`·`NO_LIVE_DATA`), `dateMatch`(`exact`/`nearby`/`null`), 항목마다 `nearbyDate`·`dateOffsetDays`, 예시 항목은 `sample:true` |
| POST | `/api/stays` | Rakuten Travel(VacantHotelSearch → 날짜 조건 없는 SimpleHotelSearch) → 예시 데이터. 날짜 조건 없는 결과는 `sourceInfo {fallback, rakuten, NO_LIVE_DATA}`, `dateMatch:'none'`, 항목마다 `priceBasis:'min_charge'`(화면 "날짜 미확인 최저가"). 평점은 5점 만점(리뷰 없으면 `rating:null`, `rated:false`), 사진은 https만 |

Amadeus 경로는 테스트 서버 주소가 사라져 삭제했다(`AMADEUS_*` 변수는 읽지 않음).

### 4.5 맛집
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/foods` | `?city=osaka&genre=라멘&budget=mid&lang=ko`. 무료 모드는 `tabelogStyleFoods()`(내장 큐레이션, `sourceInfo` curated). google 모드는 `fetchFoodPlacesForCity()`(쿼리 2개), 실패하면 큐레이션 + `warning`(짧은 한국어) |

### 4.6 저장
| Method | Path | 설명 |
|--------|------|------|
| POST/GET/DELETE | `/api/my-plans/save · list · load · delete` | 로그인 사용자의 내 일정(`data/saved_plans.json`) |
| POST | `/api/travel-plan/save` | 로그인 필요. Supabase upsert(`user_label` = 세션 userId). 저장소가 없거나 연결 불가면 503(AI 일정 생성 전에 확인) |
| GET | `/api/travel-plan/list`, `/api/travel-plan/get?planKey=` | 로그인 사용자 자신의 플랜만 |

`/api/rakuten-config`는 삭제했다(Rakuten 키는 서버에서만 쓴다).

---

## 5. 스코어링 알고리즘

### 5.1 여행지 스코어: `scoreExternalPlace()` (google 모드)
Google Places 결과를 6개 가중치 팩터로 0~100점 산출.

| 팩터 | 가중치 | 계산 방식 |
|------|--------|-----------|
| ratingScore | **0.35** | `rating / 5` (0~1) |
| reviewScore | **0.25** | `log(1 + reviewCount) / log(1 + 5000)` (0~1) |
| mobilityScore | **0.15** | `1 - (centerDistKm / 20)` (0.1~1) — 도시 중심 근접도 |
| preferenceScore | **0.10** | `categoryFit(theme, primaryType)` — 테마 적합도 |
| budgetScore | **0.05** | `budgetFit(budget, primaryType)` — 예산 적합도 |
| seasonBonus | **0.10** | `seasonalBonus(type, startDate)` — 계절 보너스 |

```
composite = (rating*0.35 + review*0.25 + mobility*0.15 + preference*0.10 + budget*0.05 + season*0.10) * 100
finalScore = round(clamp(composite - congestionPenalty * 10, 0, 100))
```

- `categoryFit`: foodie(restaurant/food/market) · culture(museum/temple/shrine/historical) · shopping(shopping/store/mall) · nature(park/garden/beach/mountain) 일치 1.0, 불일치 0.55, mixed 0.75
- `budgetFit`: low는 고가 장소 0.6/일반 0.95, high는 고가 1.0/일반 0.85, mid는 0.9
- `congestionPenalty`: `popularity = log(1+reviewCount)/log(1+5000)`, 피크(12~19시) `popularity*0.3` 아니면 `*0.2`, 영업 중 아님 +0.2, 최대 0.45

### 5.2 무료 모드 여행지 스코어: `buildCuratedPicks()`
```
aiScore = 70 + themeScore(theme, place) * 10 - crowdScore * 2
```
- `themeScore`: 테마-카테고리 일치 2, 불일치 0, mixed 1
- `crowdScore`: 1~5 (`CITY_DATA`의 혼잡도)
- 이어서 `attachPlaceMedia()`(사진·저작자·좌표), 사진이 없으면 `withCityPhotoFallback()`(도시 대표 사진), `localizeCuratedPlace()`(en/ja 이름: `CURATED_PLACE_I18N` → `place-images.json`의 `labels` → ja는 `labels.en` → 대표 명소 로마자 별칭 순. 원래 이름은 `nameKo`에 두고, 여러 번 불러도 `nameKo`로 찾아 결과가 같다)

### 5.3 추천 맛집 스코어: `fetchRecommendedFoods()` (google 모드)
추천 여행지와 숙소 위치의 **가중 중심점**(숙소 좌표는 2배) 기준으로 반경 8km를 검색한다. 좌표가 없으면 `fetchGoogleCityCenter()`(정적 좌표 우선).

- 쿼리 2개(언어별, 예: `"${city} 인기 맛집"`, `"${city} 현지인 추천 레스토랑"`), 각 최대 20건, 12시간 캐시

| 팩터 | 최대 점수 | 계산 |
|------|----------|------|
| ratingScore | 40 | `(rating / 5) * 40` |
| reviewScore | 30 | `min(30, log10(max(1, reviewCount)) * 10)` |
| proximityScore | 20 | `max(0, 20 - distKm * 3)` |
| bonus | 10 | 고정 |

필터 `score >= 3.0`, aiFit 내림차순 최대 20개. 결과가 비면(무료 모드 포함) `curatedFoodsForCities()`로 채운다.

### 5.4 맛집 검색 적합도: `scoreFoodFit()` (`/api/foods`, google 모드)
```
aiFit = round(min(100, (rating(기본 3.6) / 5) * 40 + 20 + 15 + 10))
```
현재 예산(`budget`)은 점수에 반영되지 않는다.

### 5.5 항공권 랭킹: `rankFlights()`
기본 점수 1,000,000에서 감점.

| preference | 공식 |
|-----------|------|
| `balanced` | `1,000,000 - price*0.7 - duration*260 - stops*45,000` |
| `cheap` | `1,000,000 - price - stops*50,000` |
| `fast` | `1,000,000 - duration*180 - stops*50,000` |

가까운 날짜 결과는 `dateOffsetDays * 30,000`을 더 뺀다(요청 날짜에 가까운 것이 먼저).

### 5.6 숙소 랭킹: `rankStays()`
평점은 5점 만점. 평점 없음은 balanced에서 3.5, rating 정렬에서 0으로 본다.

| preference | 공식 |
|-----------|------|
| `balanced` | `1,000,000 + rating*2,400 - pricePerNight*5` |
| `price` | `1,000,000 - pricePerNight*6 - totalPrice*0.3` |
| `rating` | `1,000,000 + rating*4,000 - pricePerNight*4` |

AI 힌트 보너스: 선호 지역 +65,000, 오션뷰 +30,000, 공항 셔틀 +28,000, 보안/24시간 프런트 +26,000, 공항 코드 일치 +22,000.

### 5.7 계절 보너스: `seasonalBonus(primaryType, startDate)`
- 3~4월 벚꽃: 공원/정원/사원/신사 → 1.0
- 10~11월 단풍: 공원/정원/사원 → 0.95
- 7~8월: 수족관/박물관/쇼핑 → 0.9
- 12~2월: 온천/리조트 → 0.95, 2월 공원 → 0.85
- 기본 0.5

### 5.8 경로 최적화: `optimizeDayRoute(places)`
도시별로 묶은 뒤 haversine 최근접 이웃 순서로 정렬, 좌표 없는 장소는 뒤에 둔다.

### 5.9 주요 헬퍼
`clamp()`, `haversineKm()`, `normalizePriceLevel()`, `fetchWithTimeout()`(AbortController), `fetchWithRetry()`(502/503/504 지수 백오프, 최대 2회), `parseJsonFromText()`, `classifyAiError()`, `sourceInfo()`, `warnThrottled()`.

---

## 6. AI 통합

### 6.1 폴백 체인과 모델 서킷 브레이커
```
Gemini (1순위) -> OpenAI (2순위) -> 규칙 기반 (3순위)
```
- Gemini 모델 순서: `GEMINI_API_MODEL`(기본 `gemini-2.5-flash`) → `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-flash-latest`(겹치면 제외). 429/503/404면 다음 모델.
- `recordModelFailure()` / `isModelAvailable()` / `getAvailableModels()`: 실패 모델을 60초 쿨다운(연속 실패 시 최대 5분까지 두 배씩), 전부 쿨다운이면 가장 오래된 1개만 재시도.
- 키는 `x-goog-api-key` 헤더, 주소는 `${GEMINI_API_BASE}/v1beta/models/<model>:generateContent`.

### 6.2 일정 생성
**규칙 기반** `createItinerary()`: 도시별 관광지 풀, 다도시 순회 시 `allocateDaysByCities()`로 일수 배분, 오전/오후/저녁 배치, 항공편 시간(첫날 도착·마지막 날 출발)과 `specialPrefs`(늦은 출발, 실내, 휴식일 등) 반영.

**Gemini** `createItineraryWithGemini()`:
- `responseMimeType: application/json` + `responseSchema`(`GEMINI_ITINERARY_SCHEMA`), 프롬프트에 정확한 출력 모양과 일수를 적는다.
- `maxOutputTokens` 4096(6일 이상 8192), 2.5 계열은 `thinkingBudget: 0`, temperature 0.28, 타임아웃 30초.
- `finishReason: MAX_TOKENS` → `AI_TRUNCATED`, 후보 없음·차단·STOP 외 → `AI_INVALID_OUTPUT`.

**OpenAI** `createItineraryWithOpenAI()`: Responses API + `json_schema`(strict), `max_output_tokens` 동일, `status: incomplete`면 잘림으로 처리.

**정규화** `normalizeAiItinerary()` / `normalizeAiBlock()`: 문자열·객체 블록을 모두 클라이언트 형식 문자열로 바꾸고 날짜는 서버가 계산한다. 일수가 모자라거나 관광 블록(저녁 제외)이 없는 날이 있으면 `AI_INVALID_OUTPUT` → 규칙 기반 일정.

**일정 블록 형식**(클라이언트 렌더러가 읽는 모양):
```json
{ "day": 1, "date": "2026-10-15",
  "blocks": ["오전(09:00-11:00): 센소지 (아사쿠사)", "오후(13:00-15:00): 메이지 신궁 (하라주쿠)", "저녁(18:00-19:30): …"],
  "places": [{ "name": "센소지", "period": "오전", "lat": 35.714, "lng": 139.796 }] }
```
`attachItineraryCoordinates()`가 블록의 장소 이름을 추천 카드·`place-images.json` 좌표와 맞춰 `places`와 `placeCoords`를 만든다(지도용).

### 6.3 여행 채팅 해석
- **규칙 기반** `parseTravelChatInput()`: `extractRequestedLocality()`(지역·랜드마크), `extractAirportCodeFromText()`, `cityKeyByAirport()`, `extractWantedPlacesFromMessage()`, `matchMustAttractions()`, `parseSpecialPrefsFromText()`.
- **AI**: `parseTravelChatWithGemini()`(maxOutputTokens 1200, thinkingBudget 0), `parseTravelChatWithOpenAI()`(Responses API + JSON Schema). `normalizeTravelChatParsed()`가 규칙 기반 결과와 병합한다.
- 모르는 지역이면 `ensureDynamicCityProfile()`이 동적 도시(`custom_…`)를 만든다: 좌표는 google 모드면 Geocoding, 아니면 open-meteo 지오코딩.
- **멀티턴**: 클라이언트가 `history`(최근 대화)와 `prevParsed`를 보내고, `buildTravelChatPlan()`이 빈 필드를 이전 조건으로 채운다(`routeCities`는 항상 병합).

---

## 7. 한국어 주소 변환

### JP_KO_AREA 딕셔너리
일본어·영문 주소를 한국어 **음차**로 바꾸는 사전(의미 번역이 아닌 발음 표기).

| 카테고리 | 예시 |
|----------|------|
| 도시 | osaka→오사카, tokyo→도쿄, kyoto→교토 |
| 구(Ward) | chuo-ku→추오구, kita-ku→키타구, nishi-ku→니시구 |
| 지역 | dotonbori→도톤보리, namba→난바, akihabara→아키하바라 |

### PRIMARY_TYPE_KO / EN / JA + `localizeType()`
Google `primaryType`을 언어별 카테고리명으로 바꾼다(예: tourist_attraction→관광명소, ramen_restaurant→라멘). 정확 매칭 → 부분 매칭 → snake_case를 공백으로.

### `koreanizeAddress()` / `shortArea()` / `localizeAddress()`
우편번호·Japan/日本 제거 → 사전 변환 → 丁目·番地 제거 → 가타카나 블록 제거 → 구분자 정리. `shortArea()`는 앞 2개 파트만. `localizeAddress()`는 lang에 따라 고른다.

무료 모드의 en/ja 표기:
- 명소: `CURATED_PLACE_I18N`(도쿄·오사카·교토 명소 + `labels`가 없는 설명형 명소) → `place-images.json`의 `labels`(위키데이터 이름) → 로마자 별칭.
- 도시: `CITY_NAME_I18N`(62개 도시, `public/app.js`의 `PLACE_NAME_I18N`과 같은 값 — 한쪽을 고치면 다른 쪽도 맞춘다) → 동적 도시 `nameJa` → `cityLabelsFromMedia()` → cityKey 로마자(`localizedCityName()`).
- 지역·분류·장르: `CURATED_AREA_I18N`(모르면 도시 이름), `CURATED_CATEGORY_I18N`, `FOOD_GENRE_I18N`.
- 맛집 이름: `CURATED_FOOD_I18N`(도쿄·오사카·교토) + `REGIONAL_FOOD_I18N`(지방 맛집·음식 111개) + 도시 공통 이름 규칙(예: "<도시> 대표 라멘" → "Classic <City> ramen").
- 좌표·이동비는 현지화된 이름으로도 찾는다(`placeLabelIndex`, `placeLabelMatches()`, `koPlaceNameForLabel()`; 정확히 같은 이름만, 대소문자 무시).
- 일정 블록 앞의 시간대 단어(오전/오후/저녁)와 `places[].period`는 클라이언트가 읽는 형식 토큰이라 모든 언어에서 한국어로 두고, 화면이 `tPeriod()`로 번역한다. 응답의 `city`·`nameKo`·`budgetBreakdown.*.label`도 한국어 그대로다(화면 표시에는 쓰지 않거나 화면이 번역).

---

## 8. 프론트엔드 아키텍처

### 8.1 주요 UI 섹션 (index.html)
1. **여행 조건** — 도시/날짜/일수/테마/예산 + AI 채팅
2. **추천 결과** — 탭(여행지/맛집) + 일정 타임라인 + 일정 지도
3. **탐색** — 여행지·맛집 독립 검색
4. **항공권 탐색** — 편도/왕복/다구간 + 필터/정렬
5. **숙소 탐색** — 체크인아웃/인원/필터
6. **투어** — Klook 위젯(8초 안에 안 뜨면 바로가기 링크)

### 8.2 첫 화면(부팅) — 유료 API를 부르지 않는다
부팅 IIFE: `applyBrand()` → `initCityOptions()`(`/api/cities`) → `renderInitialEmptyStates()`(빈 상태 카드: [추천+AI일정 통합 생성]을 누르라는 안내) → 출발일 기본값(오늘+14일) → `loadKlookWidget()` → `loadMapConfig()`(`/api/maps-config`) → `initExchangeRateChip()`(`/api/fx-rate`). 별도로 `/api/auth/me`, `/api/auth/providers`를 부른다. 자동 클릭·자동 검색은 없다.

[추천+AI일정 통합 생성] → `runPlan(extra, syncAux=true)`: `/api/travel-plan` 1회 → 탐색>여행지 탭은 같은 추천을 재사용(`/api/dest-search` 호출 없음) → `searchFlights()`·`searchFoods()`·`searchStays()` 각 1회 + `refreshInlineWeather()`. `beginPlanBusy()`/`endPlanBusy()`가 생성·채팅·새로고침 버튼을 모두 잠그고, 요청 순번으로 오래된 응답을 버린다.

### 8.3 출처 안내
`SOURCE_TEXT`(ko/en/ja) + `normalizeInfo()` / `legacyInfo()`(정보 객체가 없는 예전 응답) / `describeSource()` / `renderSourceNote()`. 예: 무료 모드 추천은 "추천 여행지: 엄선한 추천 장소", AI 키 없음은 "AI가 설정되지 않아 기본 일정으로 만들었어요.", 예시 데이터는 "예시 데이터"(항공·숙소 카드에 '예시' 표시, 일정에 넣기 비활성). 원시 오류·내부 ID는 보여주지 않는다(`friendlyError()`).

### 8.4 사진
`cardPhoto(url, name, credit)`가 실제 `<img>`를 그리고, 캡처 단계 `error` 리스너가 실패 시 첫 글자 타일로 바꾼다. 위키미디어 사진은 `photoCreditHtml()`로 "사진: 저작자 · 라이선스"를 파일 페이지 링크와 함께 표시한다(CC BY-SA 조건). `photoCredit.scope`가 `city`·`genre`이면 `photoScopeLabel()`이 앞에 "도시 대표 사진" / "음식 예시 사진"(en City photo / Example photo, ja 都市の写真 / 料理のイメージ)을 붙이고 대체 텍스트에도 넣는다. 이미지 주소는 `safeImageUrl(url, kind)`(장소: 같은 서버 `/api/place-photo`와 `upload.wikimedia.org/wikipedia/commons/`만, 숙소: https Rakuten 호스트만, 프로필: https만), 출처 링크는 `safeCreditUrl()`(Commons 파일 페이지·Google 기여자 페이지만).

### 8.5 지도
`loadMapConfig()` → `ensureMapLibrary()`(일정이 생길 때 로드):
- `osm`: Leaflet 1.9.4(unpkg, SRI 검증), 타일 `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`, 표기 "© OpenStreetMap contributors". `renderLeafletItinMap()`.
- `google`: 기존 Google Maps JS 경로 `renderGoogleItinMap()`. 좌표 없는 곳만 렌더당 최대 15곳 브라우저 지오코딩, `REQUEST_DENIED`면 그 세션에서 중단.
- 좌표는 `buildCoordIndex()`가 `day.places`, `placeCoords`, 추천·맛집 카드에서 모은다. 좌표가 없으면 지도를 숨기고 짧은 안내(`#itinMapNote`)를 보여준다. 일자별 경로선은 `DAY_COLORS`.

### 8.6 다국어
`I18N` 사전(ko/en/ja, 각 468개 키, 세 언어 키 집합 동일) + `t()` + `applyLanguage(lang)`(data-i18n / -placeholder / -title / -aria 처리, 카드·패널·출처 줄 다시 그리기). 선택 언어는 localStorage `travelLang`(저장소가 막힌 브라우저에서도 부팅되도록 try/catch).

브랜드: `BRAND_NAME`('Tabimaru') + 사전 키 `brand-subtitle`. `applyBrand()`가 `[data-brand]` 글자, `document.title`("Tabimaru — <부제>"), meta description(`meta-description`)을 언어에 맞춰 바꾸고, 내보내기·인쇄·공유 제목은 `shareTitle()`("Tabimaru 여행 일정" 등)을 쓴다. `index.html`의 기본 `<title>`과 `manifest.webmanifest`의 `name`은 "Tabimaru — AI 일본 여행 플래너", `short_name`은 "Tabimaru"다.

### 8.7 상태·저장
전역 변수로 상태를 관리한다(`cityCatalog`, `currentItineraryData`, `selectedFlight`, `selectedStay`, `latestDestList`, `itinMap` 등). 되돌리기/다시 실행은 `_itinHistory`(30단계). 클라이언트 캐시 `getCachedOrFetch()`(5분).

localStorage 키:

| 키 | 용도 |
|---|---|
| `travelLang` | 화면 언어 |
| `travelWishlist` | 찜 목록 |
| `travelSearchHistory` | 검색 기록(최대 20건) |
| `travelPreferences` | 선호도 학습(도시/테마/항공사/숙소 지역) |
| `travelChecklist` | 여행 준비 체크리스트 |
| `placeMemos` | 장소 메모 |

localStorage는 출처(도메인) 단위라, 도메인을 바꾸면 사용자의 찜·메모·체크리스트가 옮겨지지 않는다.

### 8.8 여행자 편의 기능
- 일정 내보내기(텍스트/마크다운/Web Share, PDF 인쇄)
- 체크리스트(6개 그룹 25+ 항목, 진행률)
- 긴급 정보: `EMERGENCY_CONTACTS` 한 필드(`tel`)에서 표시 번호와 `tel:` 링크를 함께 만든다(`telLink()`). 번호 출처는 코드 주석에 기록.
- 일본어 회화(7개 카테고리, 클립보드 복사·검색), 날씨 예보(`/api/weather`), 일정 분석(하루 3곳 초과·충돌·중복 경고), 장소 메모, 환율 칩

---

## 9. 데이터 흐름

### 9.1 통합 플랜 생성
```
[추천+AI일정 통합 생성] 클릭 (첫 화면에서는 호출 없음)
  |
  +-- POST /api/travel-plan -> buildTravelPlan()
  |    +-- recommendDestinations()
  |    |    +-- free:   buildCuratedPicks() + attachPlaceMedia()  -> recommendationInfo curated
  |    |    +-- google: fetchGoogleAttractions() (googleApiFetch: 서킷·일일 상한·캐시)
  |    |               -> 실패 시 buildCuratedPicks()             -> recommendationInfo fallback + reasonCode
  |    +-- mergeSelectedDestinations() (사용자 선택 + 추천, 사진·좌표 유지)
  |    +-- useAi면 createItineraryWithGemini() -> createItineraryWithOpenAI() -> createItinerary()
  |    |    -> itineraryInfo (ai | rule + reasonCode)
  |    +-- 추천 맛집: google 모드 fetchRecommendedFoods(), 비면 curatedFoodsForCities() -> foodsInfo
  |    +-- attachItineraryCoordinates() -> itinerary[].places, placeCoords
  |
  +-- 프론트엔드: 추천 카드(사진·저작자) / 추천 맛집 / 일정 타임라인 / 지도(OSM)
  +-- 같은 조건으로 /api/flights, /api/foods, /api/stays 각 1회 + /api/weather
```

### 9.2 AI 채팅 플랜
```
사용자 자연어 입력 -> POST /api/ai-travel-chat -> buildTravelChatPlan()
  +-- parseTravelChatInput() (규칙) + Gemini/OpenAI 해석 -> normalizeTravelChatParsed()
  +-- 모르는 지역: ensureDynamicCityProfile()
  +-- recommendDestinations() 로 원하는 장소 후보
  -> 프론트엔드: 조건 반영(syncCityDependents: 숙소/맛집 도시·도착 공항·투어·날씨) -> runPlan() (9.1과 동일)
```

### 9.3 항공권 검색
```
POST /api/flights
  +-- TRAVELPAYOUTS_TOKEN 있으면 fetchTravelpayoutsFlights()
  |    +-- 요청 날짜 그대로(prices_for_dates, 왕복은 one_way=false)
  |    +-- 비면 같은/이웃 달 캐시에서 출발일 ±7일(왕복 체류 ±3일) -> dateMatch 'nearby'
  +-- 결과 없음/실패 -> flightCandidates() 예시 데이터 (sourceInfo mock + reasonCode)
  +-- applyFlightFilters() -> rankFlights()
```

---

## 10. 외부 API 연동

| 서비스 | 용도 | 비고 |
|---|---|---|
| Wikimedia Commons / Wikidata / Wikipedia | 무료 모드 장소·도시·음식 장르 사진, 좌표, en/ja 이름 | 실행 중에는 호출하지 않음. `scripts/build-place-images.js`가 미리 `assets/place-images.json`을 만든다(User-Agent `TabimaruBot/0.1`, 초당 4건 이하, 응답 캐시). 자유 라이선스만, 카드에 저작자·라이선스 표시. Wikidata 이름은 CC0 |
| OpenStreetMap 타일 + Leaflet | 기본 지도 | 브라우저가 직접 불러옴. "© OpenStreetMap contributors" 표기, OSMF 타일 사용 정책 준수 |
| open-meteo | 날씨 예보, 무료 지오코딩 | 키 없음, `User-Agent: TabimaruBot/0.1 (+저장소 주소)`, 캐시(예보 30분, 지오코딩 24시간). CC BY 4.0(날씨 위젯·패널 하단에 출처 링크 표기), 무료 API는 비상업적 사용·하루 10,000회 이하 |
| open.er-api → frankfurter | 환율 | 키 없음, 같은 User-Agent, 8초 타임아웃, 12시간 갱신. ExchangeRate-API 공개 엔드포인트는 "Rates By Exchange Rate API" 링크 표기가 필요하고(환율 칩 안에 표기) 받은 환율의 재배포는 금지 |
| Travelpayouts (Aviasales Data API v3) | 항공권 캐시 가격 | `TRAVELPAYOUTS_TOKEN`, 30분 캐시, 토큰은 로그에서 가림 |
| Rakuten Travel | 숙소(VacantHotelSearch → SimpleHotelSearch) | `RAKUTEN_APP_ID`·`RAKUTEN_ACCESS_KEY`, Referer/Origin 헤더는 운영 도메인 고정 |
| Gemini API | 일정 생성, 채팅 해석, 경로 교통비 | 헤더 키, JSON 응답 스키마 |
| OpenAI API | Gemini 실패 시 대체 | Responses API + JSON Schema |
| Google Places API (New) / Geocoding / Directions | google 모드에서만 | 서버 키, `googleApiFetch()` 비용 가드 |
| Google Maps JavaScript API | `MAP_PROVIDER=google`일 때만 | 브라우저 키(리퍼러 제한) |
| Supabase | 플랜 저장(선택) | service role 키(서버 전용), 8초 타임아웃, 연결 확인 캐시 |
| Google·Naver·Kakao OAuth | 로그인 | `OAUTH_BASE_URL` 기준 콜백 |
| Klook 위젯 | 투어 | 실패 시 바로가기 링크 |

---

## 11. 테스트

`npm test`(= `node test_all.js`). 외부 패키지와 실제 네트워크를 쓰지 않는다.

- **격리**: 서버 자식 프로세스의 벤더 키 환경변수를 모두 `''`로 넘긴다(`loadEnvFile()`은 정의되지 않은 변수만 `.env`로 채우므로 `.env` 값이 쓰이지 않음). `PLACES_API_BASE`·`GEOCODE_API_BASE`·`GEMINI_API_BASE`·`TRAVELPAYOUTS_API_BASE`·`RAKUTEN_API_BASE`는 가짜 벤더 서버(`tests/support/mock-vendor.js`, 포트 3205)를 가리킨다. 그 밖의 외부 호출은 `node --require tests/support/net-guard.js`가 가짜 서버로 돌리고, 알려지지 않은 호스트는 실패로 기록한다.
- **단계**(서버 포트 13581을 설정만 바꿔 다시 띄움):
  1. 무료 모드 — 기존 기능 테스트, `/api/health`의 `app: tabimaru`·`brand`, 시작 로그, 큐레이션 + 위키미디어 사진(`place-images.json`과 대조), `recommendationInfo` curated, Google 가짜 서버 호출 0회, maps-config·rakuten-config·place-photo·진단 토큰, 보안 헤더, 경로 조작, CSRF 정확 일치, 레이트리밋
  1b. 무료 모드 사진·이름 — 제공되는 manifest·`<title>`, 아마미 카드의 도시 대표 사진(`scope: city`, `cities.amami`와 같음, 도시 좌표 없음, `/api/destinations`도 같음), 내장 맛집의 음식 장르 사진(`scope: genre`, `foodGenres[장르]`와 같음), 예시 사진이 없는 장르(향토요리)는 비워 둠, 모든 사진의 scope·Commons 주소·파일 페이지·라이선스, 하코다테·삿포로·아마미 en/ja 응답의 `labels` 사용·한국어 잔여 0·현지화 이름의 지도 좌표
  2. `TRUST_PROXY=1` — 모든 도시 날씨(가짜 응답에 예상 밖 필드·HTML·잘못된 날짜를 섞어도 날짜·숫자만 남는지), 외부 호출 User-Agent `TabimaruBot/0.1`, 모르는 도시 404, `X-Forwarded-For` 첫 항목 위조로 한도 우회 불가
  3. google 모드 + 403 BILLING_DISABLED — 대체 목록 + `GOOGLE_BILLING_DISABLED`, 이후 `GOOGLE_CIRCUIT_OPEN`이며 추가 호출 0회, 사진 이름 검증, 진단 probe 토큰
  4. google 모드 정상 — 사진 URL은 `/api/place-photo`로 시작, 프록시가 이미지·캐시 헤더 전달, Gemini `MAX_TOKENS` → `AI_TRUNCATED`, 정상 JSON → `ai`, 빈 일정 → `AI_INVALID_OUTPUT`, Places 캐시, Travelpayouts live
  5. `GOOGLE_DAILY_CALL_LIMIT=3` — 상한 이상 호출 없음, 이후 `GOOGLE_QUOTA_EXCEEDED`
  6. Geocoding HTTP 200 + `REQUEST_DENIED`(결제) → `GOOGLE_BILLING_DISABLED`·차단, 예전 `GOOGLE_MAPS_API_KEY`는 브라우저로 나가지 않음
  7. OAuth·AI 오류 — 네이버·카카오·Google `/api/auth/<공급자>`의 302 + `oauth_state` 쿠키(HttpOnly, SameSite=Lax, Path=/api/auth, Max-Age=600, 값 = Location의 `state`). 콜백에 쿠키 없음·다른 쿠키·`state` 없음·다른 공급자의 `state`·통과한 `state` 재사용 → `/?authError=invalid_state`, 실패한 콜백은 `sid`를 주지 않음. 쿠키 = `state`이면 검사를 통과해 토큰 교환을 한 번 시도하고 state 쿠키를 지움(가짜 서버가 토큰 교환을 401로 거절하므로 `data/users.json`에 쓰지 않음). 가짜 Gemini가 400 + 오류 원문으로 답해도 `travel-plan`·`ai-travel-chat`의 `aiErrors` 항목은 `provider`·`code`·`reasonCode`·`action`만 담고 응답 본문에 원문이 없음
- **정적 검사**: 모든 JS `node --check`, I18N(ko에 ja/en 전용 키 없음, ja 값에 한국어 없음), CSS 변수 자기참조·순환·미정의, 브랜드(`APP_BRAND`/`APP_ID`/`BRAND_NAME`/User-Agent, index.html `<title>`, manifest `name`·`short_name`, 부제 ko/en/ja, `public/*`에 예전 이름 없음, package.json `name`, README 제목·저장소 링크, 문서 머리글), 도메인에 묶인 값(localStorage 키, `sid` 쿠키, Rakuten Referer, OAuth 콜백 경로, `start_url`, Render 서비스 이름), `render.yaml`·`.env.example`·README의 환경변수 목록과 Google 상한 기본값.
- **첫 화면**: `tests/support/browser-sandbox.js`가 index.html 요소로 최소 DOM을 만들고 `app.js`를 실제로 부팅한다(fetch 기록, 가상 타이머, `click()`은 실제 리스너 호출). 부팅 중 유료 엔드포인트·자동 클릭·Google Maps JS 로드가 없어야 하고, 부팅 뒤 `document.title`이 "Tabimaru — AI 일본 여행 플래너"여야 하며(언어를 바꾸면 en/ja 표기로), 긴급 연락처의 표시 번호와 `tel:` 번호가 모두 같아야 한다. [추천+AI일정 통합 생성]을 두 번 눌러도 `/api/travel-plan` 1회 + 항공·맛집·숙소 각 1회(`/api/dest-search` 0회)여야 하고, 카드의 `<img>`·위키미디어 출처 링크, 도시 대표 사진 표시, 일정이 생긴 뒤의 Leaflet(SRI) 로드, 빈 일정 안내 문구도 확인한다. 같은 흉내 안에서 `safeImageUrl`·`safeCreditUrl`·`cardPhoto`·`photoCreditHtml`과 `renderCards`(추천·맛집)에 악성 값(`javascript:`·`data:`, 비슷한 호스트, userinfo, `/\`·`//` 우회, http Commons, Commons가 아닌 경로, 따옴표·HTML이 든 이름·저작자·라이선스)을 넣어, `src`는 Commons나 `/api/place-photo`, 출처 `href`는 `commons.wikimedia.org/wiki/`나 Google `/maps/contrib/`로만 시작하고 끼워 넣은 태그·`on*` 속성이 없는지 본다.
- 각 단계 끝에서 모든 응답 본문·헤더에 서버 키·토큰이 없는지, 서버 로그에 크래시가 없는지 확인한다.
- CI: `.github/workflows/ci.yml`(push·PR, Node 20).

---

## 12. OAuth 로그인 및 일정 저장

### 12.1 소셜 로그인 (Naver / Kakao / Google)
- OAuth 2.0 Authorization Code Flow, `/api/auth/{provider}`(리다이렉트) + `/api/auth/{provider}/callback`
- 세 공급자 모두 `state`를 발급해 `oauth_state` 쿠키에 묶고, 콜백에서 쿠키·서버 기록과 대조한다(없거나 틀리거나 재사용하면 `/?authError=invalid_state`). 설정이 없는 공급자는 한국어 안내(JSON)로 답하고, 화면은 설정된 공급자의 버튼만 보여 준다.
- 세션: HMAC 서명 쿠키(`sid=uuid.signature`) + 서버 메모리 Map, 7일 만료
- 사용자 정보: `data/users.json`

### 12.2 일정 저장/불러오기
| 엔드포인트 | 메서드 | 설명 |
|---|---|---|
| `/api/my-plans/save` | POST | 현재 일정 저장(로그인 필요) |
| `/api/my-plans/list` | GET | 내 저장 일정 목록 |
| `/api/my-plans/load?id=` | GET | 특정 일정 불러오기 |
| `/api/my-plans/delete?id=` | DELETE | 일정 삭제 |
| `/api/auth/me` | GET | 현재 로그인 상태 |
| `/api/auth/logout` | POST | 로그아웃 |
| `/api/auth/providers` | GET | 설정된 OAuth 공급자 |

- 저장 데이터: 일정 + 항공권 + 숙소 + 폼 값, `data/saved_plans.json`(userId로 필터)
- Render 무료 플랜은 재시작·재배포 때 디스크와 메모리가 초기화되어, 세션·사용자·내 일정이 사라질 수 있다(영구 저장소 이전은 아직 결정하지 않음).

---

## 13. 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2025-03 | 초기 문서 작성, `/api/dest-search`, 추천 카드 삭제, UI 폴리시, `JP_KO_AREA`, 일정 타임라인 CSS |
| 2026-03 | 드래그앤드롭 수정, 맛집 검색 지역 편향·한국 주소 필터, `PRIMARY_TYPE_KO` + `localizeType()`, 멀티턴 AI 채팅, `CITY_ALIASES` 확장 |
| 2026-03 | 여행자 편의 기능 v2(내보내기, 체크리스트, 긴급정보, 회화, 날씨, 일정 분석, 메모, 환율) |
| 2026-03 | AI 모델 서킷 브레이커, 입력 검증·레이트 리밋·요청 크기 제한, OAuth state, XSS 방지, Undo/Redo, 클라이언트 캐시, 계절 추천, 경로 최적화, 예산 분석 |
| 2026-03 | 숙소 Rakuten Travel 연동(좌표 기반), Klook 위젯 8초 타임아웃 + 바로가기 |
| 2026-03-17 | v3: fetchWithRetry, 보안 헤더, 세션 타임아웃, PDF 내보내기, 지도 경로선, 찜, 검색 기록, 선호도 학습, 다국어 |
| 2026-03 | 소셜 로그인(Naver/Kakao/Google) + 일정 저장/불러오기 |
| 2026-09 | 디자인 톤 개편(머스타드 accent), 맛집 영업시간 표시 |
| 2026-10-01 | **무료 공급자 모드 기본화**(`PLACES_PROVIDER=free`, `MAP_PROVIDER=osm`): 내장 큐레이션 + 위키미디어 사진(`assets/place-images.json`), OpenStreetMap + Leaflet. Google은 선택(키 두 개 분리, `googleApiFetch()` 서킷·일일 상한·캐시, 사진 프록시) |
| 2026-10-01 | 출처 표시 객체(`recommendationInfo`·`itineraryInfo`·`foodsInfo`·`sourceInfo`), Gemini JSON 스키마·잘림 감지, Amadeus·`/api/rakuten-config` 삭제, 항공 가까운 날짜 조회, 숙소 5점 평점, 모든 도시 날씨, CSRF 정확 일치·프록시 IP·본문 한도·Secure 쿠키, 첫 화면 자동 호출 중단, i18n 정리, 긴급 번호 검증 |
| 2026-10-01 | 테스트 격리(가짜 벤더 서버·네트워크 차단·DOM 흉내), `npm test`, GitHub Actions CI, 문서 갱신 |
| 2026-10-01 | **이름 변경: JapanTravel Suite → Tabimaru**(저장소 `wsxc94/tabimaru-japan-travel-planner`, `APP_ID`·health `app` = `tabimaru`, User-Agent `TabimaruBot/0.1`). 운영 주소·Render 서비스 이름·OAuth 콜백·`sid`·localStorage 키·Supabase 테이블은 그대로 |
| 2026-10-01 | 도시 대표 사진(`cities`, `scope: city`)·음식 장르 예시 사진(`foodGenres`, `scope: genre`), 위키데이터 en/ja 이름(`labels`), 온천 사진 검토 규칙(`--review-baths`), Google 호출 상한 검색·사진 분리(하루 30·월 900), 사진 바이트 캐시, Cloudflare 프록시 IP 처리와 `[proxy]` 로그, OAuth state 쿠키 바인딩, 날씨 응답 정리, 지어낸 채움 장소 대신 "자유 일정" |
