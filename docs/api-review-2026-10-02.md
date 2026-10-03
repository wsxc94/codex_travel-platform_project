# Tabimaru 외부 API 검토 (2026-10-02)

이번에 한 일은 조사뿐이고 코드는 고치지 않았습니다. 아래 내용은 사실 확인을 거친 것만 썼고, 공식 근거를 찾지 못한 것은 "(미확인)"으로 표시했습니다.

## 1) 한 줄 결론

항공권과 숙소는 무료 공식 API 중에 지금(Travelpayouts, Rakuten)보다 데이터가 많은 곳이 사실상 없습니다. 그래서 그대로 두고 설정만 다듬으면 됩니다. 바꿀 가치가 큰 곳은 세 군데입니다.
- **AI**: Groq 무료를 기존 OpenAI 경로에 연결
- **맛집**: ホットペッパー API
- **이동·지도**: 교통비 계산에서 AI를 빼고 Google 지도 대중교통 링크와 OpenRouteService(ORS)로 바꾸기

그리고 **Rakuten 배지는 지금 규정 위반이라 먼저 고쳐야 합니다.**

## 2) 분야별 표

| 분야 | 지금 → 추천 | 판정 | 무료 한도 | 카드 | 일본 데이터 | 난이도 | 근거 |
|---|---|---|---|---|---|---|---|
| 항공권 | Travelpayouts Data API 유지 + 세 가지 손보기: market 지정해 비교, grouped_prices로 날짜별 최저가를 한 번에 받기, 응답 currency 확인 | 유지 | 토큰만 있으면 됨. 분당 600회 | 불필요 | 다른 사람이 최근 48시간에 검색한 가격의 캐시라 실시간이 아님. 지원 시장 26개에 한국·일본이 없어 ICN 출발은 ru 시장으로 떨어질 가능성이 큼. 편도 정확한 날짜는 최대 1건 | S | support.travelpayouts.com/hc/en-us/articles/203956163 · …/4402565416594 |
| 항공권 | Google Flights·네이버 항공권·Trip.com 링크 추가(buildFlightDeeplinks) | 채택 | 링크라 제한 없음 | 불필요 | 해당 사이트의 실시간 전체 가격 | S | 링크 주소 형식은 공식 문서가 없음(미확인) → 링크마다 동작 확인 |
| 항공권 | SerpApi Google Flights(정확한 날짜 결과가 0건일 때만 호출) | 선택, 직접 결정 | 월 250회, 시간당 50회. 모든 SerpApi 기능이 함께 씀. 성공한 검색만 차감. 왕복은 2회 호출 | 표기 없음(미확인) | Google Flights 실시간 | M | serpapi.com/pricing · serpapi.com/legal |
| 숙소 | Rakuten 유지 + **크레딧 배지 추가(필수)** + 상위 3~5곳만 HotelDetailSearch(20260731)로 평점·리뷰 추가 | 유지 | 무료. 한도는 비공개, 넘으면 429 | 불필요 | 일본 대형 OTA의 빈방·요금 실시간. 반경 3km 이내 30건, 일본어만. 항목별 평점(조식·석식 따로)과 최신 리뷰 | S | webservice.rakuten.co.jp/guide/credit · …/documentation/hotel-detail-search |
| 숙소 | Google Hotels·Agoda·Booking·じゃらん·Trip.com·一休 링크 추가 | 채택 | 링크 | 불필요 | 각 사이트 전체 재고 | S | 링크 주소 형식 비공식(미확인) |
| 숙소 | SerpApi Google Hotels | 선택, 직접 결정 | 위 항공권의 월 250회를 같이 씀 | 미확인 | 여러 OTA 가격, 민박 | M | serpapi.com/google-hotels-api |
| 투어 | Klook 링크 유지 + KKday 링크 추가 | 유지 / 채택 | 링크 | 불필요 | 일본 상품이 많고 한국어 사이트 있음 | S | KKday 수수료 조건(미확인) |
| 투어 | Viator Partner API Basic | 선택 | 무료, 즉시 발급, 10초에 150회 | 불필요 | 상품·리뷰·예약 가능 여부. 한국어 없음(일본어 있음). 결제는 viator.com에서만 | M | partnerresources.viator.com/travel-commerce/affiliate/ |
| 지도 | OSM 표준 타일 → **OpenFreeMap 벡터 지도**(MapLibre + maplibre-gl-leaflet) | 채택 | 조회 무제한. 키·가입 없음 | 불필요 | 지도 데이터에 name:ko 필드가 있음(확인함) → 지명을 한국어로 표시 가능. 운영 보장(SLA) 없고 예고 없이 중단될 수 있음 | M | openfreemap.org/tos/ · tiles.openfreemap.org/planet |
| 지도 | OSM 타일은 예비로 남기고 주소의 `{s}` 서브도메인 제거(app.js 4526·4735행) | 유지(수정) | 정책을 지키면 무료 | 불필요 | 지명이 일본어로만 나옴 | S | operations.osmfoundation.org/policies/tiles/ |
| 지도 | 국토지리원 淡色地図(골라 쓰는 레이어) / MapTiler Free(예비) | 선택 | 국토지리원은 신청 불필요 / MapTiler 월 5천 세션 | 불필요 | 일본 정부 공식 기본도(일본어) | S | maps.gsi.go.jp/development/ichiran.html |
| 이동시간 | Gemini 추측과 직선거리×1.3 → **OpenRouteService**(api.heigit.org) 도보·차량 경로 | 채택 | 경로 하루 2,000건, 경유지 50곳, 주소 검색 하루 3,000건 | 불필요 | 실제 걸어서 걸리는 시간과 경로선. 대중교통은 없음 | S~M | ask.openrouteservice.org/t/8068 |
| 이동시간 | OSRM 공개 데모 서버 | 예비 | 초당 1건, 비상업·적당한 사용만 | 불필요 | 도보·차량 | S | github.com/Project-OSRM/osrm-backend/wiki/Demo-server |
| 대중교통 | **Google 지도 대중교통 링크**(travelmode=transit), 구간별 | 채택 | 제한 없음, 키 불필요 | 불필요 | Google 지도 앱이 일본 대중교통 경로를 보여 줌. 다만 앱 안의 교통비 합계에는 못 넣음. 경유지는 모바일 3곳·PC 9곳이지만 대중교통(transit) 모드는 경유지를 받지 않음(그래서 구간별 링크만 만듦) | S | developers.google.com/maps/documentation/urls/get-started |
| 대중교통 | NAVITIME totalnavi(RapidAPI Basic) | 선택, 직접 결정 | 월 500건, 분당 50건. 하루 일정 하나를 한 번 호출로 처리(경유지 10곳) | **필요** | 운임(현금·IC)과 소요시간. 단, RapidAPI 경유로는 응답이 일본어로만 오고, 시각표·첫차·막차를 쓸 수 없어 평균 소요시간 기준 | M | api-sdk.navitime.co.jp/api/specs/api_guide/route_transit.html |
| 맛집 | 가게 데이터 없음(무료 모드는 '게 요리' 같은 음식 이름만) → **ホットペッパー グルメサーチAPI** | 채택 | 무료. 메일 주소만으로 키 발급. 호출 한도 숫자는 없음. 1회 100건 | 불필요 | 실제 가게 이름·좌표·예산·영업시간·사진. 평점은 없고 일본어만. 이자카야와 예약 사이트 등록 가게 위주 | M | webservice.recruit.co.jp/doc/hotpepper/reference.html · cdn.p.recruit.co.jp/terms/rws-t-1001/ |
| 맛집 | Yahoo! YOLP ローカルサーチ | 선택 | 하루 5만 건 | 불필요 | 리뷰 수·평점 순 정렬, 가까운 역. Yahoo! JAPAN ID를 만들 때 문자 인증이 필요한데 한국 번호가 되는지는 미확인 | M | developer.yahoo.co.jp/webapi/map/openlocalplatform/v1/localsearch.html |
| 맛집 | Google Places(New)(코드는 완성돼 있고 꺼져 있음) | 선택, 직접 결정 | 상세 검색·사진 각 월 1,000건(앱 상한은 900) | **필요** | 평점·리뷰 수·사진이 가장 좋음. 단 Google이 아닌 지도에 표시하면 안 되므로 MAP_PROVIDER=google도 켜야 함 | S | developers.google.com/maps/billing-and-pricing/pricing · maps-service-terms 14.2 |
| 장소 좌표 | Open-Meteo(도시 검색용) 유지 + 일정 장소 핀용 Nominatim 추가 | 유지 / 보조 | 초당 1건, 결과 저장 의무 | 불필요 | '伏見稲荷大社' 검색이 Open-Meteo는 0건, Nominatim은 정확(직접 재현) | S~M | operations.osmfoundation.org/policies/nominatim/ |
| 날씨 | Open-Meteo 유지 + 과거 날씨 API(여행일이 16일 넘게 남았을 때 예년 평균) | 유지 / 선택 | 비상업 하루 1만 건 | 불필요 | 일본 기상청 모델 포함. 제휴 수익이 생기면 '상업 이용'인지 애매함 | S | open-meteo.com/en/terms |
| 환율 | open.er-api 유지 + Frankfurter 주소를 api.frankfurter.dev/v1로 교체(지금은 301 리디렉트로 동작 중) | 유지(수정) | 사실상 제한 없음 | 불필요 | 엔화 → 원·달러 | S | frankfurter.dev/docs/ |
| 명소·사진 | Wikidata/Commons 유지 | 유지 | 무료 | 불필요 | 명소 이름 한·일·영과 자유 라이선스 사진 | – | 현행 |

