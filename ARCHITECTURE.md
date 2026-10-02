# Tabimaru — Architecture & Feature Documentation

> Tabimaru — AI 일본 여행 플래너(예전 이름 JapanTravel Suite)의 구조, 기능, 알고리즘, 데이터 흐름을 기록합니다. 코드 위치는 줄 번호 대신 **함수 이름**으로 적습니다(줄 번호는 금방 어긋남).
> 마지막 갱신: 2026-10-01 (이름 변경, 도시·음식 장르 사진, en/ja 이름, 무료 공급자 모드, 출처 표시, Google 비용 가드, 테스트 격리, **의도 계약·AI 일정 후처리·직접 배치 통합·초안 보관·와시 톤/다크 모드** 반영)
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
14. [수동 점검 체크리스트](#14-수동-점검-체크리스트)

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
    styles.css                # 전체 스타일(:root 토큰 — 와시 크림·히노마루 주홍·쪽빛, OS 다크 설정이면 다크 토큰. 반응형 @media는 파일 끝)
    manifest.webmanifest      # PWA 매니페스트
    favicon.svg               # 파비콘
  assets/place-images.json    # 무료 모드 장소·도시·음식 장르 사진, 좌표, en/ja 이름(Wikimedia, 서버가 시작할 때 읽음)
  scripts/build-place-images.js  # 위 파일 생성기(Wikipedia·Wikidata·Commons, 키 없음)
  assets/city-places.json     # 도시 주변 실제 명소(위키데이터 QID·좌표·ko/en/ja 이름·Commons 사진). 큐레이션이 모자란 도시를 채움
  scripts/build-city-places.js   # 위 파일 생성기(Wikidata SPARQL wikibase:around + Commons, 키 없음, 초당 1건 이하)
  scripts/ja-names.js            # 일본어 이름 → 한국어(국립국어원 표기법: 가나 읽기·헵번식 영어 이름)·헵번식 영어. 생성기가 씀
  scripts/prompt-matrix.mjs   # 대표 요청 16개 의도 점검표(실행 중인 서버 + 실제 AI, 수동 실행)
  test_all.js                 # 통합 테스트(npm test)
  tests/support/              # 가짜 벤더 서버, 네트워크 차단 프리로드, DOM 흉내
  _test_api.js                # 수동 점검 스크립트(개발용)
  deploy/DEPLOY.md            # 배포 가이드
  deploy/supabase/schema.sql  # Supabase 스키마(재실행 가능)
  .github/workflows/ci.yml    # CI(push·PR마다 npm test, Node 20)
  .github/workflows/keepalive.yml  # 3일마다 운영 /api/keepalive(Supabase 무료 프로젝트 일시 중지 방지, 비밀값 없음)
  .env.example                # 환경변수 예시
  CLAUDE.md                   # AI 어시스턴트 작업 규칙(바꾸면 안 되는 값, 수정 후 확인 절차)
  render.yaml                 # Render 설정(환경변수 이름 목록)
  data/                       # 로컬 파일 저장(users.json, Supabase가 없을 때의 saved_plans.json). Git 제외, TABIMARU_DATA_DIR로 바꿈
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
| AI 일정 생성 | Gemini(기본 `gemini-2.5-flash`) → OpenAI 호환(OpenAI `gpt-4o-mini` 또는 Groq `openai/gpt-oss-120b` + 대체 모델) → 규칙 기반 |
| AI 채팅 해석 | `AI_CHAT_PROVIDER_ORDER` 순서(기본 Gemini → OpenAI 호환, Groq 운영은 `openai,gemini`) → 규칙 기반 |
| 날씨·지오코딩 | open-meteo(무료, 키 없음, CC BY 4.0, 비상업적 사용 조건) |
| 환율 | open.er-api(ExchangeRate-API, 출처 표기 필요) → Frankfurter v2(무료, ECB 기준) → `FX_*` 고정값 → 대략값, 12시간마다 갱신 |
| 저장 | 로그인 사용자 "내 일정": Supabase(PostgreSQL, `travel_plans`) — 설정이 없으면(로컬 개발) `TABIMARU_DATA_DIR`(기본 `data/`)의 JSON 파일. 로그인 세션은 서버에 저장하지 않는 서명 쿠키 |

---

## 3. 서버 아키텍처

### 3.1 초기화 흐름
1. `.env` 로드(`loadEnvFile()`) — 이미 정의된 환경변수는 덮어쓰지 않는다. `envValue()`는 공백뿐인 값을 미설정으로 본다.
2. 브랜드 상수 `APP_BRAND`(`Tabimaru`)/`APP_TAGLINE`(ko/en/ja)/`APP_ID`(`tabimaru`)/`APP_REPO_URL`, 외부 공개 API용 `OUTBOUND_USER_AGENT`(`TabimaruBot/0.1 (+<저장소 주소>)`), 공급자 모드(`PLACES_PROVIDER`, `MAP_PROVIDER`), 키·주소 설정.
3. `CITY_DATA` 구성(기본 도시 + `JAPAN_CITY_PROFILES`로 만든 도시 = 62곳), 별칭(`CITY_ALIASES`). 프로필의 `sightX: null`은 비운 자리(실제 장소가 아닌 설명형 이름을 지운 곳).
   도시 이름 찾기는 `cityMentionHits()` 하나로: `CITY_ALIASES`(키·한글·`CITY_NAME_I18N` en/ja·한국어 표기 변형 `koSpellingVariants`·이웃 이름 `CITY_EXTRA_ALIASES`)와 랜드마크 낱말의 위치를 찾고, 더 긴 이름과 겹치는 짧은 이름('Kitakyushu'의 'kyushu', '기타다이토'의 '이토')은 버린다. 로마자는 단어 경계, 두 글자 이하 한글은 앞에 한글이 붙지 않을 때만. 짧은 장소 이름('高山'·'日光'·'이세'·'ise')은 `MUST_ATTRACTIONS[].contextAliases`로 뒤에 조사·일수가 올 때만. 도시 없이 장소 이름만 말하면(`cityOfNamedPlace`) 그 추가 명소·도시 주변 실제 명소의 도시로 정하고, 다른 도시 장소 이름 속 도시 이름·대표 명소 별칭은 지운 글(`maskOtherCityPlaceNames`·`maskMustInsidePlaceNames`)로 판단한다. 도시 주변 실제 명소의 '말로 찾기' 이름(`generatedMatchNames`)은 다른 도시 큐레이션·도시 이름과 같은 이름, 두 도시 이상에 있는 이름, 두 글자 이하(두 글자 한자 이름은 뒤에 조사·일수가 올 때만), 6자 미만 한 단어 로마자를 뺀다. AI 채팅 해석이 데이터 속 장소를 `unsupportedPlaces`로 돌려주면(`knownPlaceForToken`) 꼭 갈 곳으로 옮기고, 메시지에 도시가 없으면 그 장소의 도시로 바꾼다.
3b. `loadCityPlaces()`로 `assets/city-places.json`을 읽어 도시마다 큐레이션과 겹치지 않는 실제 명소를 `EXTRA_PLACES` 뒤에 `generated: true`로 붙이고, 도시 명소가 3곳보다 적은 도시는 그 앞쪽 명소로 3곳까지 채운다(파일이 없으면 큐레이션만). 사진·좌표·en/ja 이름은 `PLACE_IMAGES`를 읽은 뒤 `place-images.json`에 없는 이름만 보탠다. 로그: `[city-places] 도시 주변 실제 명소 N곳(M개 도시), 큐레이션 명소 사진·좌표 K곳 로드`.
4. `loadPlaceImages()`로 `assets/place-images.json`의 `places`·`cities`·`foodGenres`를 읽는다(파일이 없으면 사진 없이 동작). 로그: `[place-images] 195곳 로드 (사진 185곳, 좌표 192곳, en/ja 이름 195곳), 도시 사진 58곳, 음식 장르 사진 23개`.
5. 환율 갱신(`refreshFxRate()` 즉시 1회 + 12시간 간격).
6. HTTP 서버 시작 — 시작 로그 `Tabimaru — AI 일본 여행 플래너 server running at http://localhost:<PORT> (places=…, map=…)`. Supabase가 설정돼 있으면 곧바로(기다리지 않고) `supabaseStatus({force:true})`로 연결을 한 번 확인하고 10분마다 다시 확인한다(`/api/health`의 `supabaseReachable`). 데이터 폴더는 `TABIMARU_DATA_DIR`(없으면 `<저장소>/data`).

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
- `assets/city-places.json`(version 1, `scripts/build-city-places.js`): `{ version, generatedAt, source, cities: { "<cityKey>": { center, radiusKm, curatedHalfDay, few, places: [{ name, nameFrom: fix|kowiki|ko|translit|ja, aliases?(도시 이름을 앞에 붙이기 전 이름), en, ja, wikidata, lat, lng, distKm, sitelinks, kind, category, stayMin, bestTime, indoor?, fullDay?, area, areaEn?, areaJa?, image, filePage, license, artist }] } }, media: { "<cityKey>|<큐레이션 이름>": place-images.json places 항목 모양 } }`. `loadCityPlaces()`는 QID와 일본 안 좌표가 없는 항목을 버리고, 이름이 큐레이션과 겹치는 항목도 버린다. 도시 명소 풀 순서는 highlights → 대표 명소 → 추가 명소 → 도시 주변 명소. `buildCuratedPicks()`(무료 모드 추천 카드)는 도시 명소가 `limit`보다 적으면 도시 주변 명소를 뒤에 붙인다. `few` 도시의 일정은 `tips` 맨 앞에 `RULE_PLAN_TEXT[lang].tips.fewSights`.
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
- **보안 헤더**: API는 `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`; 정적 파일은 `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`. 정적 파일 캐시: 약한 `ETag`(크기-수정 시각)·`Last-Modified`로 `304`를 돌려주고, html/js/css는 `Cache-Control: no-cache`(배포 직후에도 새 파일을 받음), 아이콘·매니페스트·이미지는 `public, max-age=86400`. CSP는 아직 없다(추가 시 unpkg.com, `tile.openstreetmap.org`, `upload.wikimedia.org`, Rakuten 이미지, Travelpayouts/Klook 스크립트를 허용해야 함).
- **세션**: 서버에 저장하지 않는 서명 쿠키(12.1). `sid=<base64url(JSON)>.<base64url(HMAC-SHA256)>`, HttpOnly, SameSite=Lax, Path=/, HTTPS면 Secure, 30일. 검증은 `timingSafeEqual`, 3500자 초과·모양 이상·만료는 로그아웃 상태. 서명 키 `SESSION_KEY` = `HMAC-SHA256(scrypt(SESSION_SECRET, 'tabimaru-sid-v1'), 'allow:' + 허용 목록 키)`(시작할 때 한 번). `SESSION_SECRET`이 없거나 약하면(32자 미만·서로 다른 글자 10개 미만) 그 값을 쓰지 않고 실행마다 임의 값(경고 로그, `/api/health`의 `sessionSecretConfigured: false`, 약하면 `sessionSecretWeak: true`).
- **로그인 허용 목록**(선택, `ALLOWED_LOGINS`): `u_…`·`공급자:id`·공급자가 확인한 이메일(Google `verified_email`, Kakao `is_email_verified`; Naver 이메일은 보지 않음). 목록 밖이면 콜백이 `302 /?authError=not_allowed`(sid 없음, users.json 기록 없음, 로그에 계정 정보 없음). 목록이 서명 키에 섞여 있어 목록을 바꾸면 예전 sid가 모두 끊긴다. `/api/health`의 `loginRestricted`.
- **OAuth**: Google·Naver·Kakao 모두 `issueOauthState()`가 `state`를 공급자별 서버 기록과 `oauth_state` 쿠키(HttpOnly, SameSite=Lax, Path=/api/auth, 10분)에 함께 묶는다. 콜백의 `consumeOauthState()`가 쿠키와 timingSafeEqual로 대조하고 한 번만 쓰게 한다(로그인 CSRF 방지). OAuth 설정값은 `envValue()`로 읽어 공백뿐인 값은 미설정으로 본다.
- **비밀값**: 어떤 응답에도 서버 키·토큰이 나가지 않는다. Gemini 키는 URL이 아니라 `x-goog-api-key` 헤더로 보낸다.
- **원시 오류**: 응답의 `aiErrors`는 `publicAiErrors()`로 `{provider, code, reasonCode, action}`만 남긴다. 공급자 원문 메시지는 서버 로그에만.
- **외부 값 정리**: open-meteo `daily`는 `sanitizeWeatherDaily()`가 날짜(`YYYY-MM-DD`)와 숫자(모르면 `null`) 4개 필드만 남기고(최대 16일), 모르는 필드는 버린다.

---

## 4. API 엔드포인트

### 4.1 헬스/진단
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/health` | 서버 상태 `{ok, app:'tabimaru', brand:'Tabimaru', providers:{places, map}, ai, supabaseConfigured, supabaseReachable, supabaseCheck, sessionSecretConfigured, sessionSecretWeak, loginRestricted, …}`. 외부 호출 없음. `supabaseReachable`·`supabaseCheck`는 마지막 확인 결과(서버 시작 직후 한 번 + 10분마다 `supabaseStatus({force:true})` = `runSupabaseCheck()`: `GET travel_plans?select=id&limit=1`로 주소·키·표를 함께 확인, 저장소 요청·keepalive 결과로도 갱신, 미설정이면 `null`). `supabaseCheck`: `ok`·`auth_error`(401·403)·`schema_error`(404)·`unreachable`(연결 실패·5xx), `supabaseReachable` = `supabaseCheck === 'ok'`. 요청 내용 때문에 생긴 4xx는 상태를 바꾸지 않음. 나머지 값은 참·거짓만 |
| GET | `/api/keepalive` | `supabaseKeepalive()`: `runSupabaseCheck()`로 실제 조회(성공은 10분, 실패는 15초 캐시, 동시 요청은 하나로 합침) → `{ok:true, supabase:'ok'\|'unreachable'\|'auth_error'\|'schema_error'\|'off', checkedAt}`, `Cache-Control: no-store`. 비밀값·행 데이터 없음. GET이라 CSRF 출처 검사와 무관(curl 그대로) |
| GET | `/api/ai-diagnostics` | 설정 진단(비밀값 없음). `?probe=1`은 `x-diagnostics-token` 헤더가 `DIAGNOSTICS_TOKEN`과 맞을 때만 실제 호출(Gemini·OpenAI·Places 각 1회) |

### 4.2 도시·지도·날씨·환율
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/cities` | `{cities: [{key, label, airport}]}` |
| GET | `/api/maps-config` | `{provider:'osm'}` 또는 `{provider:'google', key:<브라우저 키>}` |
| GET | `/api/place-photo?name=&w=` | google 모드 사진 프록시(이름 정규식 `^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$`, w 100..1600). 잘못된 이름 400, 발급하지 않은 이름 404, 무료 모드 404 |
| GET | `/api/weather?city=<cityKey>` | 모든 도시. `resolveCityCoordsForInput()` → open-meteo 16일 예보(`forecast_days=16`, 좌표별 30분 캐시, `sanitizeWeatherDaily()`로 날짜·숫자만). 화면은 여행 날짜가 예보 범위 밖이면 안내한다. 위치를 모르면 404(다른 도시로 대신하지 않음), 날씨 서버 실패 502 |
| GET | `/api/fx-rate` | `jpyToKrw`, `usdToKrw`, … + `source`(`live`/`env`/`approximate`), `provider`, `approximate`, `stale` |

### 4.3 여행 플랜(핵심)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/travel-plan` | **통합 플랜**: 추천 + AI 일정 + 추천 맛집 |
| POST | `/api/destinations` | 여행지 추천만(`recommendDestinations()`, `sourceInfo` 포함) |
| POST | `/api/itinerary` | 규칙 기반 일정만 |
| POST | `/api/dest-search` | 여행지 탐색(`recommendDestinations()` 재사용, `sourceInfo`) |
| POST | `/api/ai-travel-chat` | 자연어 조건 해석 + 선택 장소 제안 |
| POST | `/api/route-cost` | 경로 교통비(장소 이름 문자열 최대 12개). AI를 부르지 않는다(2026-10-02, 예전 Gemini 추측은 실측처럼 보이고 하루 한도를 썼음). (google 모드) Directions 거리 → 그 밖에는 좌표(`place-images.json`·큐레이션) 직선거리 × 1.3으로 요금·시간 추정. 모든 구간 `estimated: true`, 응답 `source: 'distance_estimate'`·`estimated: true`. 구간마다 `mapsUrl` = Google 지도 대중교통 길찾기(`googleTransitDirUrl()`: `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&travelmode=transit`, 좌표를 알면 `lat,lng`, 모르면 `이름 + 일본어 도시 이름 + Japan`; 대중교통 모드는 경유지를 받지 않아 구간마다 하나). 화면 `routeCostHtml()`은 `safeMapsDirUrl()`(그 주소 형태만)을 거친 링크만 [🗺 대중교통 경로]로 그리고, "예상 합계"와 안내 문구(`route-maps-hint`)를 붙인다 |

#### `/api/travel-plan` 요청
```json
{ "city": "osaka", "theme": "mixed|foodie|culture|shopping|nature", "budget": "low|mid|high",
  "days": 4, "startDate": "2026-10-15", "lang": "ko|en|ja", "useAi": true,
  "request": "오사카 2일 교토 2일, 유니버셜은 꼭, 도톤보리는 빼고",
  "mustVisit": ["유니버셜 스튜디오 재팬"], "excludedPlaces": ["도톤보리"], "foodWishes": ["라멘"],
  "_picks": [], "_routeCities": ["오사카", "교토"], "_regionDayPlan": [{ "cityLabel": "오사카", "days": 2, "unit": "day" }],
  "_specialPrefs": { "lateStart": true, "maxPlacesPerDay": 2, "removeShopping": true },
  "flight": {}, "stay": {} }
```
의도 필드(`request`·`mustVisit`·`excludedPlaces`·`foodWishes`·`_picks`)의 한도와 뜻은 [6.4 의도 계약](#64-의도-계약)에 있다.

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
  "itineraryInfo": { "kind": "ai|rule", "provider": "gemini|openai|rule_planner", "reasonCode": null,
                     "postProcess": { "mealsMoved": 0, "sightsRelabeled": 1, "allDayMerged": 0, "mustInserted": 1,
                                      "trimmed": 0, "shifted": 3, "repeatsReplaced": 0, "unverified": 0 },
                     "missingMustVisit": [] },
  "tips": [], "summary": "…", "aiNote": "", "aiErrors": [],
  "budgetBreakdown": { "meal": {}, "transport": {}, "activity": {}, "days": 4, "budgetTier": "mid" }
}
```
`source`·`recommendationSource` 같은 예전 필드는 호환을 위해 그대로 두고, 의미는 `*Info` 객체로 판단한다. `lang`이 en/ja이면 카드의 `name`은 현지화된 이름, `nameKo`는 원래 한국어 이름이다(`city` 같은 내부 키는 한국어 그대로). `photoCredit.scope`는 `place`(그 장소 사진) · `city`(도시 대표 사진) · `genre`(음식 장르 예시 사진)이다(3.4).

#### 출처 정보 객체 `{ kind, provider, reasonCode }`
- `kind`: `live`(실시간 공급자) · `ai` · `curated`(무료 모드 정상 결과) · `fallback`(공급자 실패로 무료 데이터 사용) · `mock`(예시 데이터) · `rule`(규칙 기반 일정)
- `reasonCode`: `GOOGLE_KEY_MISSING`, `GOOGLE_BILLING_DISABLED`, `GOOGLE_PERMISSION_DENIED`, `GOOGLE_QUOTA_EXCEEDED`, `GOOGLE_ERROR`, `GOOGLE_CIRCUIT_OPEN`, `NO_RESULTS`, `AI_KEY_MISSING`, `AI_TRUNCATED`, `AI_INVALID_OUTPUT`, `AI_ERROR`, `AI_BUSY`, `AI_DAILY_LIMIT`, `PROVIDER_UNAVAILABLE`, `NO_LIVE_DATA`, `NO_GENRE_MATCH`(`/api/foods` 전용)
- `itineraryInfo`: `useAi`가 없으면 `{rule, reasonCode:null}`, AI 키가 없으면 `AI_KEY_MISSING`, 그 밖에는 첫 AI 오류의 `reasonCode`(분당 429·503은 `AI_BUSY`, 시도한 모델이 모두 하루 무료 한도(quotaId `…PerDay…`)로 막히면 `AI_DAILY_LIMIT` + `aiErrors[].retryAfterSec` = 태평양 시간 자정까지 남은 초, 400 등은 `AI_ERROR`). 빈 AI 일정은 절대 `ai`로 표시하지 않는다. `postProcess`는 후처리를 거친 일정(AI 일정, 꼭 갈 곳이 있는 규칙 일정)에만, `missingMustVisit`(문자열 배열)은 늘 붙는다.
- `aiErrors[]`: `{provider, code, reasonCode, action}` + 모델 쿨다운 중이면 `retryAfterSec`(초). `code`는 `quota_or_rate_limit`·`overloaded`·`invalid_key`·`output_truncated`·`invalid_model_response` 등(`classifyAiError()`).

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
| POST/GET/DELETE | `/api/my-plans/save · list · load · delete` | 로그인 사용자의 내 일정. Supabase가 설정돼 있으면 `travel_plans`(`source='my-plans'`), 없으면 `TABIMARU_DATA_DIR/saved_plans.json`. 행 대응·실패 동작은 12.2 |
| POST | `/api/travel-plan/save` | 로그인 필요. Supabase upsert(`user_label` = 세션 userId). 저장소가 없거나 연결 불가면 503(AI 일정 생성 전에 확인). 새 행이면 사용자당 50행 상한(409 `PLAN_LIMIT`), 플랜은 `storeSafeValue()`로 정리하고 400KB 상한(413). 저장소가 내용을 거절하면 400 `INVALID_PLAN`. 응답 `Cache-Control: no-store`(list·get도) |
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
일정 생성: Gemini (1순위) -> OpenAI 호환(OpenAI·Groq) (2순위) -> 규칙 기반 (3순위)
채팅 해석: AI_CHAT_PROVIDER_ORDER 순서(기본 gemini,openai) -> 규칙 기반
```
- **OpenAI 호환 공급자**(OpenAI·Groq 같은 Responses API): 주소 `OPENAI_BASE_URL`(기본 `https://api.openai.com/v1`, https만·로컬 주소만 http, 끝의 `/` 제거, `normalizeOpenAiBaseUrl()`). 비어 있고 `OPENAI_API_KEY` 없이 `GROQ_API_KEY`만 있으면 `https://api.groq.com/openai/v1`. 키는 **주소에 맞는 것만** 보낸다: Groq 주소(`OPENAI_IS_GROQ`, 호스트 `*.groq.com`)에는 `GROQ_API_KEY`(없으면 `OPENAI_API_KEY`에 든 `gsk_` 키), 그 밖에는 `OPENAI_API_KEY`(`gsk_` 모양이면 보내지 않음). 맞지 않으면 키 없음으로 보고 경고(값은 찍지 않음). 실제로 쓰는 변수 이름은 `OPENAI_KEY_SOURCE` → health `ai.openaiKeySource`. 주 모델 `OPENAI_MODEL`(기본 OpenAI `gpt-4o-mini`, Groq `openai/gpt-oss-120b`), 대체 모델 `OPENAI_FALLBACK_MODELS`(쉼표 구분, `normalizeOpenAiModelName()`: `/` 허용, 키 모양 값·틀린 이름은 버리고 개수만 로그, 최대 4개) → `OPENAI_MODEL_CHAIN`.
- `callOpenAiResponses(body, { timeoutMs, retrySingle, accept })`: 모델마다 `openAiPostOnce()`(본문 읽기까지 제한 시간 안)로 `POST <OPENAI_BASE_URL>/responses`. 요청에 `OPENAI_REASONING_EFFORT`가 있으면 `reasoning: { effort }`, `OPENAI_MAX_OUTPUT_TOKENS`(0 = 상한 없음, 최소 256)가 있으면 `max_output_tokens = min(요청값, 상한)`. 다음 모델로 넘기는 경우: 429·413·404·400·5xx·시간 초과·`status: incomplete`(잘림 `max_output_tokens` → `AI_TRUNCATED`)·JSON 아님·`accept()`가 `AiOutputError`를 던짐(일정은 `normalizeAiItinerary()`: 날짜 수 부족 등). 바로 끝내는 경우: 401·403·DNS/연결 오류. 체인 전체 `OPENAI_TOTAL_BUDGET_MS`(40초). 대체 모델이 없고 `retrySingle`이면 같은 모델로 한 번 더(잘린 응답은 다시 보내지 않음). 끝까지 실패하면 429·503 → 잘림 → 시간 초과(`aiTimeout`) → 마지막 오류 순서로 하나를 던진다. 출처 표시는 `sourceInfo('ai', 'openai')` 그대로이고, 로그·`aiErrors[].provider`는 `OPENAI_PROVIDER_LABEL`(`Groq`|`OpenAI`). 일정 `itinerarySource`는 `openai_itinerary_v1 (<모델>)`, 채팅 `aiModel`은 답한 모델.
- 채팅 해석 공급자 순서 `AI_CHAT_PROVIDER_ORDER`(쉼표 구분 `gemini`·`openai`, 모르는 이름은 버림, 빠진 공급자는 기본 순서대로 뒤에 붙임). 지난 대화는 문자열 `content`로 보낸다(Responses API는 assistant 메시지의 `input_text` 조각을 거절). `/api/health`의 `ai.openaiBaseHost`·`ai.openaiProvider`·`ai.openaiKeySource`·`ai.openaiModelChain`·`ai.chatProviderOrder`, `/api/ai-diagnostics`의 `providers.openai`(`baseHost`·`providerLabel`·`keySource`·`modelChain`·`reasoningEffort`·`maxOutputTokens`·`totalBudgetMs`·`chatProviderOrder`). probe는 `GET <OPENAI_BASE_URL>/models/<모델>`(Groq 이름의 `/`는 경로 구분자로 둠).
- Gemini 모델 순서(`GEMINI_MODEL_CHAIN`): `GEMINI_API_MODEL`(기본 `gemini-2.5-flash`) → `GEMINI_DEFAULT_FALLBACK_MODELS`(2026-10-01 실측: `gemini-2.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-3-flash-preview` → `gemini-3.5-flash-lite` → `gemini-2.5-flash` → `gemini-3.6-flash` → `gemini-flash-latest`, 주 모델과 겹치면 제외). `GEMINI_FALLBACK_MODELS`(쉼표 구분, `none` = 주 모델만)가 있으면 대체 목록을 통째로 바꾼다(`parseGeminiFallbackModels()`: 공백·중복·`models/` 접두어 정리, 소문자·숫자·`. _ -`가 아닌 이름은 버리고 개수만 로그, 최대 9개).
- `callGeminiGenerateContent()`가 다음 모델로 넘기는 경우: 429·503(+ 5xx 500/502/504)·404·시간 초과·키 문제가 아닌 400(요청 설정 거절)·생각 토큰이 출력 한도를 다 쓴 `MAX_TOKENS`(`usageMetadata.thoughtsTokenCount > 0`). 바로 오류로 끝내는 경우: 키·권한·지역 400(`GEMINI_ACCOUNT_ERROR_RE`: `API_KEY_INVALID` 등)·401·403·DNS/연결 오류·생각 없이 잘린 `MAX_TOKENS`(다른 모델 한도를 쓰지 않게 호출한 쪽이 `AI_TRUNCATED`).
- 시간: 호출 하나는 `geminiPostOnce()`가 본문 읽기까지 `min(AI_REQUEST_TIMEOUT_MS 또는 opts.timeoutMs, 남은 예산)`으로 끊고, 체인 전체는 `GEMINI_TOTAL_BUDGET_MS`(기본 40초). 남은 시간이 `GEMINI_MIN_ATTEMPT_MS`(2.5초)보다 짧으면 다음 모델을 시작하지 않는다. 시간 초과로 쉬게 하는 것은 제 시간(호출 하나의 제한 시간)을 다 받은 모델만(남은 예산 때문에 짧게 끊은 호출은 쉬게 하지 않음). `opts.totalBudgetMs`로 예산을 줄일 수 있다(늘리지는 않음). 한도·과부하 응답 없이 시간만 다 쓰면 `geminiTimeout` → `classifyAiError()`의 `timeout` → `AI_BUSY`.
- 모델별 생각 설정(`geminiThinkingStyle()`): `gemini-3.5-flash-lite`·`gemini-flash-lite-latest`는 `thinkingLevel: 'minimal'`(thinkingBudget을 400으로 거절), 2.5 계열·flash 이름은 `thinkingBudget: 0`(pro는 최소 128), 그 밖(gemma 등)은 보내지 않음. 목록에 없는 모델이 400을 내면 다른 형식으로 한 번 더 보내고, 받아들인 형식을 실행 중 기억한다(`_geminiThinkingLearned`).
- `recordModelFailure()` / `isModelAvailable()` / `getAvailableModels()`: 실패 모델을 60초 쿨다운(연속 실패 시 최대 5분까지 두 배씩). 하루 한도는 태평양 시간 자정까지(최대 6시간), 404는 하루(`MODEL_GONE_COOLDOWN_MS`). 전부 쿨다운이면 가장 오래된 1개만 재시도(404 모델은 다른 모델이 없을 때만).
- `/api/health`의 `ai.geminiModelChain`·`ai.geminiFallbackSource`(`default`|`env`)·`ai.geminiTotalBudgetMs`·`ai.geminiCoolingModels`(`[{ model, secondsLeft }]`만, `geminiCoolingModels()`). `/api/ai-diagnostics`의 `providers.gemini`에도 같은 값(`modelChain`·`fallbackSource`·`totalBudgetMs`·`coolingModels`).
- 키는 `x-goog-api-key` 헤더, 주소는 `${GEMINI_API_BASE}/v1beta/models/<model>:generateContent`.

### 6.2 일정 생성
**규칙 기반** `createItinerary()`: 도시별 관광지 풀, 다도시 순회 시 `allocateDaysByCities()`로 일수 배분, 오전/오후/저녁 배치, 항공편 시간(첫날 도착·마지막 날 출발)과 `specialPrefs`(늦은 출발, 실내, 휴식일 등) 반영.

**Gemini** `createItineraryWithGemini()`:
- 프롬프트 = `AI_SYSTEM_MESSAGE`(블록 형식·시간대 토큰 규칙, 6.4) + `aiIntentInstructions()`(요청 원문·꼭 갈 곳·제외·dayPlan·foodWishes가 있을 때만 한 줄씩) + 출력 모양 예시 + 정확한 일수 + `Constraints:` 목록(`aiConstraintLines()`) + `Context:` JSON(`buildAiContext()`).
- `buildAiContext()`의 `picks`는 `{id, name, area, category, bestTime, stayMin, city, allDay}`, `foods`는 경로 도시마다 8곳(전체 16곳, `city` 포함), 그 밖에 `maxPlacesPerDay`, 있을 때만 `userRequest`·`mustVisit[{name, area, allDay}]`·`excluded`·`dayPlan[{day, date, city, transferFrom}]`(도시 2곳 이상)·`foodWishes`·`constraints`. 원본 `specialPrefs` 객체는 넣지 않는다(조건은 문장으로).
- `responseMimeType: application/json` + `responseSchema`(`GEMINI_ITINERARY_SCHEMA`, `properties.itinerary`가 있음 — 테스트의 가짜 Gemini는 이것으로 일정 요청과 채팅 요청을 가른다).
- `maxOutputTokens` 4096(6일 이상 8192), 생각 토큰은 끔(모델별 형식은 6.1), temperature 0.28, 호출 하나의 타임아웃 30초(체인 전체는 `GEMINI_TOTAL_BUDGET_MS`).
- `finishReason: MAX_TOKENS` → `AI_TRUNCATED`, 후보 없음·차단·STOP 외 → `AI_INVALID_OUTPUT`. 429·503(과부하·high demand)은 `classifyAiError()`가 `AI_BUSY`로 분류한다. 429 본문에 하루 한도 quotaId(`PerDay`)가 있으면 그 모델을 태평양 시간 자정까지(최대 6시간) 쉬게 하고, 모든 시도가 하루 한도면 `daily_quota` → `AI_DAILY_LIMIT`.

**OpenAI** `createItineraryWithOpenAI()`: 같은 시스템 문장·`Constraints:`·컨텍스트, Responses API + `json_schema`(strict), `max_output_tokens` 동일, `status: incomplete`면 잘림으로 처리.

**정규화** `normalizeAiItinerary()` / `normalizeAiBlock()`: 문자열·객체 블록을 모두 클라이언트 형식 문자열로 바꾸고 날짜는 서버가 계산한다. 시각이 하나뿐인 블록("09:00 센소지")은 끝 = 시작 + 후보 `stayMin`(없으면 90분). 일수가 모자라거나 관광 블록(오전·오후·종일)이 없는 날이 있으면 `AI_INVALID_OUTPUT` → 규칙 기반 일정(아침·점심·저녁만 있는 날도 빈 날, 항공편 때문에 관광 시간이 거의 없는 첫날·마지막 날은 예외).

**후처리** `postProcessItinerary(itinerary, opts)`(결정적, AI 일정 전체 + 규칙 일정은 꼭 갈 곳 넣기만 `ruleMode`): 
1. 식사·관광 분류 — 저녁·점심 칸의 관광·자유 일정은 시각을 지킨 채 오전/오후로(`sightsRelabeled`), 오전·오후 칸의 맛집(foods 이름과 일치할 때만)은 15시 전 점심·뒤 저녁(`mealsMoved`). 식사는 시간대마다 하루 하나.
2. 종일 병합 — 하루가 다 드는 후보(allDay)가 반나절 칸에 있거나 6시간 이상이면 그날 관광을 '종일' 하나로(식사는 남김, `allDayMerged`).
3. 제외 — `excludedPlaces`('디즈니' → 디즈니랜드·디즈니씨)와 쇼핑 제외일 때의 쇼핑 장소를 쓰지 않은 후보로 바꾸거나 지움.
4. 꼭 갈 곳 — 첫 자유 일정 칸 → 관광이 가장 적은 날의 빈 시간(15:00 우선) → 관광 2곳 이상인 날의 마지막 관광 순. allDay인 곳은 중간 날의 '종일'. 못 넣으면 `missingMustVisit`(`mustInserted`).
5. 제약 — 시작 시각(늦은 시작 10:30·`startTimeMin`·첫날 도착+90분)보다 이른 블록은 미루고, 마지막 날 출발−120분을 넘는 블록은 당기거나 지움, 겹침은 연쇄로 미룸(`shifted`·`trimmed`), 하루 관광 수 제한(꼭 갈 곳 우선), 시간대 토큰을 실제 시각에 다시 맞춤.
6. 반복 — 여러 날 되풀이된 후보(picks·꼭 갈 곳)는 아직 쓰지 않은 후보로(`repeatsReplaced`). 식사·자유 일정은 대상이 아니다.
7. 도시 이동 날의 첫 줄을 규칙 일정과 같은 이동 문구로(도시 중심이 250km보다 멀면 '비행기 이동'), 관광이 하나도 없는 날은 남은 후보나 자유 일정으로 채움.
   (c-2, 식사·관광 분류 바로 뒤) 후보 이름을 다르게 적은 관광 블록(일본어 표기·번역·음역·띄어쓰기·줄인 이름: '釜淵ノ滝'·'おび히로動物園'·'아사히교')은 같은 후보의 한·영·일 표기와 같거나 글자(한글·한자·가나)가 60% 이상 겹치면 그 후보 이름으로 되돌리고(`namesRestored`), 후보·꼭 갈 곳·경로 도시 내장 장소 어디에도 없는 이름은 아직 안 쓴 후보로 바꾸거나 지움(`unverified`로 셈). 식사 칸의 '자유 식사'는 그 도시 맛집으로, 바꿀 후보가 없는 반복 관광은 지움.
- 알려진 한계: `dayPlan`과 다른 도시의 장소(오사카 날의 후시미 이나리)는 아직 고치지 않는다. 후보가 아닌 관광(예: picks에 없는 금각사)이 반복되면 그대로 남는다.

**일정 블록 형식**(클라이언트 렌더러가 읽는 모양):
```json
{ "day": 1, "date": "2026-10-15",
  "blocks": ["오전(09:00-11:00): 센소지 (아사쿠사)", "오후(13:00-15:00): 메이지 신궁 (하라주쿠)", "저녁(18:00-19:30): …"],
  "places": [{ "name": "센소지", "period": "오전", "lat": 35.714, "lng": 139.796 }] }
```
`attachItineraryCoordinates()`가 블록의 장소 이름을 추천 카드·`place-images.json` 좌표와 맞춰 `places`와 `placeCoords`를 만든다(지도용).

### 6.3 여행 채팅 해석
- **규칙 기반** `parseTravelChatInput()`(Gemini가 한도로 실패할 때 실제로 쓰이는 경로): 부정된 구절("디즈니랜드는 빼고", "쇼핑은 빼줘", `NEG_SHOPPING_RE`)을 지운 글(`stripNegatedPhrases()`)로 도시·꼭 갈 곳을 찾고, 빼 달라고 한 대표 명소·도시 명소는 `excludedPlaces`로. 날짜(N월 M일·10月15日·Oct 15·M/D·크리스마스, 지난 날짜는 다음 해), 일수(`parseExplicitDaysFromText()`: 날짜·'N일차'를 먼저 지우고 N박M일·범위(큰 값)·日間·nights+1·일주일), 도시별 일수(`extractRegionDayPlanFromText()`, 데이터가 없는 지역 '나라 1일'은 `unsupportedPlaces` + 전체 일수에 더함 — 'N일' 표현이 도시별 일수보다 많을 때만), `parseSpecialPrefsFromText()`(늦은 시작·`startTimeMin`, 도착 `arrivalTime`·`firstDayShort`, 출발 `departureTime`(시각 없는 '오전 비행기' = 11:00), 하루 N곳, 실내, 적게 걷기, 아이 동반, 이동 최소 등).
- **AI**: `parseTravelChatWithGemini()` — `responseSchema: geminiChatSchema()`(cityKey enum = 내장 도시 키, required cityKey·days·theme), `CHAT_PARSE_RULES` + 오늘 날짜, maxOutputTokens 2048, thinkingBudget 0(잘리면 `AI_TRUNCATED`). `parseTravelChatWithOpenAI()`(Responses API + JSON Schema). `normalizeTravelChatParsed()`가 규칙 결과와 병합하면서 AI 값을 실제로 쓴 필드 수(`_aiFieldCount`)를 센다: 0이면 `source: rule_based`, `sourceInfo {rule, reasonCode: AI_INVALID_OUTPUT}`(키가 없으면 `AI_KEY_MISSING`, 한도면 `AI_BUSY`). 부정된 테마(쇼핑은 빼줘 + AI shopping)는 거부하고 `removeShopping`, 메시지에서 찾은 도시(`_cityFromMessage`)가 AI와 다르면 메시지를 믿고, 폼 도시는 경로에 넣지 않는다. 출발일은 메시지에 날짜 말이 있을 때만 AI 값을 쓴다.
- **답변** `buildTravelChatReply(parsed, lang)`: `CHAT_REPLY_TEXT` ko/en/ja. 도시·일수·출발일(일수를 말하지 않았으면 가정했다고 밝힘) → 꼭 갈 곳 → 제외 → 테마 → 맛집 → 조건 → 미지원 지역(당일치기 데이터가 있으면 대체 문장) → 도시가 2곳 이상일 때만 지역별 분배 → 도착 공항 → '일정을 만드는 중이에요…'. en/ja에서는 장소 이름을 `localizePlaceLabel()`로 바꾼다.
- 모르는 지역이면 `ensureDynamicCityProfile()`이 동적 도시(`custom_…`)를 만든다: 좌표는 google 모드면 Geocoding, 아니면 open-meteo 지오코딩.
- **멀티턴**: 클라이언트가 `history`와 `prevParsed`를 보내면(`sanitizeChatHistory()`·`sanitizePrevParsed()`), 폼 대신 이전 조건을 기본값으로 쓰고 `applyFollowUpRules()`가 이번 메시지에서 분명히 바꾼 것만 덮어쓴다: "대신·바꿔"가 있을 때만 도시 변경, "X 하루 더/줄여"(`parseCityDayDeltas()`)는 이전 분배에 더하고 전체 일수도 1~10일 안에서 같이 바꿈, 이전 꼭 갈 곳·제외·조건·출발일 유지. 응답의 `parsed`에서는 `_`로 시작하는 내부 필드를 뺀다(`publicChatParsed()`).

### 6.4 의도 계약
말로 한 요청이 일정까지 그대로 전달되도록 클라이언트·서버·테스트가 같은 이름을 쓴다.

**`POST /api/ai-travel-chat` 요청**
| 필드 | 한도 | 뜻 |
|---|---|---|
| `message` | — | 요청 원문 |
| `context` | — | 폼 값 `{city, theme, budget, days, startDate}` |
| `lang` | `ko`·`en`·`ja` | 답변(`reply`)·이유(`reasons`) 언어 |
| `history` | 배열(아니면 400), 마지막 12개, 각 500자 | `[{role, content}]`, role은 `user` 또는 `assistant` |
| `prevParsed` | 객체(아니면 400), JSON 4KB 이하(넘으면 400), 알려진 필드만 | 직전 응답의 `parsed` |

**응답**: `parsed`(`cityKey`·`cityLabel`·`days`·`startDate`·`theme`·`budget`·`wantedPlaces`·`excludedPlaces`·`unsupportedPlaces`·`foodKeyword`·`routeCities`·`regionDayPlan`·`specialPrefs`·`arrivalTime`·`departureTime`·`startTimeMin`('HH:MM' 또는 '')·`reasons`·`isFollowUp`·`labels`), `reply`, `selectedDestinations`, `sourceInfo {kind:'ai'|'rule', provider, reasonCode}`, `aiErrors`.
- `parsed.labels {wantedPlaces[], excludedPlaces[], unsupportedPlaces[], foodKeyword}`: 화면 언어 표기(원래 배열과 같은 순서·길이). 화면의 의도 칩은 요청한 언어와 지금 언어가 같을 때 이 표기를 쓰고, `/api/travel-plan`에는 원래(한국어) 이름을 보낸다.
- `parsed.specialPrefs`는 꺼진(false) 조건을 빼고 보낸다(`prevParsed` 4KB 한도). 저예산이면 `lowBudget: true`.
- AI 해석 정규화(`normalizeTravelChatParsed()`): AI가 낸 꼭 갈 곳은 표준 이름으로 바꾸고(`canonicalWantedName()`), 음식(`isFoodWord()` → 메시지에 있을 때만 `foodKeyword`로)·일반 표현('명소')·금액·숫자와 메시지(후속이면 이전 조건)에 근거가 없는 이름은 버린다. 메시지에 일수가 있으면 규칙 해석 일수가 AI 값보다 우선이고(주말 같은 표현만 AI 값), AI가 켠 조건·도착/출발/시작 시각은 메시지에 근거 낱말이 있을 때만 받는다(`PREF_EVIDENCE_RE`). 'A랑 B는 빼고'·'skip A and B'는 이름마다 제외(`findExcludedPlaceNames()`).
- 후속 대화의 전체 일수 증감(`parseGlobalDayDelta()`: '하루 더 늘려줘'·'이틀 더'·'add one more day'·'하루 줄여줘')은 도시가 하나면 그 도시에, 여럿이면 마지막 도시에서 더하고 뺀다. 일수를 말하지 않은 후속 대화는 이전 일수·분배를 지킨다.

**`POST /api/travel-plan` 의도 필드**(`sanitizePlanIntent()`, 배열이 아니면 무시)
| 필드 | 한도 | 서버가 하는 일 |
|---|---|---|
| `request` | 500자 사용(스키마 maxLength 600, 넘으면 400) | 프롬프트 `userRequest` |
| `mustVisit` | 문자열 8개(각 60자) | `resolveMustVisit()`: 후보 → 대표 명소 별칭 → 도시 명소 → 쓴 이름 그대로(데이터에 없으면 합성 후보). 후처리가 꼭 넣고, 못 넣으면 `missingMustVisit` |
| `excludedPlaces` | 문자열 8개 | `resolveExcludedNameKeys()`/`isExcludedPlace()`: 추천 카드·AI 후보·규칙 일정·후처리 모두에서 뺀다 |
| `foodWishes` | 문자열 3개 | 프롬프트 `foodWishes`(저녁 맛집 고를 때) |
| `_picks` | 객체 8개(이름 80자) | 채팅이 고른 장소(`selectedDestinations`)를 후보 앞에 |
| `_routeCities`·`_regionDayPlan`·`_specialPrefs` | — | 경로 도시·도시별 일수(→ `dayPlan`)·조건(→ `Constraints:` 문장) |

**응답**: `itineraryInfo.postProcess{mealsMoved, sightsRelabeled, allDayMerged, mustInserted, trimmed, shifted, repeatsReplaced, unverified}`(계약 8개) + 진단용 `mealsAdded`·`sightsAdded`·`indoorSwapped`, `itineraryInfo.missingMustVisit[]`, AI가 바쁘면 `itineraryInfo {kind:'rule', reasonCode:'AI_BUSY'}`, 하루 한도를 다 썼으면 `reasonCode:'AI_DAILY_LIMIT'`.

**후보와 후처리에서 지키는 의도**(AI·규칙 공통):
- 요청하지 않은 하루짜리(USJ·디즈니·나라·노보리베츠 등)는 4일 이하 일정의 후보·규칙 일정에서 빼고 추천 카드로만 남긴다(5일 이상은 4일마다 1곳, 요청한 하루짜리 수만큼 줄임, 저예산이면 테마파크 제외). AI가 후보에도 꼭 갈 곳에도 없는 하루짜리를 넣으면 후처리 (d-0)이 지우고 빈 낮을 남은 후보로 채운다.
- '오타루 당일치기를 하루'는 그 꼭 갈 곳을 당일치기(09:00-18:00)로, 먼 당일치기 날 저녁은 '<지역> 현지 식사'. 저녁이 좋은 꼭 갈 곳(도톤보리 등 추천 시작 17시 이후)은 저녁 빈 시간으로 옮긴다.
- 실내 위주(`indoorFocus`)면 실내 후보(`EXTRA_PLACES`의 박물관·수족관·전망대 등)를 앞에 두고, 하루 바깥 관광은 1곳까지. 저예산(`lowBudget`)이면 유료 테마파크·전망대·수족관은 요청하지 않았으면 무료 명소로 바꾼다.
- AI 일정의 빈 저녁·빈 낮은 맛집(먹고 싶은 것 우선)·남은 후보로 채운다(관광 목표 하루 3곳, 여유·적게 걷기·아이 동반은 2곳).

**블록 형식과 시간대(period) 토큰** — 모든 언어에서 토큰은 한국어 그대로, 화면이 `tPeriod()`로 번역:
- `'<period>(HH:MM-HH:MM): <이름> (<지역>)'`, period ∈ 오전·오후·종일·아침·점심·저녁. 그 밖의 줄(도시 이동 안내 등)은 시각 없는 안내 줄.
- 오전 = 12시 전에 시작하는 관광, 오후 = 12시 이후 관광(저녁 시간대 관광도 실제 시각과 함께 오후, 예: `오후(19:00-21:00): 우메다 스카이 빌딩 (우메다)`), 종일 = 하루가 다 드는 곳(allDay 후보)만.
- 점심·저녁(아침)은 **식사 전용**이고 시간대마다 하루 하나. 식사 판정 단어 `FOOD_WORD_RE`(서버·클라이언트 같은 정의)는 저녁·점심 칸이 식사인지 볼 때만 쓰고, 오전·오후 칸을 식사로 옮기는 것은 맛집(foods) 이름과 일치할 때만(카페·산책 오판 방지).

**클라이언트 배치 계약**(`public/app.js`):
- `SLOT_DEFS` = `morning`(오전 09:00-12:00) · `afternoon`(오후 13:00-17:00) · `allday`(종일 09:00-18:00) · `breakfast`(아침 08:00-09:30) · `lunch`(점심 12:00-13:30) · `dinner`(저녁 18:00-20:00), 각 `kind` dest/food. 블록 문자열은 `formatPlanBlock()` 하나로만 만든다.
- `placeBlock({day, slotKey, name, area, kind, mode:'add'|'move', from:{day, blockIndex}, window:{start, end}, silent})` 하나로 끌어 놓기·추가 창·[옮기기]·터치 끌기를 모두 처리한다: 종류가 다르면 `kind-mismatch`(변화 없음), 식사 칸은 1개(식사→식사 이동은 맞바꿈, 그 밖에는 바꿀지 확인), 같은 날 같은 이름은 확인, 삽입은 시작 시각 순(같으면 아침<오전<종일<점심<오후<저녁), 같은 시간대의 다른 날로 옮기면 시각 유지. 성공하면 `userEdited`.
- 여행지 시간 겹침은 모든 경로에서 `fitSightTime()`이 본다(그날의 오전·오후·종일 여행지, 자유 일정·식사 제외): 반나절 칸 안에 60분 이상 빈 시간이 있으면 그 시간으로 넣고(토스트에 실제 시각), 없거나 종일 칸이면 `confirm-time-overlap`으로 겹치는 장소·시각을 밝혀 묻는다(취소하면 변화 없음, 추가 창은 열어 둠). 받아들인 겹침은 '확인할 점'에 `alert-time-overlap`으로 남는다. `window`는 '🌙 저녁 이후' 칸처럼 기본 시각 대신 쓸 시간 창(`nightDropWindow()`).
- 생성 중 편집 보호: 직접 고칠 때마다 `itinEditSeq`가 늘고, `runPlan()`은 시작할 때 값과 응답 때 값을 비교해 그 사이에 고쳤으면 `confirm-overwrite-during-build`로 다시 묻는다(취소하면 고친 일정 유지 + 추천만 갱신, `regen-kept-edits`). 말로 한 요청은 채팅 해석 전 값을 넘긴다.
- 예산 단계: 숨은 `#budget`(`currentBudgetTier()`/`setBudgetTier()`)에 채팅 `parsed.budget`(low·mid·high)을 담아 `/api/travel-plan`·채팅 `context`·`/api/foods`·`/api/dest-search`에 싣는다. 요청 의도를 지우면 mid. 화면 합계(`#budgetSummary`)는 일정을 다시 그릴 때마다 `computeBudget()`과 같게 다시 그린다.
- 서버 일정은 `classifyServerBlocks()`(서버 후처리와 같은 규칙의 멱등 안전망)를 한 번 거쳐 그린다. 예전의 '서버 식사 블록 지우기'는 없다.
- 편집 중 초안: localStorage `tabimaru.draft.v1` 하나(`{v:1, savedAt, itinerary, latestDestList, latestRecFoodList, selectedFlight, selectedStay, form}`, 14일, 1.5M자 이하). 기존 localStorage 키 6개(8.7)는 그대로.

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
1. **여행 조건**(제목 `#section-conditions`) — 말로 요청하기(`#aiRequest` + 채팅 기록 `#aiChatLog`, [이 내용으로 만들기] `#btnAiAssist`) → 조건 칸(도시/출발일/일수/테마) → 섹션 끝의 주 버튼 하나 [일정 만들기] `#btnPlan`
2. **추천과 내 일정** — 탭(여행지/맛집, 데스크톱은 왼쪽 열 sticky·모바일은 가로 카드 줄) + 일정 조작(다시 만들기·되돌리기·[💾 저장] `#btnPlanSave`·[📋 내보내기·공유] `#btnPlanExport`, 안내 띠 `#planRegenHint`) + 일정 분석 알림 `#scheduleAlerts` + 일정 타임라인 `#planResult` + 예상 비용 + 일정 지도·날씨
3. **탐색** — 여행지·맛집 독립 검색
4. **항공권 탐색** — 편도/왕복/다구간 + 필터/정렬
5. **숙소 탐색** — 체크인아웃/인원/필터
6. **투어** — Klook 위젯(8초 안에 안 뜨면 바로가기 링크)

### 8.2 첫 화면(부팅) — 유료 API를 부르지 않는다
부팅 IIFE: `applyBrand()` → `initCityOptions()`(`/api/cities`, 실패하면 2초·5초 뒤 재시도, 끝내 실패하면 [다시 시도]와 버튼 잠금) → `renderInitialEmptyStates()`(빈 상태 카드: [일정 만들기]를 누르라는 안내) → 출발일 기본값(오늘+14일) → `loadKlookWidget()` → `loadMapConfig()`(`/api/maps-config`) → `initExchangeRateChip()`(`/api/fx-rate`) → `offerDraftRestore()`(초안이 있으면 안내 띠만). 별도로 `/api/auth/me`, `/api/auth/providers`(응답 전에는 로그인 버튼 3개를 `hidden`, 설정된 것만 보임)를 부른다. 자동 클릭·자동 검색은 없다.

[일정 만들기] `#btnPlan`(주 버튼 하나): 직접 고친 일정이면 `confirmOverwriteIfEdited()`로 먼저 묻는다. 요청칸에 새 글이 있으면 `runChatPlan()` → `/api/ai-travel-chat`(`history`·`prevParsed` 포함) → 의도 상태(`aiRequestText`·`aiWantedNames`·`aiExcludedPlaces`·`aiFoodWishes`·`aiMustVisit`)를 채우고 의도 칩(`appendIntentChips()`) → `runPlan()`. 같은 글이면 의도를 유지한 채 `runPlan()`, 빈칸이면 `resetAiIntentState()` 뒤 `runPlan()`. 도시를 직접 바꾸거나 불러오기·초안 복구를 하면 의도를 지운다.
`runPlan(extra, syncAux=true)`: `buildPlanPayload()`(의도 필드는 값이 있을 때만) → `/api/travel-plan` 1회 → 탐색>여행지 탭은 같은 추천을 재사용(`/api/dest-search` 호출 없음) → `searchFlights()`·`searchFoods()`·`searchStays()` 각 1회 + `refreshInlineWeather()`. `beginPlanBusy()`/`endPlanBusy()`가 생성·채팅·새로고침 버튼을 모두 잠그고, 요청 순번으로 오래된 응답을 버린다. 요청에는 시간 제한(`fetchWithTimeout()`, 일정·채팅 90초, 나머지 30초)이 있고, 생성 중에는 로딩 카드, 8초가 지나면 '무료 서버가 깨어나는 중' 안내, 끝나면 완료 토스트를 띄운다. `itineraryInfo.missingMustVisit`이 있으면 채팅에 'must-missing' 안내를 덧붙인다.

### 8.3 출처 안내
`SOURCE_TEXT`(ko/en/ja) + `normalizeInfo()` / `legacyInfo()`(정보 객체가 없는 예전 응답) / `describeSource()` / `renderSourceNote()`. 예: 무료 모드 추천은 "추천 여행지: 엄선한 추천 장소", AI 키 없음은 "AI가 설정되지 않아 기본 일정으로 만들었어요.", 예시 데이터는 "예시 데이터"(항공·숙소 카드에 '예시' 표시, 일정에 넣기 비활성). 일정이 `AI_BUSY`면 '1분쯤 뒤 다시'(`ai-busy-retry`), `AI_DAILY_LIMIT`이면 "오늘 AI 무료 사용량을 다 써서 기본 일정으로 만들었어요." + 한도가 다시 생기는 시각(한국 시간 오후 4~5시, `ai-daily-retry`)을 덧붙인다. 원시 오류·내부 ID는 보여주지 않는다(`friendlyError()`).

### 8.4 사진
`cardPhoto(url, name, credit)`가 실제 `<img>`를 그리고, 캡처 단계 `error` 리스너가 실패 시 첫 글자 타일로 바꾼다. 위키미디어 사진은 `photoCreditHtml()`로 "사진: 저작자 · 라이선스"를 파일 페이지 링크와 함께 표시한다(CC BY-SA 조건). `photoCredit.scope`가 `city`·`genre`이면 `photoScopeLabel()`이 앞에 "도시 대표 사진" / "음식 예시 사진"(en City photo / Example photo, ja 都市の写真 / 料理のイメージ)을 붙이고 대체 텍스트에도 넣는다. 이미지 주소는 `safeImageUrl(url, kind)`(장소: 같은 서버 `/api/place-photo`와 `upload.wikimedia.org/wikipedia/commons/`만, 숙소: https Rakuten 호스트만, 프로필: https만), 출처 링크는 `safeCreditUrl()`(Commons 파일 페이지·Google 기여자 페이지만).

### 8.5 지도
`loadMapConfig()` → `ensureMapLibrary()`(일정이 생길 때 로드):
- `osm`: Leaflet 1.9.4(unpkg, SRI 검증), 타일 `https://tile.openstreetmap.org/{z}/{x}/{y}.png`(OSMF 타일 정책에 따라 `{s}` 서브도메인 없음), 표기 "© OpenStreetMap contributors". `renderLeafletItinMap()`.
- `google`: 기존 Google Maps JS 경로 `renderGoogleItinMap()`. 좌표 없는 곳만 렌더당 최대 15곳 브라우저 지오코딩, `REQUEST_DENIED`면 그 세션에서 중단.
- 좌표는 `buildCoordIndex()`가 `day.places`, `placeCoords`, 추천·맛집 카드에서 모은다. 좌표가 없으면 지도를 숨기고 짧은 안내(`#itinMapNote`)를 보여준다. 일자별 경로선은 `DAY_COLORS`.

### 8.6 다국어
`I18N` 사전(ko/en/ja, 각 567개 키, 세 언어 키 집합 동일, 중복 키 없음) + `t()` + `applyLanguage(lang)`(data-i18n / -placeholder / -title / -aria 처리, 카드·패널·출처 줄·의도 칩 다시 그리기). 부팅 때 `applyStaticI18n()`이 ko에서도 사전 값을 적용하고, `index.html`의 기본 글자는 ko 사전 값과 같게 둔다(테스트가 비교). 일본어 글자에는 `lang="ja"`와 시스템 일본어 글꼴(`:lang(ja)`)을 쓴다. 선택 언어는 localStorage `travelLang`(저장소가 막힌 브라우저에서도 부팅되도록 try/catch).

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
| `tabimaru.draft.v1` | 편집 중 일정 초안 1개(새 키, 6.4). `renderItineraryTimeline` 뒤 500ms에 보관, 14일 안이면 다음 방문에 [이어서 편집]/[버리기] 안내 |

localStorage는 출처(도메인) 단위라, 도메인을 바꾸면 사용자의 찜·메모·체크리스트가 옮겨지지 않는다. 모든 읽기·쓰기는 try/catch로 감싸 저장소가 막힌 브라우저에서도 동작한다.

### 8.8 여행자 편의 기능
- 일정 내보내기(텍스트/마크다운/Web Share, PDF 인쇄)
- 체크리스트(6개 그룹 25+ 항목, 진행률)
- 긴급 정보: `EMERGENCY_CONTACTS` 한 필드(`tel`)에서 표시 번호와 `tel:` 링크를 함께 만든다(`telLink()`). 번호 출처는 코드 주석에 기록.
- 일본어 회화(7개 카테고리, 클립보드 복사·검색), 날씨 예보(`/api/weather`), 일정 분석(하루 3곳 초과·충돌·중복 경고 — 같은 종류는 날짜를 묶어 한 줄, `<details>`로 접힘), 장소 메모(인라인 입력, `alert`/`prompt` 없음), 환율 칩

### 8.9 일정 직접 배치
- 일정 보드(`renderItineraryTimeline()`): 하루를 시간 순서로 그린다(`itinDayLayout()`): 아침 → (찬 종일) → 오전 → 점심 → 오후 → (빈 종일) → 저녁 → 🌙 저녁 이후. 여행지 칸은 `.itin-period-zone[data-drop-type=dest][data-drop-dest-period]`(칸마다 [+ 장소 추가] `.itin-zone-add-btn`), 오후 블록 가운데 저녁 식사 시작(없으면 18:00) 뒤에 시작하는 관광은 '🌙 저녁 이후' 칸(`.itin-night-zone`, `data-drop-dest-period="night"`)에 모은다(블록 형식은 그대로 '오후(…)'). 식사 칸은 아침·점심·저녁(빈 칸 `.itin-meal-empty`·찬 칸 `.itin-slot[data-drop-meal]`, 같은 시간대 두 번째부터 `.itin-slot-extra`). '📍 여행지/🍴 맛집' 구역 머리는 없다. 찬 칸의 머리 시각은 실제 항목 범위, 빈 칸은 기본 시각, 접힌 칸은 시각 없음. 항목은 자기 시각(`.itin-slot-time`)을 보이고 `_blockIndex`로 정확히 그 블록을 가리킨다(▲▼·✕·[옮기기] `.itin-move-btn`·☰ `.drag-handle`). 첫 관광보다 앞의 안내 줄은 `.itin-plain-top`, 그 밖의 안내 줄(도시 이동 등)은 바로 앞 항목이 있는 칸 아래.
- 숙소 결과는 처음 2줄 분량(한 줄 칸 수 = 실제 grid 열 수, 최소 3장)만 보이고 [더보기] `#btnStayMore`로 2줄씩 늘린다(항공 `#btnFlightMore`와 같은 방식). 항공·숙소 카드 목록은 안쪽 세로 스크롤 상자를 두지 않는다.
- 마우스: HTML5 drag(`dragstart`가 `text/plain` + `application/x-tabimaru`, `markCompatibleZones(kind)`가 종류가 맞는 칸에만 `.drop-active`, 올린 칸 `.drop-hover`), `drop` → `clearDragState()` → `applyDropToZone()` → `placeBlock()`. 요청칸 등에 놓아도 글이 들어가지 않는다.
- 터치: Pointer Events, ☰ 손잡이를 잡았을 때만(`pointerType !== 'mouse'`). `.touch-drag-ghost`·`body.touch-dragging`, `elementFromPoint()`로 칸 판정, 화면 위·아래 72px에서 자동 스크롤, 끄는 동안에만 `touchmove` 기본 동작을 막는다. 놓으면 같은 `applyDropToZone()`.
- 드래그 없이: 카드 [+ 일정에 넣기] `.add-to-plan-btn[data-add-source=rec|recFood|destSearch|foodSearch]` → 추가 창(`#addToPlanModal`, 제목 `#modalHeading`, 날짜 `#modalDaySelect`, 시간대 `.slot-btn`, 직접 넣기면 후보 칩 `#modalPickList > .modal-pick-chip`(`.active`·이미 넣은 곳 `.is-used`) + 직접 입력 `#modalCustomName`). 창은 열 때마다 입력·선택을 비우고, 강조된 시간대(`.slot-btn.active`) = 실제로 들어갈 칸(`pendingAddSlot`). [옮기기]는 같은 창의 이동 모드.
- 편집 보호: `placeBlock`·삭제·▲▼·날짜 옮기기·일수 맞추기가 `currentItineraryData.userEdited = true`. 새로 만들기 전에는 확인을 묻고, 항공·숙소 선택이 바뀌면 `regenerateAfterTripChange()`가 다시 만들지 않고 고정 블록(✈·🏨)만 다시 그린 뒤 `#planRegenHint`를 띄운다. 출발일·일수를 일정과 다르게 바꾸면 `#tripChangeBanner`(날짜만 옮기기·일수 맞추기·새로 만들기).
- 키보드·스크린리더: 창·패널은 `role=dialog`·`aria-modal`·`aria-labelledby`, Esc로 가장 위 하나를 닫고 연 버튼으로 포커스를 돌려준다. 닫힌 사이드 패널은 `inert`.

### 8.10 디자인 토큰·다크 모드
- `:root` 토큰: 바탕 `--bg-0..3`(와시 크림), 선 `--line-1..3`·입력칸 테두리 `--line-input`, 글자 `--fg-1..4`, 행동색 `--accent`(히노마루 주홍: 주 버튼·포커스 링·브랜드 점), 선택 상태 `--primary`(쪽빛 채움 + `--bg-0` 글자), `--ok`·`--warn`·`--info`, `--on-accent`, `--scrim`, `--header-bg`, 모서리 `--r-sm..xl`·`--r-pill`. 대비는 WCAG 4.5:1(입력칸 테두리 3:1) 이상으로 맞춘 값이다.
- 다크 모드: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }`와 `:root[data-theme="dark"]`에 같은 다크 값(토글 UI 없음, OS 설정을 따름). 지도 타일은 CSS 필터로 어둡게. 테스트가 밝은 `:root`의 색 토큰을 두 다크 블록이 모두 다시 정하는지 본다.
- 전역 `:focus-visible`(2px 주홍), 비활성 버튼은 회색 채움(대비 5:1 이상), 터치 기기(`pointer: coarse`)는 버튼 40px 이상·✕·[옮기기] 늘 보임.
- 브랜드 자산: favicon = 주홍 원 + 크림 토리이, manifest `background_color #fbf7f0`·`theme_color #bb3d29`, meta theme-color 밝게 `#fbf7f0`/어둡게 `#15120f`.

