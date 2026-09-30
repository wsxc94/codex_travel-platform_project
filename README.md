# Tabimaru — AI 일본 여행 플래너

English: **Tabimaru — AI Japan Trip Planner** · 日本語: **Tabimaru — AI日本旅行プランナー**

일본 여행 계획을 한 화면에서 만드는 웹 앱입니다. 지역·날짜·일수·테마를 고르거나 AI 채팅으로 조건을 말하면, 여행지 추천과 일자별 일정을 만들고 항공권·숙소·맛집·투어도 함께 찾아 줍니다. 화면은 한국어·영어·일본어를 지원합니다.

- **운영 주소:** https://japanjapantravel.onrender.com/ (Render 무료 플랜이라 한동안 접속이 없으면 첫 로딩이 느릴 수 있습니다)
- **저장소:** https://github.com/wsxc94/tabimaru-japan-travel-planner
- **예전 이름:** JapanTravel Suite(저장소 `codex_travel-platform_project`). 이름만 바뀌었습니다. 운영 주소, Render 서비스 이름(`japantravel-suite`), 로그인 콜백 주소, 브라우저에 저장된 찜·메모·체크리스트는 그대로입니다. 예전 저장소 주소로 들어와도 GitHub가 새 주소로 연결해 줍니다.

## 지금 동작 방식 요약