## 3) AI

**지금 상황**
- Gemini 무료는 모델 하나당 하루 약 20회입니다(직접 측정, 공식 숫자는 비공개). 매일 태평양 시간 자정에 다시 생깁니다(코드 주석).
- 한도는 **API 키가 아니라 프로젝트 단위**입니다(공식). 키를 여러 개 만들어도 늘지 않습니다.
- 모델 7개를 순서대로 씁니다: 2.5-flash → 2.5-flash-lite → 3.1-flash-lite → 3-flash-preview → 3.5-flash-lite → 3.6-flash → flash-latest.
- 채팅 해석, 일정 생성, 교통비 계산 세 기능이 같은 한도를 나눠 씁니다.
- 3.5 Flash와 3.7 Flash는 503 오류 때문에, Gemma 4는 같은 말 반복 때문에 이미 뺐습니다(10-01 측정). 모델을 더 넣는 것으로는 해결이 안 됩니다.

**권장 순서**
```
채팅 해석: Groq gpt-oss-120b → Groq gpt-oss-20b → Gemini 7개 → 규칙 기반
일정 생성: Gemini 7개 → Groq gpt-oss-120b → gpt-oss-20b → qwen3.8-27b(미리보기) → 규칙 기반
교통비:    AI 호출을 없애고 ORS + 거리별 요금표 + Google 지도 링크로 대체 (AI를 남긴다면 Groq만)
(나중에 선택) 4순위: Cloudflare Workers AI gpt-oss-120b 또는 OpenRouter 무료 모델
```
같은 입력으로 비교해 봤을 때 Groq 품질이 충분하면, 일정 생성도 Groq를 앞에 두고 Gemini를 예비로 돌릴 수 있습니다.