---

## 9. 데이터 흐름

### 9.1 통합 플랜 생성
```
[일정 만들기] 클릭 (첫 화면에서는 호출 없음; 요청칸에 새 글이 있으면 먼저 9.2)
  |
  +-- POST /api/travel-plan -> buildTravelPlan()
  |    +-- sanitizePlanIntent() (request·mustVisit·excludedPlaces·foodWishes·_picks)
  |    +-- recommendDestinations()
  |    |    +-- free:   buildCuratedPicks() + attachPlaceMedia()  -> recommendationInfo curated
  |    |    +-- google: fetchGoogleAttractions() (googleApiFetch: 서킷·일일 상한·캐시)
  |    |               -> 실패 시 buildCuratedPicks()             -> recommendationInfo fallback + reasonCode
  |    +-- mergeSelectedDestinations() (사용자 선택 + 추천, 사진·좌표 유지)
  |    +-- resolveMustVisit() / resolveExcludedNameKeys() -> 후보 정리, dayPlan(도시 2곳 이상)
  |    +-- useAi면 createItineraryWithGemini() -> createItineraryWithOpenAI() -> createItinerary()
  |    |    -> postProcessItinerary() (AI 일정 전체, 규칙 일정은 꼭 갈 곳만)
  |    |    -> itineraryInfo (ai | rule + reasonCode, postProcess, missingMustVisit)
  |    +-- 추천 맛집: google 모드 fetchRecommendedFoods(), 비면 curatedFoodsForCities() -> foodsInfo
  |    +-- attachItineraryCoordinates() -> itinerary[].places, placeCoords
  |
  +-- 프론트엔드: classifyServerBlocks() -> 추천 카드(사진·저작자) / 추천 맛집 / 일정 타임라인 / 지도(OSM) / 초안 보관
  +-- 같은 조건으로 /api/flights, /api/foods, /api/stays 각 1회 + /api/weather
```

