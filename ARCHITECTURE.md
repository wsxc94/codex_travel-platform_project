# JapanTravel Suite - Architecture & Feature Documentation

> 이 문서는 프로젝트의 전체 구조, 기능, 알고리즘, 데이터 흐름을 상세히 기록합니다.
> 코드 변경 시 함께 갱신됩니다.

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [서버 아키텍처](#3-서버-아키텍처)
4. [API 엔드포인트](#4-api-엔드포인트)
5. [AI 스코어링 알고리즘](#5-ai-스코어링-알고리즘)
6. [AI 통합 (Gemini / OpenAI)](#6-ai-통합)
7. [한국어 주소 변환](#7-한국어-주소-변환)
8. [프론트엔드 아키텍처](#8-프론트엔드-아키텍처)
9. [데이터 흐름](#9-데이터-흐름)
10. [외부 API 연동](#10-외부-api-연동)
11. [변경 이력](#11-변경-이력)

---

## 1. 프로젝트 개요

일본 여행 계획을 원스톱으로 생성하는 웹 애플리케이션.
여행지 추천, AI 일정 생성, 항공권/숙소/맛집 탐색, 저장 기능을 통합 제공한다.

### 파일 구조
```
project-root/
  server.js            # Node.js HTTP 서버 (전체 백엔드 로직, ~5200줄)
  public/
    index.html          # 메인 HTML (~296줄)
    app.js              # 프론트엔드 JS (~3400줄)
    styles.css           # 전체 스타일 (~1800줄)
    manifest.webmanifest # PWA 매니페스트
  deploy/
    DEPLOY.md           # 배포 가이드
  test_all.js           # 자동 테스트 스위트 (91개 테스트)
  .env.example          # 환경 변수 예시
  render.yaml           # Render 배포 설정
```

---

## 2. 기술 스택

| 영역 | 기술 |
|------|------|
| 서버 | Node.js (native `http` module, 프레임워크 없음) |
| 프론트엔드 | Vanilla JS + CSS (프레임워크 없음) |
| 지도 | Google Maps JavaScript API |
| 장소 데이터 | Google Places API (New) |
| 항공권 | Travelpayouts API → Amadeus 폴백 → Mock |
| 숙소 | Rakuten Travel API (좌표 기반) → Amadeus 폴백 → Mock |
| 투어/액티비티 | Klook 위젯 + Viator/GetYourGuide 폴백 링크 |
| AI 일정 생성 | Google Gemini 2.5-pro / OpenAI GPT-4o-mini |
| AI 채팅 파싱 | Gemini / OpenAI (폴백 체인) |
| 저장 | Supabase (PostgreSQL) |
| 환율 | exchangerate.host API (12시간 주기 갱신) |

---

## 3. 서버 아키텍처

### 초기화 흐름
1. `.env` 파일 로드 (`loadEnvFile()`)
2. 환경 변수 파싱 (API 키, 모델 설정, 타임아웃 등)
3. `CITY_DATA` 정적 데이터 초기화 (7개 도시: tokyo, osaka, kyoto, fukuoka, sapporo, nagoya, okinawa)
4. 환율 갱신 시작 (`refreshFxRate()` - 12시간 interval)
5. HTTP 서버 시작 (`http.createServer`)

### 핵심 데이터 구조: CITY_DATA
```js
CITY_DATA[cityKey] = {
  label: string,        // 한국어 도시명 (예: '도쿄')
  airport: string,      // 주요 공항 코드 (예: 'NRT')
  areas: string[],      // 주요 지역 목록
  highlights: [{        // 큐레이션된 관광지
    name, area, category, stayMin, bestTime, crowdScore
  }],
  foods: [{             // 큐레이션된 맛집
    name, area, genre, priceLevel, score, tabelogUrl
  }]
}
```

### 요청 처리 흐름
```
HTTP Request
  -> URL 파싱
  -> API 라우트 매칭 (pathname)
  -> readBody() (POST)
  -> 핸들러 실행
  -> sendJson() 응답
  -> 매칭 실패 시: 정적 파일 서빙 (public/)
  -> 404 catch-all
```

---

## 4. API 엔드포인트

### 4.1 헬스/진단
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/health` | 서버 상태 + Supabase 연결 확인 |
| GET | `/api/ai-diagnostics` | AI 키/모델 설정 진단. `?probe=1`이면 실제 API 호출 테스트 |

### 4.2 도시 데이터
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/cities` | CITY_DATA에서 도시 목록 반환 `{key, label, airport}[]` |

### 4.3 여행 플랜 (핵심)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/travel-plan` | **통합 플랜 생성** - 여행지 추천 + 맛집 추천 + AI 일정 생성을 한번에 수행 |
| POST | `/api/destinations` | 여행지 추천만 수행 |
| POST | `/api/itinerary` | 일정 생성만 수행 |
| POST | `/api/dest-search` | 여행지 탐색 (recommendDestinations 재사용) |
| POST | `/api/ai-travel-chat` | AI 채팅 기반 여행 조건 파싱 + 통합 플랜 생성 |

#### `/api/travel-plan` 요청 파라미터
```json
{
  "city": "osaka",
  "theme": "mixed|foodie|culture|shopping|nature",
  "budget": "low|mid|high",
  "days": 4,
  "startDate": "2025-04-01",
  "useAi": true,
  "_picks": [],
  "flight": {},
  "stay": {}
}
```

#### `/api/travel-plan` 응답 구조
```json
{
  "source": "integrated_travel_planner_v1",
  "city": "오사카",
  "recommendationSource": "external_google_places_ai_scored",
  "recommendations": [],
  "recommendedFoods": [],
  "itinerary": [{"day": 1, "date": "2025-04-01", "blocks": []}],
  "itinerarySource": "gemini_itinerary_v1|openai_itinerary_v1|rule_based",
  "tips": [],
  "summary": "오사카 추천 10곳 + 4일 일정",
  "aiNote": "",
  "aiErrors": [],
  "budgetBreakdown": {
    "meal": { "perDay": 55000, "total": 220000, "label": "식비" },
    "transport": { "perDay": 22000, "total": 88000, "label": "교통비" },
    "activity": { "perDay": 25000, "total": 100000, "label": "활동비" },
    "days": 4, "budgetTier": "mid",
    "estimatedDailyTotal": 102000, "estimatedTotal": 408000
  }
}
```

### 4.4 항공권/숙소
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/flights` | 항공권 탐색 (Kiwi.com → Amadeus → Mock 폴백) |
| POST | `/api/stays` | 숙소 탐색 (Rakuten Travel → Amadeus → Mock 폴백) |

### 4.5 맛집
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/foods` | 맛집 탐색. `?city=osaka&genre=라멘&budget=mid` |

### 4.6 저장 (Supabase)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/travel-plan/save` | 플랜 저장 (upsert) |
| GET | `/api/travel-plan/list` | 저장 목록 조회. `?limit=20&userLabel=guest` |
| GET | `/api/travel-plan/get` | 특정 플랜 상세 조회. `?planKey=uuid` |

---

## 5. AI 스코어링 알고리즘

### 5.1 여행지 스코어: `scoreExternalPlace()` (server.js:1952)

Google Places API에서 받아온 장소를 6개 가중치 팩터로 평가하여 0~100점 산출.

**입력**: `place` (Google Places 결과), `ctx` (theme, budget, center 좌표)

**팩터 및 가중치**:

| 팩터 | 가중치 | 계산 방식 |
|------|--------|-----------|
| ratingScore | **0.35** | `rating / 5` (0~1) |
| reviewScore | **0.25** | `log(1 + reviewCount) / log(1 + 5000)` (0~1) |
| mobilityScore | **0.15** | `1 - (centerDistKm / 20)` (0.1~1) - 도심 근접도 |
| preferenceScore | **0.10** | `categoryFit(theme, primaryType)` - 테마 적합도 |
| budgetScore | **0.05** | `budgetFit(budget, primaryType)` - 예산 적합도 |
| seasonBonus | **0.10** | `seasonalBonus(type, startDate)` - 계절 보너스 |

**최종 점수**:
```
composite = (rating*0.35 + review*0.25 + mobility*0.15
           + preference*0.10 + budget*0.05 + season*0.10) * 100
finalScore = round(clamp(composite - congestionPenalty * 10, 0, 100))
```

#### categoryFit (테마 적합도)
- `foodie`: restaurant/food/market 포함 -> 1.0, 불일치 -> 0.55
- `culture`: museum/temple/shrine/historical -> 1.0, 불일치 -> 0.55
- `shopping`: shopping/store/mall -> 1.0, 불일치 -> 0.55
- `nature`: park/garden/beach/mountain -> 1.0, 불일치 -> 0.55
- `mixed`: 항상 0.75

#### budgetFit (예산 적합도)
- `low` (절약): 고가 장소(쇼핑몰/놀이공원) -> 0.6, 일반 -> 0.95
- `high` (프리미엄): 고가 장소 -> 1.0, 일반 -> 0.85
- `mid` (표준): 항상 0.9

#### congestionPenalty (혼잡도 감점)
```
popularity = log(1 + reviewCount) / log(1 + 5000)
base = 피크시간(12~19시) ? popularity * 0.3 : popularity * 0.2
closedPenalty = 영업중 아님 ? 0.2 : 0
penalty = clamp(base + closedPenalty, 0, 0.45)
```
최종 점수에서 `penalty * 10`점 차감.

---

### 5.2 맛집 스코어: `fetchRecommendedFoods()` (server.js:2796)

추천 여행지와 숙소 위치의 **가중 중심점(centroid)** 기준으로 주변 맛집 검색 후 스코어링.

**중심점 계산**:
- 모든 추천 여행지 좌표 수집
- 숙소 좌표는 **2배 가중** (두 번 추가)
- 좌표 없으면 `fetchGoogleCityCenter()` 사용

**Google Places 검색**:
- 쿼리 2개: `"${city} 인기 맛집"`, `"${city} 현지인 추천 레스토랑"`
- 각 쿼리 최대 10건, 반경 5km
- `languageCode: 'ko'`, `regionCode: 'JP'`
- 중복 제거 후 스코어링

**스코어링 (aiFit, 0~80점)**:

| 팩터 | 최대 점수 | 계산 |
|------|----------|------|
| ratingScore | 30점 | `(rating / 5) * 30` |
| reviewScore | 20점 | `min(20, log10(max(1, reviewCount)) * 8)` |
| proximityScore | 30점 | `max(0, 30 - distKm * 5)` |

```
aiFit = round(ratingScore + reviewScore + proximityScore)
```

**필터**: `score >= 3.0` (3점 미만 제외)
**정렬**: aiFit 내림차순, 최대 10개 반환

---

### 5.3 항공권 랭킹: `rankFlights()` (server.js:3168)

**기본 점수 = 1,000,000** 에서 감점 방식.

| preference | 공식 |
|-----------|------|
| `balanced` (균형) | `1,000,000 - price*0.7 - duration*260 - stops*45,000` |
| `cheap` (최저가) | `1,000,000 - price - stops*50,000` |
| `fast` (최단시간) | `1,000,000 - duration*180 - stops*50,000` |

- `price`: 원화 총 가격 (`totalPriceKRW`)
- `duration`: 총 비행시간 (분, `totalDurationMin`)
- `stops`: 총 경유 횟수 (`totalStops`)

---

### 5.4 숙소 랭킹: `rankStays()` (server.js:3457)

**기본 점수 = 1,000,000** 에서 가감 방식.

| preference | 공식 |
|-----------|------|
| `balanced` (추천순) | `1,000,000 + rating*1,200 - pricePerNight*5` |
| `price` (최저가순) | `1,000,000 - pricePerNight*6 - totalPrice*0.3` |
| `rating` (평점순) | `1,000,000 + rating*2,000 - pricePerNight*4` |

**AI 힌트 보너스** (채팅에서 추출된 선호도):

| 조건 | 보너스 |
|------|--------|
| 선호 지역 매칭 (`preferredAreas`) | +65,000 |
| 오션뷰 (`oceanViewStay`) | +30,000 |
| 공항 셔틀 (`preferAirportAccess`) | +28,000 |
| 보안/안전 (`safeAreaPriority`) | +26,000 |
| 공항 코드 매칭 | +22,000 |

---

### 5.5 로컬 여행지 스코어 (Google API 없을 때)
```
aiScore = 70 + themeScore(theme, place) * 10 - crowdScore * 2
```
- `themeScore`: 테마-카테고리 매칭 시 2, 불일치 0, mixed는 1
- `crowdScore`: 1~5 (CITY_DATA에 정의된 혼잡도)

---

### 5.6 맛집 적합도: `scoreFoodFit()` (server.js:3737)

맛집 검색(`/api/foods`)에서 사용되는 예산 기반 적합도 스코어.

**계산**:
- `baseScore`: 평점 (기본값 3.6)
- `price`: priceLevel (low=2, mid=3, high=4)

| 예산 | 공식 |
|------|------|
| `low` (가성비) | `baseScore * 20 + (5 - price) * 4` - 저렴할수록 보너스 |
| `high` (고급) | `baseScore * 20 + price * 3` - 비쌀수록 보너스 |
| `mid` (표준) | `baseScore * 20 + 10` - 고정 보너스 |

**반환값**: 정수 (대략 60~100 범위)

---

### 5.7 주요 헬퍼 함수

| 함수 | 위치 | 설명 |
|------|------|------|
| `clamp(v, min, max)` | :1791 | 값 범위 제한 |
| `haversineKm(a, b)` | :1795 | 두 좌표 간 거리 계산 (지구 반지름 6371km) |
| `normalizePriceLevel()` | :3720 | 문자열/숫자 가격 레벨을 1~4로 정규화 |
| `fetchWithTimeout()` | :2400 | AbortController 기반 타임아웃 fetch |
| `parseJsonFromText()` | :2371 | 안전한 JSON 파싱 (마크다운 코드블록 처리) |
| `classifyAiError()` | :2415 | AI 에러 분류 (rate_limit, timeout, invalid_key 등) |

---

## 6. AI 통합

### 6.1 AI 폴백 체인
모든 AI 기능은 동일한 폴백 패턴을 따른다:
```
Gemini (1순위) -> OpenAI (2순위) -> Rule-based (3순위)
```

**서킷 브레이커** (server.js:60-104):
- 429/503/404 에러 발생 모델을 인메모리 맵(`_modelFailures`)에 기록
- 쿨다운 기간(기본 60초) 내 모델은 API 호출 없이 스킵
- 연속 실패 시 쿨다운 점진 증가 (60s -> 120s -> 240s, 최대 5분)
- 모든 모델이 쿨다운이면 가장 오래전 실패한 모델 1개만 재시도
- `recordModelFailure()`, `isModelAvailable()`, `getAvailableModels()` 3개 함수
### 6.3 보안 & 입력 검증
- **레이트 리밋**: IP별 60회/분, `_rateLimitMap` 인메모리
- **요청 크기 제한**: `MAX_REQUEST_BODY_BYTES` = 500KB
- **페이로드 검증**: `validatePayload()` + `API_SCHEMAS` (타입/enum/범위/길이 체크)
- **OAuth CSRF**: Google OAuth 에 `state` 파라미터 생성/검증
- **XSS 방지**: `escapeHtml()` 적용 (항공권/숙소 카드, 카드 사진 alt)

### 6.4 UX 개선
- **Undo/Redo**: `_itinHistory[]` 스택 (30단계), Ctrl+Z/Y + UI 버튼
- **클라이언트 캐싱**: `getCachedOrFetch()`, 5분 TTL
- **접근성**: ARIA 라벨, 섹션 랜드마크, role 속성, alt text

### 6.5 계절별 추천
`seasonalBonus(primaryType, startDate)`:
- 3~4월 볚꽃: 공원/정원/사원 → 1.0
- 10~11월 단풍: 공원/정원/사원 → 0.95
- 7~8월 여름: 수족관/박물관/쇼핑 → 0.9
- 12~2월 겨울: 온천/리조트 → 0.95
- 기본: 0.5

### 6.6 경로 최적화
`optimizeDayRoute(places)`: 도시별 그룹화 + haversine 기반 최근접 이웃 알고리즘
- `extraRecommendations` 반환 전 적용하여 도시별로 인접 장소 그룹화
- `lat`/`lng` 좌표 없는 장소는 말미에 배치
- 다중 도시 데이터 교차 최적화 방지


### 6.2 여행 채팅 파싱
**목적**: 자연어 여행 요청을 구조화된 JSON으로 변환

**규칙 기반 파서** (`parseTravelChatInput`, server.js:1329):
- `extractRequestedLocality()`: 지역/랜드마크 추출
- `extractAirportCodeFromText()`: 공항 코드 감지
- `cityKeyByAirport()`: 공항->도시 매핑
- `extractWantedPlacesFromMessage()`: 원하는 장소 추출
- `matchMustAttractions()`: 필수 방문지 매칭
- `parseSpecialPrefsFromText()`: 특수 선호도 추출 (실내, 적은 걷기, 휴식일 등)

**AI 파서 호출**:
- **Gemini** (`parseTravelChatWithGemini`, server.js:1599): temperature 0.2, maxTokens 700
- **OpenAI** (`parseTravelChatWithOpenAI`, server.js:1518): Responses API, JSON Schema

**AI 파서 출력 구조**:
```json
{
  "city": "osaka",
  "theme": "foodie",
  "days": 3,
  "budget": "mid",
  "wantedPlaces": ["도톤보리", "유니버셜 스튜디오"],
  "routeCities": ["오사카", "교토"],
  "regionDayPlan": [{"cityLabel": "오사카", "days": 2, "unit": "day"}],
  "specialPrefs": {"indoor": true, "lessWalking": false}
}
```

### 6.3 일정 생성
**규칙 기반** (`createItinerary`, server.js:2045):
- 도시별 관광지 풀 구성
- 다도시 순회 시 `allocateDaysByCities()`로 일수 배분
- 일자별 시간대 배치 (오전/오후/저녁)
- 항공편 시간 반영 (첫날 도착, 마지막날 출발)
- `specialPrefs` 반영 (늦은 출발, 실내, 휴식일 등)

**AI 기반 일정**:
- **Gemini** (`createItineraryWithGemini`, server.js:2758): temperature 0.28, maxTokens 900
- **OpenAI** (`createItineraryWithOpenAI`, server.js:2643): JSON Schema 강제 출력

**일정 블록 구조**:
```json
{
  "day": 1,
  "date": "2025-04-01",
  "blocks": [{
    "start": "09:00",
    "end": "11:00",
    "place": "센소지",
    "category": "문화",
    "memo": "아침 일찍 방문 권장"
  }]
}
```

---

## 7. 한국어 주소 변환

### JP_KO_AREA 딕셔너리 (server.js:1834)
일본어 주소를 한국어 **음차(transliteration)** 로 변환하는 사전.
의미 번역이 아닌 **발음 기반 표기**를 사용한다.

| 카테고리 | 예시 |
|----------|------|
| 도시 | osaka->오사카, tokyo->도쿄, kyoto->교토 |
| 구(Ward) | chuo-ku->추오구, kita-ku->키타구, nishi-ku->니시구, minami-ku->미나미구 |
| 지역 | dotonbori->도톤보리, namba->난바, akihabara->아키하바라 |

> **주의**: 구 이름은 의미 번역(중앙구, 북구)이 아닌 음차(추오구, 키타구)를 사용.
> 한국인들이 실제로 사용하는 표현 방식을 따른다.

### PRIMARY_TYPE_KO + localizeType() (server.js:1907)
Google Places API의 `primaryType` (영문)을 한국어로 변환하는 사전 (80+ 항목).
여행지 카드의 카테고리, 맛집 카드의 장르 표시에 사용.

| primaryType | 한국어 |
|-------------|--------|
| tourist_attraction | 관광명소 |
| museum | 박물관 |
| shrine | 신사 |
| park | 공원 |
| shopping_mall | 쇼핑몰 |
| japanese_restaurant | 일식당 |
| ramen_restaurant | 라멘 |
| cafe | 카페 |
| izakaya | 이자카야 |
| ... (80+ 항목) | ... |

매칭 로직: 정확 매칭 -> 부분 매칭 -> snake_case를 공백으로 변환

### koreanizeAddress() (server.js:1875)
1. 우편번호 제거 (`〒xxx-xxxx`)
2. Japan/日本 제거
3. JP_KO_AREA 사전으로 영문->한국어 변환
4. 丁目(chome)/番地 상세 번지 제거
5. 카타카나 블록 제거
6. 구분자 정리

### shortArea() (server.js:1899)
`koreanizeAddress()` 결과에서 앞 2개 파트만 추출하여 간결한 지역명 반환.

---

## 8. 프론트엔드 아키텍처

### 8.1 주요 UI 섹션 (index.html)
1. **여행 조건** - 도시/날짜/일수/테마/예산 입력 + AI 채팅
2. **추천 결과** - 탭(여행지/맛집) + AI 일정 타임라인 + 지도
3. **여행지 탐색** - 독립 검색
4. **맛집 탐색** - 독립 검색
5. **항공권 탐색** - 편도/왕복/다구간 + 필터/정렬
6. **숙소 탐색** - 체크인아웃/인원/필터

### 8.2 상태 관리 (app.js)
프레임워크 없이 전역 변수로 상태 관리:
- `currentPlan`: 현재 여행 플랜 데이터
- `selectedFlight`: 선택된 항공편
- `selectedStay`: 선택된 숙소
- `itineraryPlan`: 현재 일정 (드래그앤드롭 편집용)
- `map`, `itinMap`: Google Maps 인스턴스
- `markers`: 지도 마커 배열

### 8.3 카드 렌더링
각 카드 타입별 HTML 템플릿:
- **dest-card**: 카테고리 chip + 점수 + 평점 + 지역 + 삭제 버튼
- **food-card**: 장르 chip + 별점 + 가격대 + 리뷰 수
- **rec-food-card**: card-top-row(제목+삭제) + 장르 chip + 별점
- **dest-search-card**: 카테고리 chip + 점수 + 정보

### 8.4 이벤트 처리
- **드래그앤드롭**: HTML5 Drag & Drop API로 일정 내 블록 재배치
- **삭제 버튼**: 추천 여행지/맛집 카드에서 개별 삭제 (`.rec-delete-btn`)
- **탭 전환**: 추천 여행지<->맛집, 항공편 편도<->왕복<->다구간
- **필터/정렬**: 항공편 가격/시간/공항/항공사 필터, 추천순/최저가/최단시간 정렬
- **일정에 추가 모달**: 장소 선택 -> Day/시간대 선택 -> 일정 삽입

### 8.5 지도 시스템
- 메인 지도: 추천 여행지 마커 표시
- 일정 지도 (`itinMap`): 일정 경로 표시 (각 블록 위치)
- Google Maps JavaScript API (`language=ko`, `region=jp`)

---

## 9. 데이터 흐름

### 9.1 통합 플랜 생성 흐름
```
사용자 입력 (도시/테마/예산/일수)
  |
  +-- [POST /api/travel-plan]
  |    |
  |    +-- recommendDestinations()
  |    |    +-- Google Places API 호출 (있으면)
  |    |    |    +-- scoreExternalPlace() 로 스코어링
  |    |    +-- CITY_DATA.highlights 폴백 (없으면)
  |    |
  |    +-- mergeSelectedDestinations()
  |    |    +-- 사용자 선택 + AI 추천 병합
  |    |
  |    +-- AI 일정 생성 (폴백 체인)
  |    |    +-- createItineraryWithGemini()
  |    |    +-- createItineraryWithOpenAI()
  |    |    +-- createItinerary() (규칙 기반)
  |    |
  |    +-- fetchRecommendedFoods()
  |         +-- 중심점(centroid) 계산
  |         +-- Google Places 맛집 검색
  |         +-- ratingScore + reviewScore + proximityScore
  |
  +-- 프론트엔드 렌더링
       +-- 추천 여행지 카드
       +-- 추천 맛집 카드
       +-- AI 일정 타임라인
       +-- 일정 지도
```

### 9.2 AI 채팅 플랜 흐름
```
사용자 자연어 입력
  |
  +-- [POST /api/ai-travel-chat]
  |    |
  |    +-- parseTravelChatInput() (규칙 기반 파싱)
  |    |    +-- 지역/공항/랜드마크 추출
  |    |    +-- 원하는 장소 추출
  |    |    +-- 특수 선호도 추출
  |    |
  |    +-- AI 파싱 (폴백 체인)
  |    |    +-- parseTravelChatWithGemini()
  |    |    +-- parseTravelChatWithOpenAI()
  |    |
  |    +-- normalizeTravelChatParsed()
  |    |    +-- AI 파싱 결과를 규칙 기반 결과와 병합
  |    |
  |    +-- buildTravelPlan() (위 통합 플랜과 동일)
  |
  +-- 프론트엔드: AI 채팅 로그 + 결과 렌더링
```

### 9.3 항공권 검색 흐름
```
사용자 입력 (출발/도착/날짜/타입)
  |
  +-- [POST /api/flights]
  |    +-- Amadeus API 호출 (키 있으면)
  |    |    +-- flightOffersSearch -> 파싱 -> 환율 변환
  |    +-- flightCandidates() (Mock 폴백)
  |    +-- applyFlightFilters() (가격/시간/공항/항공사)
  |    +-- rankFlights() (preference별 스코어링)
  |
  +-- 프론트엔드: 카드 렌더링 + 정렬탭 + 딥링크
```

---

## 10. 외부 API 연동

### Google Places API (New)
- **용도**: 여행지 추천, 맛집 검색
- **엔드포인트**: `https://places.googleapis.com/v1/places:searchText`
- **파라미터**: `languageCode: 'ko'`, `regionCode: 'JP'`
- **필드마스크**: `displayName, formattedAddress, rating, userRatingCount, googleMapsUri, primaryType, priceLevel, location`
- **호출 위치**: `fetchGoogleAttractions()`, `fetchRecommendedFoods()`, `GET /api/foods`

### Google Maps JavaScript API
- **용도**: 프론트엔드 지도 렌더링, 마커, 경로 표시
- **설정**: `language=ko`, `region=jp`

### Amadeus API
- **용도**: 실시간 항공권/숙소 데이터
- **환경**: test (기본) / production
- **인증**: OAuth2 client_credentials 토큰
- **폴백**: Mock 데이터 (Skyscanner/KAYAK 딥링크 포함)

### Gemini API
- **모델**: `gemini-2.5-pro` (기본)
- **용도**: 채팅 파싱, 일정 생성
- **설정**: temperature 0.2~0.28, JSON 출력 강제

### OpenAI API
- **모델**: `gpt-4o-mini` (기본)
- **용도**: 채팅 파싱, 일정 생성 (Gemini 폴백)
- **설정**: Responses API, JSON Schema structured output

### Supabase
- **용도**: 여행 플랜 영구 저장
- **테이블**: `travel_plans`
- **인증**: Service Role Key (서버사이드)

### exchangerate.host
- **용도**: USD->KRW 환율 조회
- **갱신 주기**: 12시간
- **폴백**: `.env`의 `FX_USD_KRW` (기본 1350)

---

## 11-1. 여행자 편의 기능 (v2)

### 일정 내보내기/공유
- 텍스트 복사 / 마크다운 복사 / Web Share API 링크 공유
- 항공권/숙소/일정/예산 통합 포맷팅

### 여행 준비 체크리스트 (Checklist)
- 6개 그룹 25+ 항목 (여권, 교통, 숙소, 통신, 짐, 앱)
- localStorage 저장 (세션 간 유지)
- 진행률 바 표시

### 긴급 정보 패널 (Emergency)
- 긴급 연락처 (경찰 110, 소방 119, Visitor Hotline)
- 주일 한국 대사관/영사관 4곳 연락처
- 의료/분실물/자연재해 대응 가이드

### 일본어 여행 회화 (Phrases)
- 7개 카테고리 40+개 표현 (인사, 식당, 길, 쇼핑, 숙소, 긴급, 알레르기)
- 일본어 + 로마지 발음 + 한국어 병기
- 클립보드 복사 / 키워드 검색

### 날씨 예보 (Weather)
- Open-Meteo API 10일 예보 (무료)
- 여행 기간 강조 표시
- 우천/추위/더위 조언 자동 생성

### 일정 최적화 분석 (Schedule Analysis)
- 매 렌더링 시 자동 분석
- 경고: 하루 3곳 초과, 종일+다른 일정 충돌, 장소 중복
- 팁: 야간도착/오전출발 시 일정 조언

### 장소 메모 (Place Memo)
- 일정 내 각 장소에 개인 메모 추가/수정/삭제
- localStorage 저장

### 환율 참고 표시
- 헤더에 엔화 환산 참고치 표시


## 11. 멀티턴 AI 채팅 (Multi-turn Chat)

### 개요
사용자가 AI 여행 채팅에서 꼬리질문(follow-up)을 할 수 있도록 대화 이력과 이전 파싱 조건을 유지합니다.

### 프론트엔드 (app.js)
- `chatHistory[]`: 최대 20개 대화 기록 유지 (role: user/assistant, content)
- `lastParsedConditions`: 마지막 성공적 파싱 결과 저장
- `appendAiChat()`: 메시지 표시 + chatHistory에 push
- AI 요청 시 `history` (최근 16개)와 `prevParsed`를 서버에 전송
- Follow-up 응답 시 `selectedDestinations` 스마트 병합 (기존 선택 유지 + 새 도시 추가)

### 백엔드 (server.js)
- `parseTravelChatWithGemini()`: history를 "대화 이력" 블록으로 프롬프트에 포함, prevParsed를 "이전 조건" 참조로 추가
- `parseTravelChatWithOpenAI()`: history를 input 메시지 배열로 변환, prevParsed를 사용자 데이터에 포함, `isFollowUp` 필드 추가
- `buildTravelChatPlan()`: follow-up 시 prevParsed와 현재 파싱 결과를 병합 (빈 필드는 이전 값 유지)
- 응답에 `isFollowUp` 불리언 포함

### 대화 흐름 예시
```
사용자: "도쿄 3박 4일 여행 계획 짜줘"
→ 파싱: {city: "도쿄", nights: 3, days: 4}
→ lastParsedConditions에 저장

사용자: "거기에 교토도 추가해줘"  (follow-up)
→ history에 이전 대화 포함
→ prevParsed: {city: "도쿄", nights: 3}
→ AI가 isFollowUp=true로 응답
→ 도쿄+교토 병합된 일정 생성
```


## 11-1. 여행자 편의 기능 (v2)

### 일정 내보내기/공유
- 텍스트 복사 / 마크다운 복사 / Web Share API 링크 공유
- 항공권/숙소/일정/예산 통합 포맷팅

### 여행 준비 체크리스트 (Checklist)
- 6개 그룹 25+ 항목 (여권, 교통, 숙소, 통신, 짐, 앱)
- localStorage 저장 (세션 간 유지)
- 진행률 바 표시

### 긴급 정보 패널 (Emergency)
- 긴급 연락처 (경찰 110, 소방 119, Visitor Hotline)
- 주일 한국 대사관/영사관 4곳 연락처
- 의료/분실물/자연재해 대응 가이드

### 일본어 여행 회화 (Phrases)
- 7개 카테고리 40+개 표현 (인사, 식당, 길, 쇼핑, 숙소, 긴급, 알레르기)
- 일본어 + 로마지 발음 + 한국어 병기
- 클립보드 복사 / 키워드 검색

### 날씨 예보 (Weather)
- Open-Meteo API 10일 예보 (무료)
- 여행 기간 강조 표시
- 우천/추위/더위 조언 자동 생성

### 일정 최적화 분석 (Schedule Analysis)
- 매 렌더링 시 자동 분석
- 경고: 하루 3곳 초과, 종일+다른 일정 충돌, 장소 중복
- 팁: 야간도착/오전출발 시 일정 조언

### 장소 메모 (Place Memo)
- 일정 내 각 장소에 개인 메모 추가/수정/삭제
- localStorage 저장

### 환율 참고 표시
- 헤더에 엔화 환산 참고치 표시


## 11. 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2025-03 | 초기 문서 작성 |
| 2025-03 | `fetchRecommendedFoods` name 스코핑 버그 수정 |
| 2025-03 | `/api/dest-search` 엔드포인트 추가 |
| 2025-03 | 추천 여행지/맛집 카드 삭제 기능 추가 |
| 2025-03 | UI/UX 폴리시 (카드 레이아웃, chip 태그, 액센트 보더) |
| 2025-03 | `JP_KO_AREA` 한국어 주소 변환 딕셔너리 추가 |
| 2025-03 | 구 이름 음차 수정 (중앙구->추오구, 북구->키타구 등) |
| 2025-03 | 일정 타임라인 CSS 추가 (234줄) |
| 2026-03 | 일정 내 드래그앤드롭 이동 버그 수정 (오전->오후 이동 시 사라지던 문제) |
| 2026-03 | 맛집 검색 locationBias->locationRestriction + 도시 좌표 자동 조회 + 한국 주소 필터 추가 |
| 2026-03 | PRIMARY_TYPE_KO 딕셔너리 + localizeType() 추가 - 카테고리/장르 영문->한국어 변환 (80+항목) |
| 2026-03 | ensureDynamicCityProfile area에 shortArea() 적용 - 영문 주소 잔존 문제 해결 |
| 2026-03 | locationRestriction->locationBias 롤백 (circle은 bias만 지원), 한국 주소 필터 유지 |
| 2026-03 | JP_KO_AREA 50+ 항목 추가 (City suffix, 단독 지역명, 장음 정규화) |
| 2026-03 | koreanizeAddress()에 macron 정규화 추가 (o/u/e/i/a) |
| 2026-03 | 멀티턴 AI 채팅 구현: chatHistory, prevParsed, follow-up 병합 |
| 2026-03 | FOOD_KEYWORDS 순서 수정 (스프카레>카레), 복합 food 추출 개선 |
| 2026-03 | CITY_ALIASES 확장: 홋카이도→sapporo, 규슈→fukuoka 등 지역→도시 매핑 |
| 2026-03 | normalizeTravelChatParsed: AI 파서 도시 오류 시 fallback 우선 적용 |
| 2026-03 | airport override 방지: 명시적 도시 감지 시 공항 코드로 도시 덮어쓰기 차단 |
| 2026-03 | follow-up routeCities 항상 병합 (이전 도시 유실 방지) |
| 2026-03 | 80개 테스트 케이스 풀테스트 통과 (TestList.txt) |
| 2026-03 | 추천 맛집 카드 중복 X 버튼 제거, 탐색→추천 추가/삭제 시 버튼 상태 동기화 |
| 2026-03 | 여행지/맛집 탐색 결과 수 대폭 확대 (10→20/30), 해외 장소 필터링 강화 |
| 2026-03 | 여행자 편의 기능 v2 추가: 일정 내보내기, 체크리스트, 긴급정보, 일본어회화, 날씨예보, 일정분석, 장소메모, 환율표시 |
| 2026-03 | AI 모델 서킷 브레이커 추가: 429/503 실패 모델 쿨다운 스킵 (60s~5min 점진 증가) |
| 2026-03 | 보안 강화: 입력 검증, 레이트 리밋(60req/min), 요청 크기 제한(500KB) |
| 2026-03 | OAuth CSRF 방지: Google OAuth state 파라미터 검증 추가 |
| 2026-03 | XSS 방지: 항공권/숙소 카드 escapeHtml 적용, 카드 사진 alt text |
| 2026-03 | 일정 Undo/Redo 추가: Ctrl+Z/Y 단축키 + 버튼, 히스토리 스택(30단계) |
| 2026-03 | 클라이언트 캐싱: 도시 목록 등 API 결과 5분 TTL 캐시 |
| 2026-03 | 계절별 추천 스코어링: seasonalBonus() 함수 추가 (벚꽃/단풍/스키 등) |
| 2026-03 | 경로 최적화: optimizeDayRoute() 최근접 이웃 알고리즘 |
| 2026-03 | 예산 상세 분석: budgetBreakdown 응답 추가 (식비/교통/활동 일별) |
| 2026-03 | Google Places 타임아웃: fetchWithTimeout 적용 |
| 2026-03 | 접근성(a11y): ARIA 라벨, 섹션 랜드마크, role 속성 추가 |
| 2026-03 | 에러 로깅 개선: 사일런트 catch 블록 console.warn 로 교체 |
| 2026-03 | 항공권 API Kiwi.com Tequila 연동 (Kiwi → Amadeus → Mock 3단계 폴백) |
| 2026-03 | 숙소 API Rakuten Travel 연동 (일본 특화, VacantHotelSearch + SimpleHotelSearch 폴백) |
| 2026-03 | 도시별 Rakuten 좌표 기반 검색 34개 도시 (CITY_CENTER_COORDS) |
| 2026-03 | convertToKRW에 JPY/EUR 환율 지원 추가 |
| 2026-03 | Rakuten API 좌표 기반 검색 전환 + Origin 헤더 추가 (403 해결) |
| 2026-03 | 숙소 검색: 브라우저 직접 호출 제거 (CORS), 서버 API 전용 |
| 2026-03-17 | v3 기능: fetchWithRetry, 보안헤더, 세션타임아웃, PDF내보내기, 지도경로선, 위시리스트, 검색히스토리, 선호도학습, 다국어전환 |
| 2026-03-17 | 자동 테스트 스위트 추가 (91개 테스트, node test_all.js) |
| 2026-03 | Klook 위젯 8초 타임아웃 + Viator/GetYourGuide 폴백 링크 |


## 12. OAuth 로그인 및 일정 저장 기능

### 12-1. 소셜 로그인 (Naver / Kakao / Google)
- **OAuth 2.0 Authorization Code Flow** 사용
- 각 프로바이더별 `/api/auth/{provider}` (리다이렉트) + `/api/auth/{provider}/callback` (콜백) 엔드포인트
- 서버사이드에서 code → access_token → profile 교환
- 세션: HMAC 서명된 쿠키 (`sid=uuid.signature`) + 인메모리 Map 저장
- 사용자 정보: `data/users.json` 파일 기반 저장

### 12-2. 일정 저장/불러오기
| 엔드포인트 | 메서드 | 설명 |
|---|---|---|
| `/api/my-plans/save` | POST | 현재 일정 저장 (로그인 필요) |
| `/api/my-plans/list` | GET | 내 저장 일정 목록 |
| `/api/my-plans/load?id=` | GET | 특정 일정 불러오기 |
| `/api/my-plans/delete?id=` | DELETE | 일정 삭제 |
| `/api/auth/me` | GET | 현재 로그인 상태 |
| `/api/auth/logout` | POST | 로그아웃 |
| `/api/auth/providers` | GET | 활성화된 OAuth 프로바이더 목록 |

- 저장 데이터: 일정(itinerary) + 항공권(flight) + 숙소(stay) + 폼 값
- 파일 기반: `data/saved_plans.json` (userId로 필터링)
- 프론트엔드: event delegation으로 로그인/저장/불러오기/삭제 처리

### 12-3. 환경 변수 (.env)
```
NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
KAKAO_REST_API_KEY / KAKAO_CLIENT_SECRET
GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
SESSION_SECRET
OAUTH_BASE_URL (배포시)
```

### 12-4. UI 구성
- 헤더 우측: 로그인/로그아웃 버튼 + 프로필 아바타
- 로그인 모달: 네이버(초록)/카카오(노랑)/구글(흰색) 브랜드 버튼
- 로그인 시: 💾저장 / 📂내 일정 버튼 노출
- 내 일정 사이드 패널: 저장된 일정 카드 목록 (불러오기/삭제)


## 12-5. v3 기능 추가 (2026-03-17)

### fetchWithRetry (서버 API 복원력)
- 외부 API 호출 시 지수 백오프(exponential backoff) 자동 재시도
- 최대 2회 재시도, 502/503/504 상태코드 대상
- 대기 시간: `min(1000 * 2^attempt, 4000)ms`

### 보안 헤더 강화
- **API 응답** (sendJson): X-Content-Type-Options: nosniff, X-Frame-Options: DENY, X-XSS-Protection, Referrer-Policy
- **정적 파일** (serveStatic): X-Content-Type-Options: nosniff, X-Frame-Options: SAMEORIGIN, Permissions-Policy (geolocation=self)

### 세션 타임아웃
- `SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000` (7일)
- `parseSession()`에서 만료 세션 자동 삭제
- 주기적 정리 interval에서 만료 세션 일괄 삭제

### PDF 내보내기
- `#btnExportPdf` 버튼 (내보내기 패널)
- `buildItineraryText('text')` 결과를 새 창에서 `window.print()` 호출
- CSS 포맷팅된 프린트 뷰

### 지도 경로선 (Polyline)
- `updateItinMap` 래핑하여 일정 지도에 일자별 경로선 표시
- `DAY_COLORS` 배열로 일자별 색상 구분
- `google.maps.Polyline` 사용, 기존 폴리라인 자동 정리

### 찜/위시리스트
- localStorage 키: `japantravel_wishlist`
- `getWishlist()`, `saveWishlist()`, `toggleWishlist()`, `renderWishlistPanel()`
- 여행지/맛집/탐색 카드에 하트 버튼 자동 추가
- 사이드 패널에서 저장 항목 관리

### 검색 히스토리
- localStorage 키: `japantravel_search_history` (최대 50건)
- `addSearchHistory()`, `renderSearchHistoryPanel()`
- 여행플랜/맛집/숙소/항공권/탐색 검색 시 자동 기록
- 클릭으로 해당 섹션 이동, 전체 삭제 기능

### 사용자 선호도 학습
- localStorage 키: `japantravel_preferences`
- `trackPreference(category, value)`: 도시/테마/항공사/숙소지역 추적
- `getTopPreferences()`: 카테고리별 상위 3개 반환
- `showPreferenceHints()`: UI에 선호도 배지(.pref-badge) 표시

### 다국어 전환 (한/영/일)
- `I18N` 딕셔너리: ko/en/ja 3개 언어
- `applyLanguage(lang)`: 섹션 헤더 및 버튼 텍스트 동적 변환
- localStorage에 선택 언어 저장, 페이지 로드 시 복원
- 헤더에 언어 전환 버튼 (한/EN/日)

### 자동 테스트 스위트 (test_all.js)
- **91개 테스트** 전체 통과
- 카테고리:
  - 코드 분석 (40개): fetchWithRetry, 보안헤더, 세션, PDF, 폴리라인, 위시리스트, 검색기록, 선호도, i18n
  - API 엔드포인트 (20+개): health, cities, maps-config, fx-rate, auth, travel-plan, dest-search, foods, flights, stays
  - 보안 (3개): path traversal, input validation, rate limiting
- 실행: `node test_all.js` (포트 13579에 테스트 서버 자동 시작/종료)

---
**변경 이력**: 2026-03-11 소셜 로그인(Naver/Kakao/Google) + 일정 저장/불러오기 기능 추가