**제공자별 비교**

| 제공자 | 공식 무료 한도 | 이 앱 기준 하루 처리량(추정) | 한국어·일본어 | JSON 출력 | 입력 데이터 사용 | 카드 |
|---|---|---|---|---|---|---|
| Gemini 무료(현재) | 모델당 약 20회(실측) | 일정만 맡기면 이론상 최대 140회. 404·503 때문에 실제로는 더 적음 | 검증됨 | responseSchema 지원 | 제품 개선에 쓰이고 사람이 읽을 수 있음 | 불필요 |
| **Groq 무료** | 모델마다 분당 30회, 하루 1,000회, 분당 8천 토큰, 하루 20만 토큰 | 하루 토큰 한도가 먼저 막힘. 채팅 해석(약 3.6천 토큰)은 모델당 하루 약 55회, 일정(약 7천 토큰)은 약 28건, 둘 다 하면 약 18회. 정식 모델 2개면 약 36회, qwen까지 넣으면 약 54회 | 공식 성능 자료 없음. 직접 비교 필요 | Responses API(**베타**)가 json_schema 지원. 형식을 강제하는 strict 모드는 gpt-oss와 qwen이 지원한다고 문서에 있으나 Responses 경로에서 되는지는 첫 테스트로 확인. 스트리밍과 함께는 못 씀 | 기본적으로 보관 안 함. 악용 조사 목적으로만 최대 30일. 보관 완전 끄기(ZDR)는 누구나 가능 | 불필요(간접 확인) |
| Gemma 4(같은 Gemini 키) | 무료. 한도 비공개 | 미상(AI Studio에서 확인) | Flash보다 낮을 수 있음 | responseSchema 지원 여부가 문서에 없음 | Gemini 무료와 같음 | 불필요 |
| Cloudflare Workers AI | 하루 10,000 neurons(사용량 단위) | gpt-oss-120b로 약 19건, qwen3.8-27b로 약 6~9건 | 모델에 따라 다름 | gpt-oss는 JSON 형식을 보장하는 모델 목록에 없음 | 학습에 안 씀 | 불필요 |
| OpenRouter 무료 모델 | 분당 20회, 하루 50회($10을 한 번 결제하면 하루 1,000회) | 약 25~50건 | 무료 모델 목록이 자주 바뀜 | Chat Completions 방식만 문서화. 제공자마다 보장 수준이 다름 | 설정에서 '학습할 수 있는 제공자' 끄기. Poolside 모델은 학습에 씀 | 무료 50회는 불필요 |
| Gemini 유료 Tier 1(별도 프로젝트 + 지출 한도) | 선불 최소 $5(12개월 뒤 만료) | 사실상 제한 없음. 월 50건이면 약 $0.13~$2.6 | 지금과 같음 | 지금과 같음 | 학습에 안 씀 | **필요** |