### 9.2 AI 채팅 플랜
```
요청칸 글 + [일정 만들기] -> POST /api/ai-travel-chat {message, context, lang, history, prevParsed} -> buildTravelChatPlan()
  +-- parseTravelChatInput() (규칙) + Gemini(responseSchema)/OpenAI 해석 -> normalizeTravelChatParsed()
  +-- 후속 대화면 applyFollowUpRules()
  +-- 모르는 지역: ensureDynamicCityProfile()
  +-- recommendDestinations() 로 원하는 장소 후보(selectedDestinations, 제외한 곳은 뺌)
  +-- buildTravelChatReply(lang) + sourceInfo
  -> 프론트엔드: 조건 반영(syncCityDependents: 숙소/맛집 도시·도착 공항·투어·날씨) + 의도 칩
     -> runPlan() (9.1과 동일, 본문에 request·mustVisit·excludedPlaces·foodWishes·_picks)
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
| Wikimedia Commons / Wikidata / Wikipedia | 무료 모드 장소·도시·음식 장르 사진, 좌표, en/ja 이름 | 실행 중에는 호출하지 않음. `scripts/build-place-images.js`가 미리 `assets/place-images.json`을 만든다(User-Agent `TabimaruBot/0.1`, 초당 4건 이하, 응답 캐시). `scripts/build-city-places.js`는 query.wikidata.org SPARQL(`wikibase:around`)로 도시 주변 실제 명소를 골라 `assets/city-places.json`을 만든다(같은 User-Agent, 초당 1건 이하, 응답 캐시). 자유 라이선스만, 카드에 저작자·라이선스 표시. Wikidata 이름은 CC0 |
| OpenStreetMap 타일 + Leaflet | 기본 지도 | 브라우저가 직접 불러옴. "© OpenStreetMap contributors" 표기, OSMF 타일 사용 정책 준수 |
| open-meteo | 날씨 예보, 무료 지오코딩 | 키 없음, `User-Agent: TabimaruBot/0.1 (+저장소 주소)`, 캐시(예보 30분, 지오코딩 24시간). CC BY 4.0(날씨 위젯·패널 하단에 출처 링크 표기), 무료 API는 비상업적 사용·하루 10,000회 이하 |
| open.er-api → Frankfurter v2 | 환율 | 키 없음, 같은 User-Agent, 8초 타임아웃, 12시간 갱신. ExchangeRate-API 공개 엔드포인트는 "Rates By Exchange Rate API" 링크 표기가 필요하고(환율 칩 안에 표기) 받은 환율의 재배포는 금지. Frankfurter는 `api.frankfurter.dev/v2/rates?base=JPY&quotes=KRW,USD&providers=ecb`(옛 `api.frankfurter.app`은 301, v1은 지원 중단 예정, v2 기본값은 여러 기관 값을 섞으므로 ECB로 고정). 응답은 `[{date, base, quote, rate}]` 배열 |
| Travelpayouts (Aviasales Data API v3) | 항공권 캐시 가격 | `TRAVELPAYOUTS_TOKEN`, 30분 캐시, 토큰은 로그에서 가림 |
| Rakuten Travel | 숙소(VacantHotelSearch → SimpleHotelSearch) | `RAKUTEN_APP_ID`·`RAKUTEN_ACCESS_KEY`, Referer/Origin 헤더는 운영 도메인 고정. 약관상 크레딧 배지 필수: `index.html` 숙소 결과(`#stayCards`) 아래 `.rakuten-credit`에 제공된 텍스트 HTML("Supported by Rakuten Developers")을 고치지 않고 그대로 둔다(webservice.rakuten.co.jp/guide/credit) |
| Gemini API | 일정 생성, 채팅 해석(`AI_CHAT_PROVIDER_ORDER` 순서) | 헤더 키, JSON 응답 스키마. 경로 교통비에는 쓰지 않는다(2026-10-02) |
| OpenAI 호환 API(OpenAI·Groq) | 일정은 Gemini 실패 시 대체, 채팅 해석은 `AI_CHAT_PROVIDER_ORDER` 순서 | Responses API + strict JSON Schema. 주소 `OPENAI_BASE_URL`, 키는 주소에 맞는 것만(Groq는 `GROQ_API_KEY`), 모델 체인 `OPENAI_MODEL` + `OPENAI_FALLBACK_MODELS`. Groq 무료: 모델마다 분당 30회·하루 1,000회·분당 8천 토큰·하루 20만 토큰, 입력은 기본 보관 안 함(악용 조사 최대 30일) |
| Google Places API (New) / Geocoding / Directions | google 모드에서만 | 서버 키, `googleApiFetch()` 비용 가드 |
| Google Maps JavaScript API | `MAP_PROVIDER=google`일 때만 | 브라우저 키(리퍼러 제한) |
| Supabase | "내 일정" 저장(설정 시), `/api/travel-plan/*` | 서버 전용 키(`SUPABASE_SERVICE_ROLE_KEY`: 새 형식 `sb_secret_…`은 `apikey` 헤더만, 예전 JWT `eyJ…`일 때만 `Authorization: Bearer`도), 8초 타임아웃, 상태 확인(`runSupabaseCheck()` = `GET travel_plans?select=id&limit=1`, 5초) 캐시(정상 5분·이상 1분, 시작 직후·10분마다 갱신), keepalive 캐시(성공 10분·실패 15초). 오류 원문은 서버 로그에만(키는 가림, 상태 코드·PostgREST 코드별로 10분에 한 줄) |
| Google·Naver·Kakao OAuth | 로그인 | `OAUTH_BASE_URL` 기준 콜백 |
| Klook 위젯 | 투어 | 실패 시 바로가기 링크 |