- **기본은 무료 모드입니다.** 장소 추천은 내장 큐레이션 데이터(62개 도시)와 위키미디어 공용(Wikimedia Commons) 사진·좌표를 쓰고, 지도는 OpenStreetMap을 씁니다. Google Maps Platform은 한 번도 부르지 않으므로 요금이 생기지 않습니다.
- 무료 모드의 추천은 오류 때문에 대신 보여 주는 목록이 아니라 **정상 결과**입니다. 화면에는 "엄선한 추천 장소"로 표시됩니다.
- **사진:** 명소 카드에는 그 장소를 찍은 사진을 붙입니다. 그 장소의 사진이 없으면 도시 대표 사진을, 내장 맛집에는 음식 장르 예시 사진(라멘·스시 등)을 붙이고, 카드의 출처 줄에 "도시 대표 사진" / "음식 예시 사진"이라고 표시해 실제 장소·가게 사진으로 오해하지 않게 합니다.
- **영어·일본어 이름:** 명소 이름은 위키데이터의 영어·일본어 이름(`labels`)과 서버의 번역 표로 바꿔 보여 줍니다. 영어·일본어 화면의 카드와 일정에는 한국어가 남지 않습니다(일정 블록 앞의 시간대 표기는 화면이 번역합니다).
- 첫 화면을 여는 것만으로는 유료 API를 부르지 않습니다. [추천+AI일정 통합 생성]을 눌렀을 때만 일정·항공·숙소·맛집을 한 번씩 조회합니다. AI 일정도 이 버튼을 눌렀을 때만 만듭니다.
- Google(Places·지도)은 환경변수로 다시 켤 수 있습니다. 켜더라도 결제 오류·한도 초과가 나면 30분 동안 호출을 멈추고, 하루·월 호출 수에 상한(검색 하루 30회·월 900회, 사진 하루 30회·월 900회)을 둡니다. 자세한 방법은 [Google로 다시 전환하기](#google로-다시-전환하기)를 보세요.

## 화면

> **주의: 아래 스크린샷은 옛 화면입니다(2026-09-30 촬영, 예전 이름 JapanTravel Suite).** 그때 운영 서버는 결제가 꺼진 Google 키 때문에 매번 대체 목록으로 떨어지고 있었습니다. 그래서 장소 사진 대신 글자 타일이, 출처 줄에는 내부 이름(`local_curated_fallback`)이 보입니다. 새 이름(Tabimaru)과 무료 모드(위키미디어 사진·OpenStreetMap 지도)로 바뀐 화면은 배포 후 다시 찍어 교체할 예정입니다.

### 여행 조건 + AI 조건 채팅

지역·출발일·일수·테마를 고르고 [추천+AI일정 통합 생성]을 누르거나, "유니버셜 스튜디오랑 도톤보리 꼭 가고 싶고 3박 4일"처럼 자연어로 입력하면 조건을 자동으로 채웁니다. 상단 툴바에서 내보내기·체크리스트·긴급 연락처·회화·날씨·찜·검색 기록을 쓸 수 있고, 한국어/영어/일본어로 바꿀 수 있습니다.

![여행 조건 (옛 화면)](docs/screenshots/main.png)

### 추천 결과: 추천 여행지 + AI 일정

추천 여행지 카드는 끌어다 놓아 일정에 넣을 수 있습니다. 일정은 오전·오후·종일 블록과 아침·점심·저녁 맛집 칸으로 나뉘며, 되돌리기/다시 실행과 경로 교통비 계산을 지원합니다. 장소가 모자란 칸은 지어낸 장소 대신 "자유 일정"으로 표시하고, 지도와 교통비 계산에서는 뺍니다.

![추천 결과 (옛 화면)](docs/screenshots/plan.png)

### 탐색: 여행지·맛집

![탐색 (옛 화면)](docs/screenshots/explore.png)

### 항공권 탐색

편도·왕복·다구간을 지원하고, 추천순·최저가순·최단시간순으로 정렬합니다. Skyscanner·KAYAK 링크도 제공합니다.

![항공권 탐색 (옛 화면)](docs/screenshots/flights.png)

## 주요 기능

| 기능 | 기본(무료) | 선택 사항 / 설정이 없을 때 |
|---|---|---|
| 여행지 추천 | 내장 큐레이션 + 위키미디어 사진·좌표 (`assets/place-images.json`). 장소 사진이 없으면 도시 대표 사진 | `PLACES_PROVIDER=google`이면 Google Places(New). 실패하면 무료 데이터로 대신함 |
| 일정 생성 | 버튼을 누르면 Gemini → OpenAI 순서로 AI 일정 | AI 키가 없거나 응답이 잘리거나 형식이 틀리면 규칙 기반 일정 |
| AI 조건 채팅 | Gemini → OpenAI | 규칙 기반 해석 |
| 맛집 | 내장 큐레이션 + 음식 장르 예시 사진 | google 모드면 Google Places(New), 영업시간 표시 |
| 지도 | OpenStreetMap + Leaflet 1.9.4 | `MAP_PROVIDER=google` + 브라우저 키면 Google Maps JavaScript API |
| 항공권 | Travelpayouts 캐시 가격(요청 날짜가 비면 ±7일, 화면에 "다른 날짜" 표시) | 토큰이 없거나 결과가 없으면 "예시 데이터"로 표시 |
| 숙소 | Rakuten Travel(좌표 기반, 62개 도시). 날짜 조건 결과가 없으면 최저가 목록("날짜 미확인 최저가" 표시) | 키가 없거나 결과가 없으면 "예시 데이터"로 표시 |
| 경로 교통비 | AI 계산 또는 좌표 기반 거리 추정 | google 모드에서만 Directions API |
| 날씨 | Open-Meteo(무료, 키 없음), 모든 도시 | 위치를 모르는 도시는 다른 도시 날씨로 대신하지 않음 |
| 환율 | open.er-api(ExchangeRate-API) → Frankfurter(무료) | `FX_USD_KRW`·`FX_JPY_KRW` 고정값 → 코드의 대략값 |
| 투어 | Klook 위젯 | 8초 안에 안 뜨면 Klook·Viator·GetYourGuide 링크 |
| 로그인 · 내 일정 | Google · Naver · Kakao OAuth | 키가 없으면 로그인 버튼 숨김 |
| 플랜 저장소 | Supabase(선택, 로그인 필요) | 없거나 연결되지 않으면 503 |

그 밖에 일정 되돌리기/다시 실행, 계절 추천, 경로 최적화, 한/영/일 다국어(키 468개), 레이트 리밋·보안 헤더·XSS 방어가 있습니다.

## 출처 표시(폴백 투명성)

API 응답은 기존 필드(`source` 등)를 그대로 두고, 다음 정보 객체를 추가로 보냅니다. 화면은 이 값을 짧은 안내 문구(ko/en/ja)로 바꿔 보여 주고, 내부 이름이나 원시 오류 문자열은 보여 주지 않습니다.

- `POST /api/travel-plan` → `recommendationInfo`, `itineraryInfo`, `foodsInfo`
- `POST /api/destinations`, `POST /api/dest-search`, `GET /api/foods`, `POST /api/flights`, `POST /api/stays` → `sourceInfo`

모양: `{ kind, provider, reasonCode }`

| kind | 뜻 | 화면 문구 예(ko) |
|---|---|---|
| `curated` | 무료 모드의 정상 결과(내장 큐레이션 + 위키미디어) | 엄선한 추천 장소 |
| `live` | 실시간 공급자 결과(Google Places, Travelpayouts, Rakuten) | 실시간 정보 |
| `ai` | AI가 만든 일정 | AI가 만든 일정 |
| `rule` | 규칙 기반 일정 | 기본 일정 (규칙 기반) |
| `fallback` | 공급자 실패로 무료 데이터를 대신 씀(숙소는 날짜 조건 없는 최저가 목록) | 기본 목록 |
| `mock` | 실제 가격이 아닌 예시 데이터 | 예시 데이터 |

`reasonCode`는 대체한 이유입니다: `GOOGLE_KEY_MISSING`, `GOOGLE_BILLING_DISABLED`, `GOOGLE_PERMISSION_DENIED`, `GOOGLE_QUOTA_EXCEEDED`, `GOOGLE_ERROR`, `GOOGLE_CIRCUIT_OPEN`, `NO_RESULTS`, `AI_KEY_MISSING`, `AI_TRUNCATED`, `AI_INVALID_OUTPUT`, `AI_ERROR`, `PROVIDER_UNAVAILABLE`, `NO_LIVE_DATA`. 무료 모드의 정상 결과는 `reasonCode: null`입니다. 서버는 실제 공급자 오류(HTTP 상태·사유, 비밀값 제외)를 같은 사유당 10분에 한 번만 로그로 남깁니다. 응답의 `aiErrors`에는 `{ provider, code, reasonCode, action }`만 담고, 공급자 원문 메시지는 서버 로그에만 남깁니다.

카드 사진에는 `photoCredit: { artist, license, filePage, scope }`가 붙습니다. `scope`는 사진이 무엇을 찍은 것인지 알려 줍니다.

| scope | 뜻 | 화면 표시(ko / en / ja) |
|---|---|---|
| `place` | 그 장소 자체의 사진(위키미디어, google 모드에서는 Google 사진) | 표시 없음 |
| `city` | 장소 사진이 없어 붙인 도시 대표 사진. 좌표는 붙이지 않음 | 도시 대표 사진 / City photo / 都市の写真 |
| `genre` | 내장 맛집에 붙인 음식 장르 예시 사진(그 가게 사진이 아님) | 음식 예시 사진 / Example photo / 料理のイメージ |

## 사진 데이터 범위와 한계

`assets/place-images.json`(버전 1)은 `scripts/build-place-images.js`(`npm run build:place-images`)가 키 없이 Wikipedia·Wikidata(P18)·Commons API로 만듭니다. 서버는 시작할 때 이 파일을 한 번 읽고, 실행 중에는 위키미디어를 부르지 않습니다.

| 칸 | 범위(2026-10-01 기준) | 설명 |
|---|---|---|
| `places` | 명소 197곳: 사진 187곳, 좌표 194곳, 영어 이름 195곳, 일본어 이름 197곳 | 키는 `<도시 키>\|<명소 이름>`. 영어 이름이 없는 2곳(하나마키 온천, 와쇼 시장)은 서버 번역 표로 채움 |
| `cities` | 62개 도시 중 58곳 | 도시(섬) 항목의 대표 사진. 이름으로 찾지 못한 곳과 사진이 부적절한 곳은 공항 근처 항목을 직접 지정 |
| `foodGenres` | 음식 장르 23개(내장 맛집 250곳 중 228곳 해당) | 장르별 대표 음식 사진(파일 이름 고정) |

사진을 고르는 규칙:

- Commons의 자유 라이선스 이미지(CC BY, CC BY-SA, CC0, 퍼블릭 도메인)만 씁니다. 위키백과 로컬(비자유) 이미지와 GFDL 단독 라이선스 이미지는 쓰지 않습니다.
- **온천·목욕 사진은 입욕객이 보이지 않는 사진만 씁니다.** 이름이나 사진 파일에 온천·노천탕·모래찜 같은 말이 들어간 사진은 `node scripts/build-place-images.js --review-baths`로 모두 내려받아 눈으로 확인합니다. 입욕객이 보이면 관련 항목의 사진으로 바꿉니다(예: 유후인은 무소엔 노천탕 사진 대신 긴린코 호수 사진).
- 도시 사진 중 시청·호텔 건물처럼 도시를 대표하지 않는 사진은 뺐습니다.
- `server.js`의 명소 이름을 바꾸면 이 파일도 다시 만들어야 합니다.

남은 한계:

- 사진이 없는 명소 10곳과 데이터가 없는 명소(설명형 이름이나 위키 문서가 없는 곳, 예: 미야자와 겐지 기념관, 아야마루 곶, 무시로세 해안)는 도시 대표 사진으로 대신하고, 도시 사진도 없으면 글자 타일로 보입니다.
- 도시 사진이 없는 도시: 아키타(akita), 오다테(odate), 오카야마(okayama), 사가(saga). 시청·호텔 사진뿐이라 뺐습니다.
- 예시 사진이 없는 음식 장르: 향토요리, 쿠시카츠, 분식, 구이, 패스트푸드, 샐러드, 유제품(맛집 22곳). 이 맛집은 사진 없이 보입니다.
- 영어·일본어 이름은 위키데이터 항목 이름이라 카드가 말하는 대상과 조금 다를 수 있습니다(예: "하코다테 야경" → Mount Hakodate). 어색한 이름은 서버의 번역 표(`CURATED_PLACE_I18N`)에서 고칩니다.
- google 모드에서 Google 결과 맛집에 사진이 없으면 음식 장르 사진으로 채우지 않습니다(내장 맛집에만 붙임).

## Google로 다시 전환하기

Google Maps Platform은 **결제 계정이 연결된 프로젝트에서만** 동작합니다. 예전 운영에서는 무료 체험이 끝나 결제가 꺼진 상태였고, Text Search 하루 할당량(100건)도 테스트와 방문으로 금방 소진되어 사진 없는 대체 목록만 나왔습니다. 다시 켤 때는 아래 순서를 지키세요.

1. **예전 키 폐기.** 예전 `GOOGLE_MAPS_API_KEY`는 `/api/maps-config`와 사진 주소를 통해 브라우저에 공개된 적이 있습니다. 새 키를 만들고 예전 키는 삭제합니다.
2. **결제와 예산 알림.** Google Cloud 콘솔 → 결제에서 프로젝트에 결제 계정을 연결하고, "예산 및 알림"에서 월 예산 알림을 만듭니다. 예산 알림은 알려 주기만 하고 사용을 멈추지는 않으니, 3번의 할당량 상한과 함께 씁니다.
3. **콘솔 할당량 상한(가장 중요).** API 및 서비스 → 사용 설정된 API → 각 API → 할당량에서 하루 요청 수 상한을 낮춰 둡니다: Places API (New)(Text Search, Place Photos), Geocoding API, Directions API, 지도를 바꾸면 Maps JavaScript API. **서버의 상한 카운터는 메모리에 있어서 서버가 재시작하면 0부터 다시 셉니다.** Render 무료 플랜은 자주 재시작하므로, 요금을 확실히 막는 장치는 콘솔 할당량입니다.
4. **SKU별 월 무료 사용량 확인.** 2025년 3월부터 Google Maps Platform은 SKU마다 월 무료 사용량이 따로 있고, 한 요청은 요청한 필드 중 가장 비싼 SKU로 계산됩니다. 2026-10-01에 가격표에서 확인한 값은 아래와 같습니다. 켜기 전에 [가격표](https://developers.google.com/maps/billing-and-pricing/pricing)에서 다시 확인하세요.

   | 이 앱의 호출 | SKU | 월 무료 사용량 |
   |---|---|---|
   | 명소·맛집 검색(Text Search). 필드 마스크에 `rating`·`userRatingCount`·`priceLevel`·`currentOpeningHours`가 있어 Enterprise로 계산됨 | Text Search Enterprise | 1,000건 |
   | 카드 사진(`/api/place-photo`) | Place Details Photos | 1,000건 |
   | 진단 probe(필드 마스크 `places.id`만) | Text Search Essentials (IDs Only) | 제한 없음 |
   | 모르는 지역의 좌표 | Geocoding | 10,000건 |
   | 경로 교통비 | Directions | 10,000건 |
   | 지도(`MAP_PROVIDER=google`, 브라우저에서 호출) | Dynamic Maps | 10,000건 |

   서버 기본 상한(검색 하루 30회·월 900회, 사진 하루 30회·월 900회)은 1,000건 무료 사용량보다 낮게 잡은 값입니다. 검색 상한에는 Geocoding·Directions 호출도 들어가고, 사진은 따로 셉니다. 브라우저의 Maps JavaScript API 호출은 서버 상한 밖이라 콘솔 할당량으로만 막힙니다.
5. **키 두 개로 분리.**
   - 서버 키 `GOOGLE_MAPS_SERVER_KEY`: API 제한 = Places API (New), Geocoding API, Directions API. 서버에서 호출하므로 **HTTP 리퍼러 제한을 걸면 안 됩니다**(모든 호출이 거부됨). 애플리케이션 제한은 없음 또는 Render 아웃바운드 IP로 둡니다. 이 키는 브라우저로 절대 나가지 않습니다(사진도 `/api/place-photo` 프록시로 전달).
   - 브라우저 키 `GOOGLE_MAPS_BROWSER_KEY`(지도를 Google로 바꿀 때만): 애플리케이션 제한 = HTTP 리퍼러(`https://japanjapantravel.onrender.com/*`, 개발용 `http://localhost:3000/*`), API 제한 = Maps JavaScript API. 좌표가 없는 장소를 브라우저에서 찾게 하려면 Geocoding API도 허용합니다.
6. **Render 환경변수.** `PLACES_PROVIDER=google`, `GOOGLE_MAPS_SERVER_KEY`. 상한을 바꾸려면 `GOOGLE_DAILY_CALL_LIMIT`, `GOOGLE_MONTHLY_CALL_LIMIT`, `GOOGLE_PHOTO_DAILY_LIMIT`, `GOOGLE_PHOTO_MONTHLY_LIMIT`. 지도까지 Google로 바꾸려면 `MAP_PROVIDER=google`, `GOOGLE_MAPS_BROWSER_KEY`. 진단용으로 `DIAGNOSTICS_TOKEN`(긴 무작위 문자열)을 넣습니다.
7. **확인.** `GET /api/health`의 `providers`가 `{ "places": "google" }`인지 보고, `GET /api/ai-diagnostics`의 `google.circuitOpen`, `lastErrorCode`, `callsToday`·`callsThisMonth`, `photoCallsToday`·`photoCallsThisMonth`를 확인합니다. 실제 호출로 확인하려면 `curl -H "x-diagnostics-token: <토큰>" "https://…/api/ai-diagnostics?probe=1"`(Places 1회 호출)을 씁니다.
8. **되돌리기.** `PLACES_PROVIDER`를 지우거나 `free`로, `MAP_PROVIDER`를 지우거나 `osm`으로 바꾸면 즉시 무료 모드로 돌아갑니다.

그 밖의 참고:

- google 모드의 서버 보호 장치: 결제 꺼짐·권한 거부·할당량 초과 응답을 받으면 30분 동안 모든 Google 호출을 건너뜀, 하루·월 호출 상한(UTC 기준), 결과 캐시 12시간, 사진 캐시(서버 메모리 최대 200장·30MB·24시간, 브라우저 캐시 1일). 일정 생성 1회에 Text Search가 최대 4건(명소 2 + 맛집 2) 나가고, 같은 조건이 캐시에 있으면 0건입니다.
- 결과를 12시간 캐시하는 것이 Google Maps Platform 약관의 캐시 제한과 맞는지는 아직 확인하지 않았습니다. 켜기 전에 약관을 확인하세요.

## 데이터 출처와 저작자 표시

| 출처 | 쓰는 곳 | 라이선스·조건 | 화면 표기 |
|---|---|---|---|
| [Wikimedia Commons](https://commons.wikimedia.org/) | 명소·도시·음식 장르 사진 | 사진마다 다름(CC BY, CC BY-SA, CC0, 퍼블릭 도메인). CC BY-SA는 저작자·라이선스·출처 링크 표기 필요 | 카드마다 "사진: 저작자 · 라이선스"를 파일 페이지 링크와 함께 표시(도시·음식 사진은 앞에 종류 표시) |
| [Wikidata](https://www.wikidata.org/) | 명소 좌표, 영어·일본어 이름 | CC0(표기 의무 없음) | — |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | 지도 타일(`tile.openstreetmap.org`) | 지도 데이터 ODbL. OSM 재단 타일 사용 정책상 트래픽이 많아지면 별도 타일 제공자로 옮겨야 함 | 지도 오른쪽 아래 "© OpenStreetMap contributors" |
| [Leaflet](https://leafletjs.com/) 1.9.4 | 지도 라이브러리(unpkg, SRI 검증) | BSD-2-Clause | 지도 표기에 포함 |
| [Open-Meteo](https://open-meteo.com/) | 날씨 예보, 무료 지오코딩 | 데이터 CC BY 4.0(출처 표기 필요). 무료 API는 **비상업적 사용** 조건(하루 10,000회 이하) | 날씨 위젯·날씨 패널 하단에 "Weather data by Open-Meteo.com" 링크(ko/en/ja) |
| [ExchangeRate-API](https://www.exchangerate-api.com/) (`open.er-api.com`) | 환율(1순위) | 공개 엔드포인트는 출처 표기 필요, 하루 1회 갱신, 받은 환율을 다른 곳에 다시 배포하는 것은 금지 | 환율 칩 안에 "Rates By Exchange Rate API" 링크(ko/en/ja) |
| Frankfurter (`api.frankfurter.app`) | 환율(2순위) | 유럽중앙은행(ECB) 기준 환율, 표기 의무 없음 | — |
| Travelpayouts(Aviasales), Rakuten Travel | 항공 캐시 가격, 숙소 | 각 제휴 약관 | 예시 데이터에는 "예시" 표시가 붙고 일정에 넣을 수 없음 |

- 서버가 무료 공개 API(Open-Meteo, 환율)를 부를 때는 `User-Agent: TabimaruBot/0.1 (+https://github.com/wsxc94/tabimaru-japan-travel-planner)`을 보냅니다. 날씨는 좌표별 30분, 환율은 12시간 동안 캐시합니다.
- Open-Meteo 무료 API는 비상업적 사용 조건입니다. 제휴 링크(Travelpayouts·Klook) 수익이 생기면 상업적 사용으로 볼 수 있으니 약관을 다시 확인하고, 필요하면 유료 요금제로 바꾸세요.

## 로컬 실행

요구사항: **Node.js 20 이상**(전역 `fetch` 사용). 외부 패키지가 없어서 `npm install`은 필요 없습니다.

```powershell
git clone https://github.com/wsxc94/tabimaru-japan-travel-planner.git
cd tabimaru-japan-travel-planner
copy .env.example .env    # 필요한 값만 채웁니다. 비워 두면 무료 모드와 예시 데이터로 동작합니다.
node server.js            # 또는 npm start
```

브라우저에서 `http://localhost:3000`을 엽니다. 포트를 바꾸려면 `PORT`를 씁니다. `server.js`는 저장소 루트의 `.env`를 직접 읽고, 셸에 이미 있는 환경변수가 `.env`보다 우선합니다.

## 테스트

```powershell
npm test                  # = node test_all.js
```

- 실제 네트워크를 쓰지 않습니다. 서버를 벤더 키가 모두 빈 상태로 띄우고(`.env` 값은 쓰지 않음), Google·Gemini·Travelpayouts 주소를 테스트가 띄운 가짜 서버(포트 3205)로 돌립니다. 환율·날씨 같은 그 밖의 외부 호출은 `tests/support/net-guard.js`가 가짜 서버로 보냅니다.
- 서버(포트 13581)를 설정만 바꿔 여덟 번 띄웁니다: 무료 모드(기본), 무료 모드 사진·영어/일본어 이름, 프록시 신뢰(모든 도시 날씨·X-Forwarded-For 위조), Google 결제 꺼짐(대체 목록 + 30분 차단), Google 정상(사진 프록시·Gemini 잘림/정상/빈 일정·Travelpayouts), 하루 호출 상한, Geocoding 거부, OAuth 로그인 state·AI 오류 원문 제거.
- 보안 회귀 검사: 네이버·카카오·Google 로그인 시작 응답의 `oauth_state` 쿠키(HttpOnly, SameSite=Lax, Path=/api/auth, 10분) 값이 이동 주소의 `state`와 같은지 봅니다. 콜백에 쿠키가 없거나, 다른 쿠키이거나, `state`가 없거나, 다른 공급자의 `state`이거나, 한 번 통과한 `state`를 다시 보내면 모두 `/?authError=invalid_state`로 가는지도 봅니다. 토큰 교환은 가짜 서버가 거절하므로 실제 로그인이나 사용자 저장은 일어나지 않습니다. Gemini가 400과 오류 원문을 돌려줘도 `travel-plan`·`ai-travel-chat` 응답의 `aiErrors`에는 `provider`·`code`·`reasonCode`·`action`만 있고 원문은 없어야 합니다.
- 사진 검사: 도시 대표 사진(`scope: city`, 도시 좌표는 붙이지 않음)과 음식 장르 사진(`scope: genre`)이 Commons 주소·저작자·라이선스와 함께 붙는지, 사진 종류마다 `place-images.json`의 맞는 칸과 같은지, 예시 사진이 없는 장르는 비워 두는지 봅니다.
- 이름 검사: 영어·일본어 응답의 카드 이름이 `labels`를 쓰는지, 카드·맛집·일정 글자에 한국어가 남지 않는지, 현지화된 이름으로도 지도 좌표를 찾는지 봅니다.
- 브랜드 검사: `/api/health`의 `app`이 `tabimaru`, 페이지 제목·매니페스트 이름이 Tabimaru인지, 언어를 바꾸면 제목도 바뀌는지, 외부 호출의 User-Agent가 `TabimaruBot/0.1`인지 봅니다. 도메인에 묶인 값(운영 주소, Render 서비스 이름, OAuth 콜백 경로, `sid` 쿠키, localStorage 키, 매니페스트 `start_url`)이 그대로인지도 봅니다.
- 첫 화면은 `tests/support/browser-sandbox.js`로 `app.js`를 실제로 부팅해, 유료 API를 부르지 않는지 확인합니다. 이어서 [추천+AI일정 통합 생성]을 두 번 눌러도 일정 1회 + 항공·맛집·숙소 각 1회만 부르는지, 카드에 실제 `<img>`와 위키미디어 출처가 붙는지, Leaflet이 일정이 생긴 뒤에만 SRI와 함께 로드되는지, 빈 일정에 안내 문구가 나오는지도 봅니다. 사진·출처 표시 함수(`safeImageUrl`·`safeCreditUrl`·`cardPhoto`·`photoCreditHtml`)와 추천·맛집 카드에는 악성 값(`javascript:`·`data:` 주소, 비슷한 호스트, `/\`·`//` 우회 주소, 따옴표·HTML이 든 이름과 저작자)을 넣습니다. 그래도 사진은 Commons나 `/api/place-photo`, 출처 링크는 Commons 파일 페이지나 Google 기여자 페이지만 남고, 나머지 값은 모두 이스케이프되는지 봅니다.
- 그 밖에 응답에 키가 섞이지 않는지, 날씨 응답이 날짜·숫자만 담는지, CSRF 출처 검사, 긴급 전화번호 표시 = `tel:` 링크, CSS 변수 자기참조, 한국어 사전 누락, `render.yaml`·`.env.example`·README의 환경변수 목록과 기본값 누락도 검사합니다.
- 포트 13581과 3205가 비어 있어야 합니다. 2026-10-01 기준 314개 검사가 모두 통과합니다(몇 초 걸림).
- GitHub Actions(`.github/workflows/ci.yml`)가 push와 pull request마다 Node 20으로 `npm test`를 돌립니다.

수동 점검(개발용, CI 제외): `node _test_api.js`는 로컬 서버만 확인합니다. `node _test_api.js --google`을 붙이면 Google Places·Geocoding을 한 번씩 실제로 호출하므로 과금될 수 있습니다.

## 환경 변수

모두 선택 사항입니다. 없으면 해당 기능만 무료 데이터나 예시 데이터로 동작합니다. 값이 공백뿐이면 설정하지 않은 것으로 봅니다. 전체 목록과 설명은 `.env.example`에도 있습니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | 서버 포트(Render는 자동 지정) |
| `PLACES_PROVIDER` | `free` | `free`: Google 호출 0회. `google`: Places API(New)·Geocoding·Directions 사용 |
| `MAP_PROVIDER` | `osm` | `osm`: OpenStreetMap + Leaflet. `google`: Maps JavaScript API(브라우저 키가 없으면 `osm`) |
| `GOOGLE_MAPS_SERVER_KEY` | — | 서버 전용 키. 브라우저로 보내지 않음. 리퍼러 제한 금지 |
| `GOOGLE_MAPS_BROWSER_KEY` | — | 브라우저용 키(`/api/maps-config`로 공개). HTTP 리퍼러 제한 + Maps JavaScript API |
| `GOOGLE_MAPS_API_KEY` | — | 예전 단일 키. google 모드에서 서버 키가 없을 때만 서버 키로 씀(경고 로그). 브라우저로는 보내지 않음 |
| `GOOGLE_DAILY_CALL_LIMIT` | `30` | google 모드의 하루(UTC) 검색·지오코딩·경로 호출 상한. 넘으면 다음 UTC 자정까지 무료 데이터 |
| `GOOGLE_MONTHLY_CALL_LIMIT` | `900` | 위와 같은 호출의 월(UTC) 상한. 넘으면 다음 달까지 무료 데이터 |
| `GOOGLE_PHOTO_DAILY_LIMIT` | `30` | google 모드의 하루 사진(Place Photos) 호출 상한. 검색 상한과 따로 셈 |
| `GOOGLE_PHOTO_MONTHLY_LIMIT` | `900` | 사진의 월 상한. 넘으면 사진 대신 글자 타일 |
| `DIAGNOSTICS_TOKEN` | — | `/api/ai-diagnostics?probe=1`(실제 외부 호출)에 필요한 토큰. 헤더 `x-diagnostics-token`. 없으면 probe는 403 |
| `GEMINI_API_KEY` | — | Gemini 키(별칭 `GOOGLE_API_KEY`) |
| `GEMINI_API_MODEL` | `gemini-2.5-flash` | 1순위 모델. 429·503·404가 나면 gemini-2.5-flash → gemini-2.5-flash-lite → gemini-flash-latest 순으로 시도 |
| `OPENAI_API_KEY` | — | OpenAI 키(별칭 `OPENAI_KEY`). Gemini가 실패했을 때 사용 |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI 모델 |
| `AI_REQUEST_TIMEOUT_MS` | `15000` | AI 요청 타임아웃(최소 4000). 일정 생성은 30초 |
| `CHAT_PARSE_STRICT_AI` | `false` | `true`면 AI 채팅 해석이 실패할 때 규칙 기반으로 대신하지 않고 오류 |
| `TRAVELPAYOUTS_TOKEN` | — | 항공권 캐시 가격(Travelpayouts Data API) |
| `RAKUTEN_APP_ID` | — | Rakuten Travel 앱 ID |
| `RAKUTEN_ACCESS_KEY` | — | Rakuten Travel accessKey |
| `FX_USD_KRW` | — | 실시간 환율 조회가 모두 실패할 때 쓰는 고정값(둘 다 설정해야 `env`로 표시) |
| `FX_JPY_KRW` | — | 위와 같음(엔→원) |
| `SESSION_SECRET` | 실행마다 임의 값 | 세션 쿠키 서명값. 32바이트 이상 무작위 값 권장. 없으면 재시작 때 로그인이 풀림 |
| `PUBLIC_BASE_URL` | — | 공개 주소(예: `https://japanjapantravel.onrender.com`). CSRF 허용 출처 |
| `OAUTH_BASE_URL` | `http://localhost:<PORT>` | OAuth 콜백 기준 주소. CSRF 허용 출처에도 포함 |
| `TRUST_PROXY` | Render에서는 자동 | `1`이면 `X-Forwarded-For`의 마지막 값(프록시가 붙인 값)을 클라이언트 IP로 씀. 그 값이 Cloudflare 주소면 한 칸 앞 값 |
| `TRUST_PROXY_HOPS` | `1` | 프록시가 여러 단일 때 뒤에서 N번째 값을 씀. 배포 로그의 `[proxy]` 분포 줄을 보고 정함([deploy/DEPLOY.md](deploy/DEPLOY.md)) |
| `GOOGLE_OAUTH_CLIENT_ID` | — | Google 로그인 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | — | Google 로그인 |
| `NAVER_CLIENT_ID` | — | 네이버 로그인 |
| `NAVER_CLIENT_SECRET` | — | 네이버 로그인 |
| `KAKAO_REST_API_KEY` | — | 카카오 로그인 |
| `KAKAO_CLIENT_SECRET` | — | 카카오 로그인(선택) |
| `SUPABASE_URL` | — | 플랜 저장소(선택) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | 서버 전용 Supabase 키 |

테스트 전용(운영에서는 비워 둠): `PLACES_API_BASE`, `GEOCODE_API_BASE`, `GEMINI_API_BASE`, `TRAVELPAYOUTS_API_BASE`, `RAKUTEN_API_BASE`, `PLACE_IMAGES_FILE`.

더 이상 쓰지 않는 변수: `AMADEUS_API_KEY`, `AMADEUS_API_SECRET`, `AMADEUS_ENV`(Amadeus 경로 삭제), `APP_ENV`(코드에서 읽지 않음). Render에서 지워도 됩니다.

## API

| 경로 | 설명 |
|---|---|
| `POST /api/travel-plan` | 여행지 추천 + 일정 + 추천 맛집. `recommendationInfo`·`itineraryInfo`·`foodsInfo`, 일자별 `places`(지도 좌표), `placeCoords` 포함 |
| `POST /api/destinations`, `POST /api/dest-search` | 여행지 추천·검색(`sourceInfo`) |
| `POST /api/itinerary` | 규칙 기반 일자별 일정 |
| `POST /api/ai-travel-chat` | 자연어 여행 조건 해석 |
| `POST /api/flights` | 항공권(`oneway`·`roundtrip`·`multicity`, 필터). `sourceInfo`, `dateMatch`(`exact`·`nearby`·`null`) |
| `POST /api/stays` | 숙소(가격·평점(5점 만점, 리뷰 없으면 `null`)·편의시설 필터). `sourceInfo`, `dateMatch`(날짜 조건 없는 최저가면 `none`) |
| `GET /api/foods` | 맛집(`sourceInfo`) |
| `POST /api/route-cost` | 경로 교통비(장소 이름 최대 12개, 선택 `lang`: ko·en·ja) |
| `GET /api/weather?city=<도시 키>` | 날씨(모든 도시, 날짜와 숫자만). 위치를 모르면 404 |
| `GET /api/fx-rate` | 환율(`source`: `live`·`env`·`approximate`) |
| `GET /api/cities` | 도시 목록 |
| `GET /api/maps-config` | `{ "provider": "osm" }` 또는 `{ "provider": "google", "key": <브라우저 키> }` |
| `GET /api/place-photo?name=places/…/photos/…&w=100..1600` | google 모드의 사진 프록시(키 없이 이미지만 전달). 무료 모드에서는 404 |
| `/api/auth/*` | Google·Naver·Kakao 로그인, `me`, `logout`, `providers` |
| `/api/my-plans/save · list · load · delete` | 로그인 사용자의 내 일정(서버 `data/` 파일) |
| `/api/travel-plan/save · list · get` | 로그인 사용자의 Supabase 플랜 저장·조회(저장소가 없으면 503) |
| `GET /api/health` | 상태·공급자 모드(외부 호출 없음). `{ "ok": true, "app": "tabimaru", "brand": "Tabimaru", "providers": … }` |
| `GET /api/ai-diagnostics` | 설정 진단(비밀값 없음). `?probe=1`은 `DIAGNOSTICS_TOKEN` 필요 |

`GET /api/rakuten-config`는 삭제되었습니다(Rakuten 키는 서버에서만 씀).

## 프로젝트 구조

```text
server.js                    Node.js API 서버(외부 패키지 없음)
public/                      프론트엔드(index.html, app.js, styles.css, manifest, favicon.svg)
assets/place-images.json     무료 모드 사진·좌표·영어/일본어 이름(위키미디어)
scripts/build-place-images.js  위 파일을 다시 만드는 스크립트(npm run build:place-images)
test_all.js, tests/support/  통합 테스트와 가짜 벤더 서버·네트워크 차단·DOM 흉내
_test_api.js                 수동 점검 스크립트(개발용)
deploy/                      배포 가이드(DEPLOY.md), Supabase 스키마
docs/screenshots/            README 화면(옛 화면)
.github/workflows/ci.yml     CI(npm test)
render.yaml                  Render 설정(환경변수 이름 목록)
ARCHITECTURE.md              구조 설명
data/                        로그인 사용자·내 일정(로컬 파일, Git 제외)
```

## 배포

Render에서 `main` 브랜치를 자동 배포합니다. 키는 Render 대시보드의 환경변수로만 넣습니다. CI가 push마다 테스트를 돌리므로, Render 서비스 설정의 Auto-Deploy를 "After CI Checks Pass"로 바꿔 두면 테스트가 깨진 커밋은 배포되지 않습니다. 배포 직후에는 Render 로그의 `[proxy]` 분포 줄을 먼저 확인하세요. 자세한 내용은 [deploy/DEPLOY.md](deploy/DEPLOY.md)를 보세요.

## 보안 주의

- 실제 키는 `.env`(Git 제외)와 Render 환경변수에만 둡니다. `.env.example`에는 빈 값만 둡니다.
- Google 서버 키와 브라우저 키는 반드시 분리합니다. 서버 키는 어떤 응답에도 나가지 않고, 브라우저 키만 `/api/maps-config`로 공개됩니다.
- 예전 `GOOGLE_MAPS_API_KEY`와 Rakuten accessKey는 예전 코드(`/api/maps-config`, `/api/rakuten-config`)로 공개된 적이 있으니 새로 발급해 교체하세요.
- `/api/ai-diagnostics?probe=1`은 실제 외부 호출(과금 가능)을 하므로 `DIAGNOSTICS_TOKEN`이 맞을 때만 동작합니다.
- OAuth 로그인은 `state`를 로그인을 시작한 브라우저의 쿠키(`oauth_state`, HttpOnly, 10분)에 묶고 한 번만 쓸 수 있게 해, 다른 사람의 로그인 링크로 로그인되는 공격(로그인 CSRF)을 막습니다.