**고칠 코드** (지금 server.js의 OpenAI 관련 환경변수는 OPENAI_API_KEY와 OPENAI_MODEL뿐이라, 아래 1~5는 새로 만드는 이름입니다)
1. `OPENAI_BASE_URL`(기본값 `https://api.openai.com/v1`)을 추가하고, 4327·8904행의 `/responses`와 8417행의 `/models/…`에 적용합니다. (S)
2. `OPENAI_MAX_OUTPUT_TOKENS`(예: 3500)를 추가합니다. 6일 이상 일정은 출력 8192 토큰을 요청하는데(8369~8371행), Groq의 분당 8천 토큰을 넘을 수 있어 그보다 작게 묶습니다. 요청 크기를 한도에 어떻게 세는지는 공식 문서에 없어 안전하게 잡는 조치입니다. 긴 일정은 잘릴 수 있으니, JSON 검사에 실패하면 다음 단계로 넘어가게 합니다. (S)
3. `OPENAI_REASONING_EFFORT`를 추가하고 요청 본문에 `reasoning:{effort}`로 넣습니다. gpt-oss는 low, qwen은 none을 권장합니다. gpt-oss의 기본값은 문서에 없습니다. (S)
4. `OPENAI_FALLBACK_MODELS`를 추가합니다. 429·413 오류나 JSON 검사 실패가 나면 다음 Groq 모델로 넘어갑니다. (S~M)
5. `AI_CHAT_PROVIDER_ORDER=openai,gemini`를 추가해 채팅 해석(4436~4442행)만 Groq를 먼저 씁니다. 일정 생성(9371~9376행)은 지금처럼 Gemini가 먼저입니다. (S)
6. 교통비(10993행): Gemini 우선 호출을 없앱니다. 지금은 AI가 추측한 값에 `estimated:false`가 붙어 실측처럼 보이므로, 추정값임을 표시하도록 바꿉니다. (S)
7. `GEMINI_TOTAL_BUDGET_MS`를 20000 안팎으로 줄이는 것을 검토합니다. 지금 기본값 40초를 Gemini가 다 쓰면, Groq로 넘어가기 전에 목표 응답 시간(15~30초)을 넘깁니다. 이 값은 이미 환경변수로 바꿀 수 있습니다. (설정만)
8. (선택) 196행 `GEMINI_THINKING_LEVEL_MODEL_RE`에 `^gemma-4`를 넣으면 Gemma에 생각 끄기('minimal')를 보냅니다. 지금은 아무 설정도 안 보내 생각이 켜진 채로 돌았을 수 있습니다. 다만 공식 표기는 `thinking_level`이라 400 오류가 나는지 확인이 필요합니다. 7319행 `looksLikeOpenAiKey`에 `gsk_`를 허용하는 것은 진단 화면 표시만 바뀌고 실제 호출과는 무관합니다.