---

## 11. 테스트

`npm test`(= `node test_all.js`). 외부 패키지와 실제 네트워크를 쓰지 않는다.

- **격리**: 서버 자식 프로세스의 벤더 키 환경변수를 모두 `''`로 넘긴다(`loadEnvFile()`은 정의되지 않은 변수만 `.env`로 채우므로 `.env` 값이 쓰이지 않음). `TABIMARU_DATA_DIR`은 늘 실행마다 새로 만든 임시 폴더(`os.tmpdir()/tabimaru-test-*`, 끝나면 지움)라 서버가 저장소의 `data/`(실제 사용자·일정 파일)에 쓰지 않고, 마지막 검사가 `data/` 파일 목록·크기·수정 시각이 그대로인지 본다. 포트는 `TABIMARU_TEST_PORT`·`TABIMARU_TEST_MOCK_PORT`로 바꿀 수 있다(기본 13581·3205). `PLACES_API_BASE`·`GEOCODE_API_BASE`·`GEMINI_API_BASE`·`TRAVELPAYOUTS_API_BASE`·`RAKUTEN_API_BASE`는 가짜 벤더 서버(`tests/support/mock-vendor.js`, 포트 3205)를 가리킨다. 그 밖의 외부 호출은 `node --require tests/support/net-guard.js`가 가짜 서버로 돌리고, 알려지지 않은 호스트는 실패로 기록한다.
- **단계**(서버 포트 13581을 설정만 바꿔 다시 띄움):
  1. 무료 모드 — 기존 기능 테스트, `/api/health`의 `app: tabimaru`·`brand`, 시작 로그, 큐레이션 + 위키미디어 사진(`place-images.json`과 대조), `recommendationInfo` curated, Google 가짜 서버 호출 0회, maps-config·rakuten-config·place-photo·진단 토큰, 보안 헤더, 경로 조작, CSRF 정확 일치, 레이트리밋
  1b. 무료 모드 사진·이름 — 제공되는 manifest·`<title>`, 아마미 카드의 도시 대표 사진(`scope: city`, `cities.amami`와 같음, 도시 좌표 없음, `/api/destinations`도 같음), 내장 맛집의 음식 장르 사진(`scope: genre`, `foodGenres[장르]`와 같음), 예시 사진이 없는 장르(향토요리)는 비워 둠, 모든 사진의 scope·Commons 주소·파일 페이지·라이선스, 하코다테·삿포로·아마미 en/ja 응답의 `labels` 사용·한국어 잔여 0·현지화 이름의 지도 좌표
  1c. 도시 주변 실제 명소 — `city-places.json` 형식(QID·일본 안 좌표·en/ja 이름·분류·시간, 사진은 Commons + 라이선스 + 저작자, 검토하지 않은 온천 사진 없음), 도시 중심 = `CITY_CENTER_COORDS`, 반경 밖 장소 없음, 도시 안 QID 중복·큐레이션 중복 없음, 반나절 명소 9곳 이상이거나 `few`, `media` 이름이 server.js에 있음, 설명형 가짜 명소가 지워짐, 구마노고도가 난키 시라하마 소속. 서버로 62개 도시 3일 규칙 일정: 다른 도시 장소 없음, 명소 없는 날은 자유 일정 + 이유 팁, `few` 도시는 팁, 나머지 도시는 자유 일정 칸 없음, en/ja 화면에 한국어 없음. 가짜 Gemini로 AI 후보(프롬프트 picks)가 그 도시 데이터 안의 장소뿐이고 3일이면 8곳 이상(관광 칸 6개)
  2. `TRUST_PROXY=1` — 환율 대체(가짜 `fx: 'erapi_down'`: open.er-api 503 → Frankfurter v2 배열을 읽고 요청 주소가 `api.frankfurter.dev/v2/rates?base=JPY&quotes=KRW,USD&providers=ecb`인지), 모든 도시 날씨(가짜 응답에 예상 밖 필드·HTML·잘못된 날짜를 섞어도 날짜·숫자만 남는지), 외부 호출 User-Agent `TabimaruBot/0.1`, 모르는 도시 404, `X-Forwarded-For` 첫 항목 위조로 한도 우회 불가
  3. google 모드 + 403 BILLING_DISABLED — 대체 목록 + `GOOGLE_BILLING_DISABLED`, 이후 `GOOGLE_CIRCUIT_OPEN`이며 추가 호출 0회, 사진 이름 검증, 진단 probe 토큰
  4. google 모드 정상 — 사진 URL은 `/api/place-photo`로 시작, 프록시가 이미지·캐시 헤더 전달, Gemini `MAX_TOKENS` → `AI_TRUNCATED`, 정상 JSON → `ai`, 빈 일정 → `AI_INVALID_OUTPUT`, Places 캐시, Travelpayouts live
  5. `GOOGLE_DAILY_CALL_LIMIT=3` — 상한 이상 호출 없음, 이후 `GOOGLE_QUOTA_EXCEEDED`
  6. Geocoding HTTP 200 + `REQUEST_DENIED`(결제) → `GOOGLE_BILLING_DISABLED`·차단, 예전 `GOOGLE_MAPS_API_KEY`는 브라우저로 나가지 않음
  7. OAuth·AI 오류 — 네이버·카카오·Google `/api/auth/<공급자>`의 302 + `oauth_state` 쿠키(HttpOnly, SameSite=Lax, Path=/api/auth, Max-Age=600, 값 = Location의 `state`). 콜백에 쿠키 없음·다른 쿠키·`state` 없음·다른 공급자의 `state`·통과한 `state` 재사용 → `/?authError=invalid_state`, 실패한 콜백은 `sid`를 주지 않음. 쿠키 = `state`이면 검사를 통과해 토큰 교환을 한 번 시도하고 state 쿠키를 지움(가짜 서버가 토큰 교환을 401로 거절하므로 로그인이 끝나지 않음. 끝까지 가는 로그인은 7b). 가짜 Gemini가 400 + 오류 원문으로 답해도 `travel-plan`·`ai-travel-chat`의 `aiErrors` 항목은 `provider`·`code`·`reasonCode`·`action`만 담고 응답 본문에 원문이 없음
  7b. 로그인 세션·내 일정(`phaseSessionsAndStorage()`, `TRUST_PROXY=1` + 요청마다 다른 X-Forwarded-For) — 가짜 OAuth `scenario.oauth = 'ok'`로 Google·Kakao·Naver 로그인을 끝까지 한다. ① 가짜 Supabase(`SUPABASE_URL = <mock>/supabase`, `sb_secret_` 키): 시작 직후 `/api/health`의 `supabaseReachable: true`·`supabaseCheck: 'ok'`·`sessionSecretConfigured: true`·`sessionSecretWeak: false`·`loginRestricted: false`, 연결 확인(`GET travel_plans?select=id&limit=1`, HEAD 없음)에 `apikey`만(Authorization 없음), `sid` 쿠키 속성(HttpOnly·Path=/·SameSite=Lax·Max-Age 2592000)과 payload(`{v,uid,p,n,img,iat,exp}`, exp − iat = 30일, 서명 = scrypt 파생 키의 HMAC-SHA256 base64url, 비밀값 그대로의 HMAC이 아님), 고정 uid(같은 계정 같은 값, `kakao:987654321` ≠ `google:987654321`), 프로필 id 없음 → `/?authError=google`, users.json은 임시 폴더에만, 쿠키 검증 21가지(위조 성공 1, 변조·다른 비밀값·만료·30일 초과·3500자 초과·base64url 아닌 글자·JSON 아님·배열·v:2·uid 없음/모양 틀림·모르는 공급자·iat > exp·예전 uuid 형식·점 3개·`xsid=` 미끼·빈 값, 미끼 뒤/앞의 진짜 sid는 통과), `__proto__`·`constructor` 키는 복사되지 않음, 로그아웃 쿠키 삭제. 내 일정: 401(세션 없음), `source` 필터(같은 사용자의 다른 행 제외), 저장 행 대응·목록 모양(`id,title,cityLabel,startDate,days,theme,savedAt`)·불러오기·같은 id 덮어쓰기(행 1개, created_at 유지)·안전하지 않은 id → 새 UUID·`2026/10/01`·`2026-02-30` → `start_date null`·`days null`·`city_key 'unknown'`, updated_at 내림차순, `my_` 모양의 남의(다른 source) 행 덮어쓰기 404, 사용자 B는 A의 일정을 목록·불러오기(404)·덮어쓰기(404, 행 그대로)·삭제(`deleted:false`) 못 함, 요청 쿼리(`plan_key`·`user_label`·`source` eq 필터, `order=updated_at.desc`, `limit=50`, 목록에 payload 열 없음, upsert `on_conflict=plan_key` + `resolution=merge-duplicates`, 삭제 `return=representation`), 모든 요청 `apikey`만, 삭제, 파일에 안 씀, keepalive `{ok,supabase:'ok',checkedAt}`·두 번째 호출은 조회 없음·행 데이터 없음. 이어서 개인 일정·travel-plan 응답 `no-store`(401·404 포함), NUL·짝 없는 서로게이트가 든 제목·라벨·data 값·키 → 200으로 정리돼 저장(이모지는 그대로, travel-plan/save도), 64단계보다 깊은 data → 400, 400KB 넘는 일정 → 413 `PLAN_TOO_LARGE`(행 없음), 50개 찬 사용자 → 새 일정 409 `PLAN_LIMIT`(덮어쓰기 허용, 목록 50개, 하나 지우면 다시 저장, travel-plan/save도 409), 가짜 Supabase `reject_post`(400 22P05) → 400 `INVALID_PLAN`(원문 없음, health는 `ok` 그대로). ② 같은 `SESSION_SECRET`으로 재시작 → 같은 쿠키로 로그인 유지·일정 유지, 비밀값 교체 → 로그아웃, 다시 로그인하면 같은 uid·같은 일정. ③ 가짜 Supabase 503 + `eyJ…` 키: `supabaseReachable: false`, Bearer도 보냄, 저장·목록·불러오기·삭제 503 `PROVIDER_UNAVAILABLE`(한국어 안내, 원문 없음), 파일에 안 씀, keepalive `unreachable`(곧바로 다시 부르면 조회 없음), 로그에 키 없음, 15초 뒤 Supabase가 돌아오면 keepalive가 다시 확인해 `ok`·health reachable true. ③-2 틀린 키(가짜 Supabase 401): health `supabaseReachable: false`·`supabaseCheck: 'auth_error'`, 내 일정 503, keepalive `auth_error`, 로그 '키가 거부됐습니다'(키 값 없음). ④ 연결 거부 + `SESSION_SECRET` 없음: `sessionSecretConfigured: false`·경고 로그, 저장 503·파일 없음. ⑤ Supabase 미설정: 파일 저장소(임시 폴더), users.json의 예전 임의 id 일정도 같은 계정이면 보임, 다른 사용자 차단, 주인 것만 삭제, keepalive `off`(Supabase 호출 0). ⑥ `ALLOWED_LOGINS`(대문자 uid·대소문자 섞인 이메일·`kakao:555`·알아볼 수 없는 항목 1개): `loginRestricted: true`, 목록을 넣기 전에 받은 sid는 로그아웃, uid·확인된 이메일·`kakao:<id>`는 통과, 목록 밖·Google 미확인 이메일·Naver 이메일·Kakao 미확인 이메일 → `/?authError=not_allowed`(sid 없음, users.json 기록 없음), 로그에 계정 정보 없음. ⑦ 약한 `SESSION_SECRET` 2가지(`changeme`, 48자지만 글자가 2종뿐인 값) → `sessionSecretConfigured: false`·`sessionSecretWeak: true`·경고 로그(값 없음), 그 값으로 위조한 sid 거절, 보통 로그인은 됨
  8. 의도 회귀(`phaseIntentRegression()`, `TRUST_PROXY=1` + 요청마다 다른 X-Forwarded-For로 레이트리밋 회피) — 가짜 Gemini `error400`으로 규칙 해석기를 강제하고 `INTENT_CASES` 67줄(ai_live P01-P16·X1-X3, ai_code P01-P19, SV-04 보정 사례, S2 여러 프롬프트 점검: 'A랑 B는 빼고'·'금각사, 기요미즈데라는 빼고'·'저녁엔 꼭 오코노미야키'·금액·영어 must/skip/start·일본어 必ず/なし)을 확인한다. 기대값은 `days`·출발일 월-일(연도는 올해 또는 내년, 오늘 이후)·`keepStart`(날짜 말이 없으면 폼 날짜)·`cityKey`·`theme`/`notTheme`·`budget`·조건 플래그·`maxPlacesPerDay`·`wantedPlaces`/`noWanted`·`excludedPlaces`·`unsupportedPlaces`(정확히)·`routeCities`·`foodKeyword`·도착/출발/시작 시각. 줄 이름 = 감사 ID + 요청, 실패 사유 = 틀린 필드 목록. en/ja 줄은 답변·이유에 장소 이름 말고 한국어가 없는지도 본다. 이어서 Gemini 정규화(`chat_ok` → `sourceInfo ai`, `{}` → `rule/AI_INVALID_OUTPUT`, `chat_shopping_neg` + '쇼핑은 빼줘' → shopping 거부, `chat_sapporo` + 폼 오사카 → 삿포로, `chat_noisy` → 음식·일반 문구·금액·메시지에 없는 장소·틀린 일수·근거 없는 조건을 거름, 채팅 요청의 responseSchema·2048·오늘 날짜), 한국어 요청의 en/ja 답변, 후속 대화(규칙·AI 둘 다 오사카 유지·교토 +1·전체 5일·조건 유지, 전체 일수 증감 '이틀 더'·'add one more day'·'하루 줄여줘', 일수 말이 없으면 유지), `history`/`prevParsed` 검증 400
  9. AI 일정(`phaseAiItinerary()`) — 프롬프트 계약(`userRequest`·`mustVisit`·`dayPlan`·`Constraints:`·원본 specialPrefs 없음·picks의 `id`/`city`/`allDay`·`종일`/`점심`/`ONLY for meals`·`excluded`·`foodWishes`), 후처리 시나리오(`evening_sight`·`lunch_food_in_afternoon`·`allday_halfslot`(요청한 USJ는 종일로 합침, 요청하지 않은 USJ는 지우고 같은 날 다른 관광·저녁은 남김)·`missing_must`·`lunch_repeat`·`invented_place`·`wrong_city_day`·`disney_day`)와 `postProcess` 개수, 700자 `request` 400, 배열이 아닌 의도 필드 무시, 제외(디즈니) AI·규칙 일정 모두, 모든 블록이 클라이언트 형식, `error429`/`error503` → `AI_BUSY`(채팅 포함), `gemini-flash-latest`의 `thinkingBudget: 0`, 마지막에 `error429_daily`(PerDay quotaId) → `AI_DAILY_LIMIT`·`daily_quota`·`retryAfterSec`(일정·채팅)
  10. Gemini 모델 체인(`phaseGeminiChain()`, 서버 3번) — ① 코드 기본 주 모델: `/api/health`의 `ai.geminiModelChain` = `gemini-2.5-flash` + 실측 순서(주 모델 중복 없음)·`geminiFallbackSource: 'default'`·`geminiTotalBudgetMs: 40000`·빈 `geminiCoolingModels`, `/api/ai-diagnostics`도 같음. ② `GEMINI_API_MODEL=gemini-2.5-flash-lite`(운영): 체인 = 실측 순서 그대로, 앞 3개 모델 하루 한도 → 4번째(`gemini-3.5-flash-lite`)가 일정, 모델별 생각 설정(2.5·3.x는 `thinkingBudget: 0`, 3.5-flash-lite는 `thinkingLevel: 'minimal'`), health에 쉬는 3개(이름·남은 초만, 6시간 이하), 다음 요청은 쉬는 모델을 건너뜀(1회), 404 → 다음 모델 + 하루 쉼(> 6시간), thinkingBudget을 400으로 거절하는 모델은 `thinkingLevel`로 한 번 더 + 기억, 생각 토큰 `MAX_TOKENS` → 다음 모델, 생각 없는 `MAX_TOKENS` → 1회 뒤 `AI_TRUNCATED`, 키 400 → 1회 뒤 `AI_ERROR`, 남은 모델 모두 하루 한도 → `AI_DAILY_LIMIT`·health에 7개, 그다음은 가장 오래 쉰 모델 1개(404 모델 제외). ③ `GEMINI_FALLBACK_MODELS`(공백·중복·주 모델·`models/`·틀린 이름·키 모양 값) → 정리된 체인·`env`, 키 모양 값은 health·로그에 없음(개수만), `AI_REQUEST_TIMEOUT_MS=5000`·`GEMINI_TOTAL_BUDGET_MS=8000` + 느린 모델 2개(12초) → 2개만 시도하고 약 8초에 규칙 해석(`AI_BUSY`, code `timeout`), 제 시간(5초)을 다 쓴 첫 모델만 60초 쉼(예산 때문에 짧게 끊긴 둘째는 쉬지 않음), 다음 채팅은 첫 모델을 건너뛰고 바로 둘째 모델
  11. OpenAI 호환 공급자(`phaseOpenAiCompat()`, 서버 8번) — 서버에는 진짜 주소(`api.groq.com/openai/v1`·`api.openai.com/v1`)를 주고 net-guard가 가짜 서버로 돌린다(가짜 서버 `openai`·`openaiModels` 시나리오: `ok`·`error401`·`error429`·`error413`·`error404`·`error503`·`incomplete`·`bad_json`·`short_days`). ① Groq 운영 설정(`GROQ_API_KEY` + `OPENAI_BASE_URL` 끝 `/`, `OPENAI_MODEL` 비움 → `openai/gpt-oss-120b`, 대체 목록의 중복·주 모델·`gsk_` 키·틀린 이름 제거와 개수만 로그, `OPENAI_MAX_OUTPUT_TOKENS=3500`, `OPENAI_REASONING_EFFORT=LOW`, `AI_CHAT_PROVIDER_ORDER=OpenAI, gemini`): health·diagnostics 값, probe 경로 `/models/openai/gpt-oss-120b`, 채팅이 Groq 먼저(Gemini 0회)·요청(Groq 키·`reasoning`·`max_output_tokens`·strict `json_schema`)·후속 대화의 assistant 문자열 content, 주 모델 429 → 20b, 모두 429 → Gemini(`AI_BUSY`), 401 → 한 번에 멈추고 Gemini, 일정은 Gemini 503 뒤 Groq(`openai_itinerary_v1 (<모델>)`, 출력 상한 3500), 잘림 → 다음 모델, 날짜 부족·JSON 아님 → qwen, 모두 잘림 → 규칙(`AI_TRUNCATED`, 모델마다 한 번), 벤더 원문이 응답에 없음. ② OpenAI 기본값: `api.openai.com`, `gpt-4o-mini`만, `reasoning`·`max_output_tokens` 없음, 6일 일정 8192, 429면 같은 모델 두 번 뒤 규칙(`AI_BUSY`). ③ 키·주소 짝 4가지(`gsk_`를 `OPENAI_API_KEY`에 → 아무 데도 안 보냄, `GROQ_API_KEY`만 → Groq 자동, Groq 주소 + OpenAI 키만 → 안 보냄, 두 키 + 주소 없음 → OpenAI·`GROQ_API_KEY` 미사용 경고), 로그에 키 없음. ④ 틀린 설정(https 아닌 주소·모르는 reasoning·출력 상한 10 → 256·모르는 공급자 이름·틀린 모델 이름)은 경고하고 기본값. ⑤ 로컬 http 주소 허용.