Render 환경변수 예시:
```
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_API_KEY=gsk_...
OPENAI_MODEL=openai/gpt-oss-120b
OPENAI_FALLBACK_MODELS=openai/gpt-oss-20b,qwen/qwen3.8-27b
OPENAI_MAX_OUTPUT_TOKENS=3500
OPENAI_REASONING_EFFORT=low
AI_CHAT_PROVIDER_ORDER=openai,gemini
GEMINI_TOTAL_BUDGET_MS=20000
```
qwen3.8-27b는 공식적으로 "평가 전용, 예고 없이 종료될 수 있음"이라 항상 맨 뒤에 둡니다.

## 4) 효과가 가장 큰 3가지와 하지 말 것

**효과가 가장 큰 3가지**
1. **Groq 연결**: 채팅 해석을 Groq로 옮겨 Gemini 한도는 일정 생성에만 씁니다. Gemini 한도를 다 써도 일정이 만들어집니다. 개인 한 명이 쓰기에 하루 수십 건이면 충분하고, 비용과 카드 등록이 없습니다.
2. **ホットペッパー 맛집**: 요나고·돗토리 같은 지방 도시에서 '게 요리' 대신 실제 가게 이름·좌표·예산·사진이 나옵니다. 약관 조건이 있어서, 가게 정보는 원문 그대로 일정 옆 별도 카드로 보여 줍니다(AI 문장에 섞지 않기). 저장은 메모리에 24시간 이내만 하고, Recruit 제공 출처를 표시합니다. 이 사이트의 제휴 수익이 약관이 금지하는 '수입'으로 해석될 여지도 있습니다.
3. **교통비 AI 제거 + Google 지도 대중교통 링크 + ORS 도보 시간**: 교통비 버튼이 AI 한도를 쓰지 않습니다. 실측처럼 보이던 추측이 사라지고, 버튼 하나로 Google 지도에서 실제 일본 대중교통 경로를 볼 수 있습니다. 여기에 OpenFreeMap을 더하면 지도의 지명이 한국어로 나옵니다.