- **가짜 Gemini 시나리오**(`tests/support/mock-vendor.js`의 `mock.scenario = { gemini }`): `ok`·`max_tokens`·`empty_days`·`error400`·`error429`·`error429_daily`·`error503`, 체인용 `error404`·`max_tokens_thoughts`·`error400_thinking_budget`, 채팅 `chat_ok`·`chat_shopping_neg`·`chat_sapporo`·`chat_noisy`(그 밖에는 `{}`), 일정 `ITINERARY_SCENARIOS`. `geminiModels: { 모델: 시나리오 }`로 모델마다 다르게, `geminiDelayMs: { 모델: ms }`로 늦게 답하게 한다(서버가 먼저 끊으면 아무것도 보내지 않음). 일정 요청은 `generationConfig.responseSchema.properties.itinerary`로 가른다. 기록(`mock.entries('gemini')`)에 모델 이름·요청 본문·`prompt`가 남는다.
- **정적 검사**: 모든 JS `node --check`, I18N(ko에 ja/en 전용 키 없음, ja 값에 한국어 없음, 중복 키 없음(원문에서 직접 셈), 코드의 `t('…')` 리터럴·`data-i18n*` 키가 ko/en/ja에 모두 있음 — 이미 빠져 있던 키는 `I18N_KNOWN_MISSING` 허용 목록(지금 0개), `index.html` 기본 글자 = ko 사전), CSS 변수 자기참조·순환·미정의, CSS 중복 사본(최상위 `.rec-tabs {`·`.itin-meal-empty {`·`.drop-active .drop-hint` 각 1번), 전역 `:focus-visible`, 다크 블록 2개가 밝은 `:root` 색 토큰을 모두 다시 정함, app.js에 `stripServerMealBlocks`·`alert(`·`prompt(` 없음, localStorage 새 키는 `tabimaru.draft.v1` 하나, 브랜드(`APP_BRAND`/`APP_ID`/`BRAND_NAME`/User-Agent, index.html `<title>`, manifest `name`·`short_name`, 부제 ko/en/ja, `public/*`에 예전 이름 없음, package.json `name`, README 제목·저장소 링크, 문서 머리글), 도메인에 묶인 값(localStorage 키, `sid` 쿠키, Rakuten Referer, OAuth 콜백 경로, `start_url`, Render 서비스 이름), `render.yaml`·`.env.example`·README의 환경변수 목록과 Google 상한 기본값, 외부 서비스 규정(Rakuten 배지 HTML 원문이 숙소 결과 아래에 있음, OSM 타일 주소에 `{s}`·`subdomains` 없음, Frankfurter는 v2 `providers=ecb`이고 `frankfurter.app`·v1 없음).
- **첫 화면**: `tests/support/browser-sandbox.js`가 index.html 요소로 최소 DOM을 만들고 `app.js`를 실제로 부팅한다(fetch 기록, 가상 타이머, `click()`은 실제 리스너 호출). 부팅 중 유료 엔드포인트·자동 클릭·Google Maps JS 로드가 없어야 하고, 부팅 뒤 `document.title`이 "Tabimaru — AI 일본 여행 플래너"여야 하며(언어를 바꾸면 en/ja 표기로), 긴급 연락처의 표시 번호와 `tel:` 번호가 모두 같아야 한다. [일정 만들기]를 두 번 눌러도 `/api/travel-plan` 1회 + 항공·맛집·숙소 각 1회(`/api/dest-search` 0회)여야 하고, 카드의 `<img>`·위키미디어 출처 링크, 도시 대표 사진 표시, 일정이 생긴 뒤의 Leaflet(SRI) 로드, 빈 일정 안내 문구도 확인한다. 같은 흉내 안에서 `safeImageUrl`·`safeCreditUrl`·`cardPhoto`·`photoCreditHtml`과 `renderCards`(추천·맛집)에 악성 값(`javascript:`·`data:`, 비슷한 호스트, userinfo, `/\`·`//` 우회, http Commons, Commons가 아닌 경로, 따옴표·HTML이 든 이름·저작자·라이선스)을 넣어, `src`는 Commons나 `/api/place-photo`, 출처 `href`는 `commons.wikimedia.org/wiki/`나 Google `/maps/contrib/`로만 시작하고 끼워 넣은 태그·`on*` 속성이 없는지 본다.
- **직접 배치·의도 전달(샌드박스, `sandboxSchedulingTests()`)**: `fetch` 기록에 요청 본문(`body`)이 남고, 경로별 가짜 응답은 함수로도 줄 수 있다(`(call) => ({ body })`). 확인 항목:
  - 로그인 공급자 `{naver:false}` → `#loginNaver.hidden`
  - 카드의 `.add-to-plan-btn`(rec·recFood), AI 저녁 블록 보존, `오전(09:00-18:00)` → 종일 칸 + 실제 시각, 식당이 아닌 저녁 블록 → 오후
  - `placeBlock` 식사 맞바꾸기(형식·`undefined` 없음), 같은 식사 칸 2개 금지(찬 칸은 확인 → 샌드박스 confirm은 false), 오전 칸이 오후보다 앞, 종류가 다르면 변화 없음
  - '🌙 저녁 이후' 칸(별도 샌드박스): 그 칸 항목(`isNightAfternoonBlock()`)을 같은 날 오후 칸에 놓으면 오후 시각(13~18시)으로 옮겨지고 저녁 이후 칸이 빔(예전엔 조용한 noop), 다른 날 오후 칸이어도 오후 시각, 자기 칸이면 noop + `place-noop` 안내, 추가 창의 '저녁 이후' 선택지(`MODAL_NIGHT_SLOT`, `nightDropWindow()`)로 밤 일정이 없는 날에도 저녁 식사 뒤에 넣기, 그 항목의 [↔ 옮기기]는 '저녁 이후'가 미리 골라짐
  - 추가 창: 직접 입력 'A'를 쓰다 닫은 뒤 탐색 카드 추가 → 카드 이름, 강조된 시간대 = 들어간 시간대, [+ 장소 추가] + 후보 칩, [옮기기] 모드
  - 시간 겹침: `fitSightTime()`(일부 겹침 → 빈 시간 15:00-17:00, 종일과 겹침 → conflict, 겹침 없음 → 칸 시각), 종일 USJ 날에 넣으면 `confirm-time-overlap`(장소·시각 포함)을 묻고 거절하면 변화 없음·창 유지. 이후 수동 배치 검사는 겹침 확인에만 '예'로 답한다(다른 확인은 그대로 '아니오')
  - 끌어 놓기 공용 `applyDropToZone(beginDrag(원본), 칸)`(카드·일정 항목·종류 불일치), ☰ 손잡이 Pointer Events(`elementFromPoint`를 잠시 대상 칸으로 바꾸고 손잡이를 항목 자식으로 이어 붙여서): 고스트·`body.touch-dragging`·호환 칸 강조 → 놓으면 이동·상태 정리, 마우스 포인터는 무시
  - 편집 보호: 고친 뒤 [일정만 다시 만들기] → 확인 문구 + `travel-plan` 0회, 항공 선택 → 0회 + `#planRegenHint`
  - 초안: `tabimaru.draft.v1` 보관 → 초안이 있는 부팅은 안내 띠·유료 호출 0회·Leaflet 미로딩, [이어서 편집]도 AI 호출 0회
  - 의도 전달: 요청칸 글 + 주 버튼 → `ai-travel-chat` 먼저, `travel-plan` 본문의 `request`·`mustVisit`·`excludedPlaces`·`foodWishes`·`_picks`·`_specialPrefs`, 두 번째 채팅 본문의 `history`·`prevParsed`, 같은 글이면 채팅 재호출 없음, 의도 칩(`intentChipsHtml`: 꼭 갈 곳 `.ok`, 반영 못 함 `.warn`, 당일치기로 대신 넣은 나라는 `.warn` 없음, `parsed.labels`는 요청한 언어일 때만), `describeSource`의 `AI_DAILY_LIMIT` 안내(`ai-daily-retry`), `missingMustVisit` 안내 말풍선
  - 한계: 평평한 DOM이라 부모 관계·위치 판정(`elementFromPoint`)이 없다. 실제 손가락 끌기·스크롤·레이아웃은 14장의 수동 점검으로 본다.
- **로그인 유지·저장소 장애 안내(샌드박스, `sandboxStorageTests()`)**: `/api/auth/me`가 한 번 502(서버가 깨어나는 중)여도 다시 물어 로그인 화면(내 일정 버튼·닉네임)이 나오는지, 내 일정 목록·불러오기·삭제·저장(목록이 503이면 저장 창을 닫음, 저장 POST가 503이면 안내)이 503일 때 `store-unavailable`("저장소에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.", en/ja 포함)을 보여 주는지 본다. 저장 POST가 409 `PLAN_LIMIT`·413 `PLAN_TOO_LARGE`·400 `INVALID_PLAN`이면 `plan-limit`(`{n}` = 50)·`plan-too-large`·`plan-invalid`, 그 밖에는 `save-fail`, `/?authError=not_allowed`면 `auth-err-not-allowed`가 뜨는지도 본다.
- **가짜 Supabase**(`tests/support/mock-vendor.js`, `<mock>/supabase/rest/v1`): `travel_plans` 한 표의 PostgREST 흉내. GET(`select` 열 목록·`eq` 필터·`order`·`limit`), POST(`on_conflict=plan_key` + `resolution=merge-duplicates`, `return=representation|minimal`, 열 검사: 모르는 열 400, `city_key`·`payload` not null, `start_date` 날짜, `days` 정수, 실제 Postgres처럼 NUL이 든 글자 400 `22P05`·짝 없는 서로게이트 400 `22P02`), DELETE(필터 필수), HEAD/GET 루트. 그 밖의 연산자·열·경로는 `unknownMockRoute`로 기록되어 실패한다. `scenario.supabase`: `'down'` 모든 요청에 503 + 원문(`SUPABASE_ERROR_TEXT`), `'auth'` 모든 요청에 401 Invalid API key, `'reject_post'` POST만 400 `22P05`. 가짜 OAuth 프로필의 `emailVerified`(기본 true)가 Google `verified_email`·Kakao `is_email_verified`로 나간다. `mock.supabaseRows()`·`mock.seedSupabase()`로 표를 보고 미리 채운다.
- 각 단계 끝에서 모든 응답 본문·헤더에 서버 키·토큰이 없는지, 서버 로그에 크래시가 없는지 확인한다.
- 개발 중 부분 실행: `TEST_ONLY=sandbox,intent,itinerary node test_all.js`(이름: `sandbox`·`intent`·`itinerary`·`chain`·`openai`·`oauth`·`session`·`live`·`free`). `npm test`·CI는 늘 전체(2026-10-02 기준 787개).
- CI: `.github/workflows/ci.yml`(push·PR, Node 20). `.github/workflows/keepalive.yml`(3일마다 운영 `/api/keepalive`)은 정적 검사로 내용(cron `17 3 */3 * *`, `workflow_dispatch`, `permissions: {}`, 5번 재시도, `"supabase":"ok"`일 때만 성공, 비밀값 없음)만 확인한다.

---

## 12. OAuth 로그인 및 일정 저장

### 12.1 소셜 로그인 (Naver / Kakao / Google)
- OAuth 2.0 Authorization Code Flow, `/api/auth/{provider}`(리다이렉트) + `/api/auth/{provider}/callback`
- 세 공급자 모두 `state`를 발급해 `oauth_state` 쿠키에 묶고, 콜백에서 쿠키·서버 기록과 대조한다(없거나 틀리거나 재사용하면 `/?authError=invalid_state`). 설정이 없는 공급자의 `/api/auth/<공급자>`는 `302 /?authError=<공급자>`로 첫 화면에 돌려보내고, 화면은 `/api/auth/providers` 응답 전에는 버튼을 모두 숨겼다가 설정된 공급자의 버튼만 보여 준다(`hidden` 속성). 내 일정 API가 401이면 로그아웃 상태로 바꾸고 로그인 창을 연다.
- **사용자 id(고정)**: `stableUserId(provider, providerId)` = `'u_' + sha256(provider + ':' + providerId)`의 hex 앞 24자. 같은 OAuth 계정은 언제나 같은 id(서버 재시작·users.json 삭제·`SESSION_SECRET` 교체와 무관), 공급자가 다르면 다른 id. 공급자 프로필에 id가 없으면(`requireProviderId()`) 로그인을 끝내지 않고 `/?authError=<공급자>`.
- **세션 = 서버에 저장하지 않는 서명 쿠키**(`createSession`·`parseSession`·`destroySession`, 반환 모양 `{userId, provider, nickname, profileImage, createdAt}`는 예전과 같음):
  - 쿠키 이름 `sid`(그대로). 값 = `base64url(JSON payload)` + `.` + `base64url(HMAC-SHA256(SESSION_KEY, 앞부분))`(43자). `SESSION_KEY` = `HMAC-SHA256(scryptSync(SESSION_SECRET, 'tabimaru-sid-v1', 32, {N:16384, r:8, p:1}), 'allow:' + ALLOWED_LOGINS.key)`. 이 값 하나로 누구의 쿠키든 만들 수 있으므로(uid는 비밀값 없이 계산 가능) `SESSION_SECRET`은 32자 이상·서로 다른 글자 10개 이상일 때만 쓰고, scrypt로 쿠키 하나를 가진 사람이 비밀값을 사전 대입하는 비용을 높인다.
  - payload `{v:1, uid, p, n, img, iat, exp}`: `uid` = 고정 사용자 id, `p` = `naver`·`kakao`·`google`, `n` = 닉네임(제어 문자 제거, 40글자까지), `img` = 프로필 사진 주소(`http(s)://`이고 512자 이하일 때만, 아니면 `''`), `iat`·`exp` = 초 단위, `exp = iat + 2592000`(30일). 쿠키 `Max-Age=2592000`과 같다. 3500자를 넘으면 사진 주소를 빼고 다시 서명한다.
  - 속성: `HttpOnly; Path=/; SameSite=Lax`(+ HTTPS면 `Secure`).
  - 검증(`verifySessionToken()`): `cookieValue(req, 'sid')`로 이름이 정확히 `sid`인 쿠키만(`xsid=`는 무시) → 3500자 초과·점이 1개가 아님·base64url이 아닌 글자·서명 43자가 아님 → 버림 → 같은 길이 버퍼로 `timingSafeEqual` → `JSON.parse` 결과가 일반 객체가 아니면 버림 → 알려진 칸만 새 객체로 복사(`__proto__` 등은 따라오지 않음) → `v === 1`, `uid`가 `u_` + hex 24자, `p`가 세 공급자 중 하나, `iat`·`exp`가 정수이고 `iat ≤ exp`, `exp`가 지나지 않았고 지금 + 30일(+60초)보다 멀지 않을 때만 세션. 하나라도 어긋나면 로그아웃 상태(`null`). 예전 `sid=<uuid>.<16자리>` 쿠키도 여기서 떨어진다.
  - 로그아웃은 `sid=; …; Max-Age=0`으로 그 브라우저의 쿠키만 지운다(서버에 지울 것이 없음, 로그아웃 전에 복사된 쿠키는 만료까지 유효: 혼자 쓰는 앱이라 받아들인 트레이드오프). 모든 기기 로그아웃 = `SESSION_SECRET` 교체(또는 `ALLOWED_LOGINS` 변경). `SESSION_SECRET`이 없거나 약하면 실행마다 임의 값이라 재시작 때 로그인이 풀린다.
- **허용 목록**: 세 콜백 모두 `stableUserId()` 다음에 `loginAllowed({provider, providerId, uid, email, emailVerified})`를 본다. `ALLOWED_LOGINS`가 비어 있으면 모두 허용. 목록 밖이면 `rejectNotAllowedLogin()` → `302 /?authError=not_allowed`(sid·users.json 기록 없음, 로그는 공급자 이름만). 화면은 `auth-err-not-allowed` 안내.
- 사용자 기록: `findOrCreateUser(provider, providerId, uid, profile)`가 `TABIMARU_DATA_DIR/users.json`에 공급자별 프로필을 남긴다(로컬 참고용, id의 출처가 아님, 쓰기에 실패해도 로그인은 계속). 예전 기록(`id` = 임의 UUID)은 그대로 두고 `uid`만 붙여, 파일 저장소의 예전 일정을 같은 계정이 계속 보게 한다(`fileStoreOwnerIds()`).

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

| `/api/keepalive` | GET | Supabase 가벼운 조회(성공 10분·실패 15초 캐시), 4.1 |

- 저장 데이터(일정 객체): `{id, userId, title, cityKey, cityLabel, startDate, days, theme, data, savedAt}` — `data` = 일정 + 항공권 + 숙소 + 폼 값. 요청의 `id`는 `/^[A-Za-z0-9_-]{1,64}$/`일 때만 쓰고 아니면 새 UUID. 제목 200자·cityKey 40자·cityLabel 80자·startDate 10자·theme 30자까지, `days`는 0–365 정수(아니면 0). 응답 모양은 예전과 같다(`save` → `{saved: 일정}`, `list` → `{plans:[{id,title,cityLabel,startDate,days,theme,savedAt}]}`, `load` → `{plan}`, `delete` → `{deleted}`). 응답은 모두(401·오류 포함) `Cache-Control: no-store`.
- **글자 정리**(`storeSafeString()`·`storeSafeValue()`): 글자 칸과 `data`의 모든 문자열·객체 키에서 NUL(`\u0000`)을 지우고 짝 없는 서로게이트를 U+FFFD로 바꾼다(Postgres text·jsonb가 거절하는 글자). `__proto__` 키는 버리고, 64단계보다 깊으면 400.
- **상한**: 일정 하나는 JSON 400KB(`MY_PLAN_MAX_BYTES`, 넘으면 413 `PLAN_TOO_LARGE`), 사용자당 50개(`MY_PLANS_MAX_PER_USER`, 새 일정이면 `GET travel_plans?select=plan_key&user_label=eq.<uid>&source=eq.my-plans&limit=50`이 50행이면 409 `PLAN_LIMIT`; 덮어쓰기는 허용). 목록 상한도 50이라 저장한 일정은 모두 화면에서 지울 수 있다. 파일 저장소도 같은 상한.
- **저장소 선택**: `hasSupabase()`(=`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 모두 있음)이면 Supabase, 아니면 파일(`TABIMARU_DATA_DIR/saved_plans.json`, 기본 `<저장소>/data`, 로컬 개발용).
- **Supabase 행 대응**(`travel_plans`, 스키마 변경 없음): `plan_key = 'my_' + id`, `user_label = 세션 userId`, `source = 'my-plans'`, `city_key = cityKey || 'unknown'`, `city_label = cityLabel || null`, `theme = theme || null`, `start_date` = 달력에 있는 `YYYY-MM-DD`일 때만(`strictIsoDate()`, `2026-02-30` 같은 값은 `null`), `days` = 1 이상 정수일 때만(아니면 `null`), `summary = 제목`, `payload = 일정 객체 전체`, `budget`은 넣지 않음.
  - save: 클라이언트 id가 있으면 먼저 `GET travel_plans?select=user_label,source&plan_key=eq.<key>&limit=1` → 행이 있는데 `user_label`이 다른 사용자거나 `source`가 `my-plans`가 아니면 404(내용 없이 "일정을 찾을 수 없습니다") → 새 일정이면 개수 상한 확인 → `POST travel_plans?on_conflict=plan_key`(`Prefer: return=minimal,resolution=merge-duplicates`).
  - list: `GET travel_plans?select=plan_key,summary,city_label,start_date,days,theme,updated_at&user_label=eq.<uid>&source=eq.my-plans&order=updated_at.desc&limit=50` → `id = plan_key`에서 `my_`를 뗀 값, `title = summary`, `startDate = start_date || ''`, `days = days ?? 0`, `savedAt = updated_at`.
  - load: id가 안전한 모양이 아니면 404, `GET travel_plans?select=payload&plan_key=eq.my_<id>&user_label=eq.<uid>&source=eq.my-plans&limit=1` → `{plan: payload}`(없으면 404).
  - delete: `DELETE travel_plans?plan_key=eq.my_<id>&user_label=eq.<uid>&source=eq.my-plans&select=plan_key`(`Prefer: return=representation`) → `{deleted: 지운 행이 있음}`.
  - 필터 값은 모두 `encodeURIComponent`. 다른 사용자의 행은 필터에 걸리지 않으므로 보이지도, 바뀌지도, 지워지지도 않는다.
- **실패 동작**: Supabase가 설정됐는데 연결 실패·타임아웃(8초)·5xx·JSON 아님, 또는 키·표 문제(401·403·404)면 `503 {error: '일정 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', reasonCode: 'PROVIDER_UNAVAILABLE'}`. 저장소가 저장할 내용을 거절한 그 밖의 4xx(400·409·413·422 …)는 `400 {error: '저장할 수 없는 내용이 들어 있습니다.', reasonCode: 'INVALID_PLAN'}`(다시 시도해도 같으므로 '연결 불가'로 안내하지 않음, 저장소 상태도 바꾸지 않음). 로컬 파일에 대신 쓰지 않는다. 원문 오류는 서버 로그(`[supabase] 내 일정 <op> 실패`, 상태 코드·PostgREST 코드별로 10분에 한 번, 키는 `***`)에만. `classifySupabaseError()`가 `supabaseCheck`를 `unreachable`·`auth_error`·`schema_error`로, 성공은 `ok`로 갱신한다. 화면은 503이면 `store-unavailable` 안내(목록 패널 글·토스트, 저장은 목록 단계에서 503이면 저장 창을 닫음), 409·413·400이면 각 안내.
- **파일 저장소**(Supabase 미설정): 예전 동작 그대로 `userId`로 거른다. 같은 계정의 users.json 예전 id(`uid`가 같은 기록의 `id`)로 저장된 일정도 그 사람 것으로 보고, 덮어쓰면 새 uid로 옮겨진다.
- `/api/auth/me`가 5xx·네트워크 오류면 화면이 1.5초·3초 뒤 두 번까지 다시 묻는다(Render가 깨어나는 중에 로그아웃 화면으로 잘못 바뀌지 않게).
- Render 무료 플랜은 재시작·재배포 때 디스크와 메모리를 지우지만, 로그인(서명 쿠키)과 Supabase의 내 일정은 남는다. 무료 Supabase 프로젝트가 7일 활동 없음으로 일시 중지되지 않게 `.github/workflows/keepalive.yml`이 3일마다 `/api/keepalive`를 부른다(deploy/DEPLOY.md 5).

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
| 2026-10-01 | **의도가 일정까지 가게**: 주 버튼 하나([일정 만들기]), 채팅 `history`·`prevParsed`·후속 대화 병합, 채팅 `responseSchema`·정직한 `sourceInfo`·3개 언어 답변·의도 칩, 일정 요청 `request`·`mustVisit`·`excludedPlaces`·`foodWishes`, 프롬프트 계약(식사 전용 점심·저녁, 저녁 관광은 오후, 종일, `Constraints:`, `dayPlan`), 결정적 후처리 `postProcessItinerary()`(`postProcess`·`missingMustVisit`), `AI_BUSY`(429·503), 규칙 해석기 보정(날짜·일수·부정·별칭·일본어). **직접 배치 통합**: `SLOT_DEFS` + `placeBlock()`(끌어 놓기·추가 창·[옮기기]·☰ 터치 끌기), 편집 보호, 초안 `tabimaru.draft.v1`. 화면: 와시 크림·히노마루 주홍·쪽빛 토큰, 다크 모드(OS 설정), CSS 중복 사본 정리, 포커스 링, 헤더 두 줄(스크롤하면 도구 줄만 남음, 툴바 라벨은 툴바 폭·언어별 컨테이너 쿼리로 단계적으로 줄임). 맛집은 지어낸 가게 이름 대신 빈 목록(`NO_GENRE_MATCH`)·'찾기' 안내. 날씨 16일, 정적 파일 ETag. 테스트 470개(의도 회귀 표·AI 일정 후처리·직접 배치 샌드박스) |
| 2026-10-01 | **여러 프롬프트 점검 반영**: AI 해석 잡음 거르기(음식·일반 표현·금액·근거 없는 이름·조건), 메시지 일수 우선, 'A랑 B는 빼고' 목록 제외, 전체 일수 증감 후속 대화, 실내 위주·저예산 후보, 요청하지 않은 하루짜리는 카드로만(AI가 넣으면 후처리가 지움), 당일치기 현지 식사, 빈 저녁·빈 낮 채우기, `AI_DAILY_LIMIT`(하루 무료 한도), 의도 칩 `parsed.labels`. **직접 배치**: 모든 경로의 여행지 시간 겹침 검사(`fitSightTime()`), 생성 중 편집 보호(`itinEditSeq`), 시간순 보드·'🌙 저녁 이후' 칸, 예산 단계 전달·합계 다시 그리기, 숙소 [더보기]. 테스트 488개 |
| 2026-10-01 | **로그인·내 일정 영구 저장**: 세션을 서버 메모리 Map에서 서명 쿠키(`sid`, 30일, HMAC-SHA256)로, 사용자 id를 users.json 임의 UUID에서 OAuth 신원의 sha256(`u_…`)으로, "내 일정"을 `data/saved_plans.json`에서 Supabase `travel_plans`(`source='my-plans'`)로(미설정이면 파일), Supabase 장애는 503 `PROVIDER_UNAVAILABLE`(파일에 대신 쓰지 않음)·화면 안내, `sb_secret_` 키는 `apikey`만(Bearer는 `eyJ…`일 때만), `/api/health`에 시작 직후·10분마다 확인한 `supabaseReachable`과 `sessionSecretConfigured`, `/api/keepalive` + GitHub Actions `keepalive.yml`(3일마다), `TABIMARU_DATA_DIR`(테스트 격리). 테스트 578개 |
| 2026-10-01 | **보안·저장소 검수 반영**: 약한 `SESSION_SECRET`(32자 미만·서로 다른 글자 10개 미만)은 쓰지 않음(`sessionSecretWeak`), 쿠키 키 = scrypt 파생 + 허용 목록, `ALLOWED_LOGINS`(`/?authError=not_allowed`, `loginRestricted`), 사용자당 50개·하나 400KB 상한(409 `PLAN_LIMIT`·413 `PLAN_TOO_LARGE`, 목록 50), NUL·짝 없는 서로게이트 정리, 내용 거절 4xx → 400 `INVALID_PLAN`, 개인 일정 응답 `no-store`, 저장소 확인을 실제 조회로(`supabaseCheck`: 틀린 키는 `auth_error`), keepalive 실패 캐시 15초. 화면: 토스트가 클릭을 가로채지 않음(창이 열리면 위쪽), 저녁 이후 칸 항목을 같은 날 오후로 옮기기·바뀔 것이 없으면 안내, 추가 창의 저녁 이후 선택지, 항공 [더보기] 2줄씩, 다크 모드 placeholder 대비, 좁은 폰 헤더, 편집한 일정의 항공 날짜 확인 문구, 규칙 일정 저녁 가게 되풀이 줄임, 채팅 답장 조사(나라는)·음식 약속 문구. 테스트 641개 |
| 2026-10-02 | **AI 일정 전국 점검 반영**: 62개 도시 말로 찾기(일본어·영어·표기 변형·더 긴 이름 우선·짧은 장소 이름), 장소만 말하면 그 장소의 도시, AI 해석의 '데이터 없음' 바로잡기, 먼 도시 이동은 비행기, 도시 주변 실제 명소 한국어 이름(`scripts/ja-names.js`)·이름 겹침 구분·검토로 뺀 곳·중복 합치기, AI가 바꿔 적은 후보 이름 되돌리기(`namesRestored`)·지어낸 곳 빼기·'자유 식사' 바꾸기, 프롬프트(이름 그대로 복사·식사는 foods에서), AI 후보 상한 하루 3곳, 테스트 729개 |
| 2026-10-02 | **외부 서비스 규정 정비**(docs/api-review-2026-10-02.md 0번): Rakuten 크레딧 배지(제공 HTML 그대로, 숙소 결과 아래), OSM 타일 주소에서 `{s}` 서브도메인 제거, Frankfurter를 v2(`api.frankfurter.dev/v2/rates`, `providers=ecb`)로 교체 |
| 2026-10-02 | **Groq 무료 연결**(같은 문서 1번): OpenAI 호환 경로에 `OPENAI_BASE_URL`·`GROQ_API_KEY`(키는 주소에 맞는 것만 보냄)·`OPENAI_FALLBACK_MODELS`(모델 체인 `callOpenAiResponses()`, 40초 예산, 잘림·형식·날짜 수 부족이면 다음 모델)·`OPENAI_MAX_OUTPUT_TOKENS`·`OPENAI_REASONING_EFFORT`·`AI_CHAT_PROVIDER_ORDER`, 지난 대화를 문자열 content로, health·diagnostics 필드, 가짜 서버의 Groq·OpenAI 흉내. 테스트 782개 |
| 2026-10-02 | **교통비 AI 제거**(같은 문서 2번): `calculateRouteCost()`가 Gemini를 부르지 않고 거리로 추정(모든 구간 `estimated: true`, 화면 "예상 합계"·안내), 구간마다 Google 지도 대중교통 링크(`mapsUrl`, `safeMapsDirUrl()` 허용 목록), 일본어 도시 이름은 `CITY_NAME_I18N`에서도 찾음. 테스트 787개 |

---

## 14. 수동 점검 체크리스트

자동 테스트(11장)가 흉내 낼 수 없는 부분(실제 브라우저의 손가락 끌기·레이아웃·실제 Gemini 답)을 사람이 볼 때의 순서다. 실제 키가 든 `.env`는 출력하거나 복사하지 않는다.

### 14.1 로컬 서버(Google 호출 0회)
```powershell
$env:PORT='3005'; $env:PLACES_PROVIDER='free'; $env:MAP_PROVIDER='osm'; $env:GOOGLE_DAILY_CALL_LIMIT='0'; $env:GOOGLE_MONTHLY_CALL_LIMIT='0'
node server.js
```
`.env`에 Gemini 키가 있으면 AI가 실제로 불린다(무료 한도는 운영과 같은 키라면 함께 줄어든다). AI 없이 보려면 `$env:GEMINI_API_KEY=' '`(공백 = 미설정)로 띄운다.

### 14.2 휴대폰 터치 배치(헤드리스 Chrome + CDP)
1. `chrome.exe --headless=new --remote-debugging-port=9222 --user-data-dir=<임시 폴더>`로 띄우고, `/json/new`로 탭을 연 뒤 WebSocket(Node 20+의 전역 `WebSocket`)으로 붙는다.
2. `Emulation.setDeviceMetricsOverride {width:390, height:844, deviceScaleFactor:3, mobile:true}` + `Emulation.setTouchEmulationEnabled {enabled:true, maxTouchPoints:5}`, `Page.navigate http://127.0.0.1:3005/`.
3. 요청칸 없이 [일정 만들기]를 누르고 일정이 그려질 때까지 기다린다.
4. 일정 항목의 ☰(`.drag-handle`) 가운데 좌표를 `getBoundingClientRect()`로 얻고, `Input.dispatchTouchEvent`를 `touchStart`(손잡이) → `touchMove` 몇 번(다른 날 '오후' 칸 `.itin-period-zone[data-drop-day="2"][data-drop-dest-period="afternoon"]`의 가운데까지) → `touchEnd` 순서로 보낸다. 칸이 화면 밖이면 화면 아래 72px 안에 손가락을 두어 자동 스크롤을 확인한다.
5. 확인: 끄는 동안 `.touch-drag-ghost`가 손가락을 따라오고 맞는 칸만 점선(`.drop-active`), 올린 칸은 실선(`.drop-hover`), 놓으면 그 칸에 항목이 생기고 원래 자리에서 사라짐(`.just-added` 잠깐), 끄는 동안 페이지가 스크롤되지 않음(`window.scrollY` 그대로, 자동 스크롤 구간 제외), 카드 본문(손잡이 밖)을 쓸면 스크롤만 됨.
6. 버튼 경로: 카드 [+ 일정에 넣기] → 날짜·시간대 → [추가], 항목 [옮기기] → 다른 날 오전, 칸 [+ 장소 추가] → 후보 칩. 강조된 시간대와 실제로 들어간 칸이 같은지 본다.
7. 마우스(1280×900): `Input.setInterceptDrags {enabled:true}` 뒤 `Input.dispatchMouseEvent`로 카드를 끌고, `Input.dragIntercepted`로 받은 `data`를 `Input.dispatchDragEvent`(dragEnter → dragOver → drop)로 칸에 보낸다. 맞지 않는 칸은 강조되지 않고 놓아도 바뀌지 않아야 한다.
8. 다크 모드: `Emulation.setEmulatedMedia {features:[{name:'prefers-color-scheme', value:'dark'}]}`로 바꿔 대비·지도 톤을 눈으로 본다.

### 14.3 프롬프트 매트릭스(실제 AI, SV-09)
```powershell
node scripts/prompt-matrix.mjs --base http://127.0.0.1:3005            # P01-P16·N01-N03·A01-A04·후속 F01-F02 전부(Gemini 약 60회 — 하루 무료 한도에 주의)
node scripts/prompt-matrix.mjs --base http://127.0.0.1:3005 --only P01,P14 --gap 5000 --json out.json
```
- 본문은 화면(`runChatPlan` → `applyAiConditions` → `buildPlanPayload`)과 같다: `mustVisit`·`excludedPlaces`·`foodWishes`·`_picks`·채팅이 정한 `budget`, 후속 대화는 `history`·`prevParsed`.
- 요청 사이를 4초 이상 띄우고, `AI_BUSY`(429/503)면 60초 쉬고 한 번만 다시 시도한다. `AI_DAILY_LIMIT`(하루 무료 한도 소진)이면 다시 시도하지 않는다. 한도가 바닥나면 나머지는 규칙 결과(`sourceInfo.kind: rule`)로 나오므로, 표의 출처 칸을 보고 AI 결과인지 먼저 확인한다.
- 볼 것: 해석(도시·일수·꼭 갈 곳·제외·조건)이 11장의 `INTENT_CASES` 기대값과 같은지, 일정 블록이 식사 칸에 관광을 넣지 않는지, 꼭 갈 곳이 한 번씩 들어갔는지, 제외한 곳이 없는지, 늦은 시작·하루 장소 수가 지켜지는지, en/ja 답변에 한국어가 없는지.
- 운영 서버로 돌릴 때는 `--base https://japanjapantravel.onrender.com`(첫 요청은 깨우느라 50초쯤 걸림), 몇 개만(`--only`) 돌린다.