**하지 말 것**
- 공식 문서로 확인됨:
  - Cerebras: 카드 등록 후 30일 체험뿐
  - GitHub Models: 2026-07-30 종료
  - Gemini 키를 여러 개 만들기: 한도가 프로젝트 단위라 효과 없음
  - Gemini 결제를 지금 프로젝트에 바로 연결하기: 그 프로젝트의 무료 등급이 사라짐(결제를 켜면 유료 등급으로 전환). 유료로 간다면 새 프로젝트를 만들고 지출 한도를 걸고, Google Places 결제와 섞지 않기
  - Google Places 결과를 지금 지도(Leaflet/OSM)에 찍기: 약관 14.2 위반
  - ホットペッパー 데이터를 AI로 다시 쓰거나 Supabase에 24시간 넘게 저장하기
  - Transitous 경로 API를 사전 연락 없이 쓰기
  - ORS 옛 주소 api.openrouteservice.org 쓰기: 11월 2~6일에 종료
  - SerpApi: 무료 플랜은 법적 보호(Legal Shield) 대상이 아니고, Google이 낸 소송이 진행 중입니다(심리가 9월 29일로 보도됐고 결과는 미확인). 위험을 감수하겠다고 직접 결정하기 전에는 붙이지 않기
- 판단 보류:
  - Mistral 무료: 공식 문서에 "평가·프로토타이핑용"이라고 돼 있고 한도 숫자가 비공개
  - 여러 프로젝트를 만들어 무료 한도를 늘리기: 한도 우회로 볼 소지가 있어 권하지 않음(약관 원문은 미확인)
- 조사 단계에서 확인했지만 이번에 다시 검증하지는 않은 것:
  - Amadeus Self-Service: 2026-07-17 종료
  - Kiwi Tequila: 초대받은 곳만 사용 가능
  - Skyscanner, Booking, Agoda, Expedia, Trip.com API: 파트너 계약 필요
  - じゃらん API: 2020년부터 신규 가입 중단
  - Hotellook: 2025-10 종료
  - Travelpayouts 실시간 검색 API: 월 이용자 5만 명 이상만, 예외 없음
  - Google 대중교통 API: 일본은 결과 없음(코드 주석도 같음). 결제를 다시 켜도 해결 안 됨
  - ぐるなび(무료 종료), 食べログ(API 없음, 스크래핑 금지), Yelp(유료)
  - Cohere·NVIDIA(평가 전용), Hugging Face·Together(무료가 사실상 없음), SambaNova(모델당 하루 20회라 Gemini와 같은 문제)

## 진행 상황 (2026-10-03 갱신)

| 순서 | 상태 |
|---|---|
| 0 규정 정비 | 완료·배포(Rakuten 배지, OSM `{s}` 제거, Frankfurter v2 `providers=ecb`) |
| 1 Groq 연결 | 완료·배포(3절 1~5). Groq 키는 `GROQ_API_KEY`(Groq 주소에만 보냄). 같은 요청 5개 비교: 품질은 비슷하나 Groq만 쓰면 분당 토큰 한도로 자주 막혀, 일정은 Gemini 먼저·채팅 해석은 Groq 먼저로 유지. 3절 7(`GEMINI_TOTAL_BUDGET_MS` 20초)은 아직 적용 안 함(운영 health 40000, 사용자 결정 대기). 3절 8의 gemma-4 생각 끄기는 안 함(선택) |
| 2 교통비 AI 제거 | 완료·배포(거리 추정 + 구간별 Google 지도 대중교통 링크). Google 지도 대중교통 모드는 경유지를 받지 않아 '하루별' 링크는 만들지 않음(구간별만) |
| 3 ホットペッパー | 완료·배포(`HOTPEPPER_API_KEY`, 도시 중심 3km 30곳, 장르 섞기, 크레딧) |
| 여행지 30곳 확장 | 완료(아직 커밋·배포 전, 2026-10-03). `assets/city-places.json` 재생성(목표 30, 1,378곳, 한국어 이름 1,378곳), 이름 검사 통과, `NAME_FIXES`·`EXCLUDE_QIDS` 검토 반영 |
| 4 ORS 도보 시간 | 아직(키 필요) |
| 5 항공 손보기 + 링크 | 완료(커밋 전, 2026-10-03): 통화 확인·변환, `grouped_prices`(4초, 병렬), 항공·숙소·KKday 링크, 다구간 링크 날짜 버그. market은 기본 그대로 — `scripts/travelpayouts-check.mjs`로 비교 후 결정(결정 대기). 링크 직접 눌러 보기 남음 |
| 6 OpenFreeMap | 완료(커밋 전, 2026-10-03): MapLibre GL + maplibre-gl-leaflet, 지명 ko/en/ja, 실패하면 OSM |

다음 세션 할 일은 `docs/handoff.md` 7절이 단일 출처다(이 문서는 외부 API 작업의 세부만 둔다).

## 5) 직접 하셔야 할 일과 구현 순서

| 순서 | 작업 | 직접 하실 일 | 완료 기준 |
|---|---|---|---|
| 0 | 규정 정비: Rakuten 배지(제공된 HTML 그대로), OSM 주소의 `{s}` 제거, Frankfurter 주소 교체 | 없음 | 화면에 'Supported by Rakuten Developers' 배지가 보이고, 환율 요청에 301 리디렉트가 없음 |
| 1 | Groq 연결(3절 1~5, 7) | console.groq.com 가입 → `gsk_` 키 발급 → Render에 환경변수 입력. 보관 완전 끄기(ZDR)는 선택. 카드 불필요 | 같은 입력 5개로 Gemini와 Groq 비교: JSON 정상률, 한국어가 자연스러운지, 30초 이내 응답. Gemini 한도를 다 쓴 상태에서도 일정 생성 성공 |
| 2 | 교통비 AI 제거 + Google 지도 대중교통 링크 | 없음 | 교통비 버튼이 Gemini를 한 번도 부르지 않고, 결과에 '추정' 표시, 구간별 링크가 실제로 열림(대중교통 모드는 경유지를 받지 않아 하루별 링크는 뺌) |
| 3 | ホットペッパー 연동 | webservice.recruit.co.jp/register 에 메일 주소로 키 신청 → `HOTPEPPER_API_KEY`(새 이름) 입력 | 요나고·돗토리·메만베쓰에서 실제 가게 3곳 이상, 출처 표시, 원문 그대로, 저장 24시간 이내 |
| 4 | ORS 도보 시간 + Nominatim 장소 핀 | HeiGIT 가입 → 키 발급 → `ORS_API_KEY`(새 이름) 입력 | 2km 이하 구간에 실제 도보 시간·경로선이 나오고, 좌표 없던 일정 장소 핀이 지도에 표시됨 |
| 5 | 항공권 손보기 + 링크 추가(항공·숙소·KKday) | 없음 | market 기본값과 지정값의 결과 수 비교 로그, 응답 currency=krw 확인, 링크마다 직접 눌러 확인 |
| 6 | OpenFreeMap으로 전환 | 없음 | 한국어 화면에서 주요 도시·역 이름이 한국어로 나오고, 실패하면 OSM 지도로 대체됨 |
| 7 | 결정이 필요한 것 | NAVITIME(카드 필요, 일본어·평균 시간만), SerpApi(소송·스크래핑 위험), Gemini 유료(카드, 새 프로젝트), Google Places(카드, Google 지도 같이 켜기) 각각 할지 말지 결정 | 결정한 것만 별도 작업으로 진행 |
| 8 | 선택 | Gemma 4: AI Studio에서 한도를 확인한 뒤 생각을 끄고 다시 시험. Rakuten 상세 평점, 과거 날씨 평균, Cloudflare 4순위, Viator·Yahoo 가입 | 각 항목 5건 테스트 통과 |

바로 다음에는 0(키가 필요 없는 규정 정비)과 1(Groq 연결)을 함께 하는 것을 권합니다. 위반 상태를 정리하면서 AI 한도 문제를 가장 적은 코드로 풀기 때문입니다. 이번 결과로 끝난 것은 조사뿐이고, 한도 문제가 실제로 해결됐는지는 1번의 비교 테스트를 통과해야 알 수 있습니다.

참고한 코드: C:\Users\wx94\OneDrive\바탕 화면\codex_project\server.js, C:\Users\wx94\OneDrive\바탕 화면\codex_project\public\app.js