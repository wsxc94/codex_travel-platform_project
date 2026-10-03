# 인수인계 (세션이 바뀔 때마다 갱신)

마지막 갱신: 2026-10-03, 원래 PC(OneDrive `바탕 화면\codex_project`)에서. 다음 세션(다른 PC 포함)은 이 문서와 `CLAUDE.md`를 먼저 읽는다.

## 1. 지금 상태

- 운영: https://japanjapantravel.onrender.com (Render 무료, `main` 푸시 → 자동 배포. Auto-Deploy가 아직 "On Commit"이면 CI 결과와 상관없이 배포되니 6절 참고)
- 운영 코드: `6da5de3`(2026-10-03 배포, 2절의 첫 묶음). 테스트 1,103개
- **원래 PC 작업 트리에 커밋 안 한 두 번째 묶음이 있다**(2-2절 + `CLAUDE.md` 다이어트). 스테이징만 했고 `npm test` 1,575개 통과. 사용자가 배포를 요청하면 커밋·푸시한다. `render.txt`(사용자 임시 파일)·`CLAUDE.md.bak`(백업)·`.claude/`(임시 작업 폴더)는 넣지 않는다 — `git add -A` 금지, 파일을 지정해서 커밋
- 푸시(원래 PC): 저장된 자격 증명은 회사 계정이라 403. `.env`의 `GITHUB_WSXC94_TOEKN`을 같은 프로세스에서 읽어 `GIT_ASKPASS`로 넘기고 `git -c credential.helper= push https://wsxc94@github.com/wsxc94/tabimaru-japan-travel-planner.git main`(값 출력·저장 금지)
- 운영 설정(Render): `GROQ_API_KEY`, `OPENAI_BASE_URL=https://api.groq.com/openai/v1`, `OPENAI_FALLBACK_MODELS=openai/gpt-oss-20b,qwen/qwen3.8-27b`, `OPENAI_MAX_OUTPUT_TOKENS=3500`, `OPENAI_REASONING_EFFORT=low`, `AI_CHAT_PROVIDER_ORDER=openai,gemini`, `HOTPEPPER_API_KEY`. `GEMINI_TOTAL_BUDGET_MS`는 기본 40초 그대로(health `ai.geminiTotalBudgetMs` 40000)
- AI 순서: 채팅 해석은 Groq → Gemini, 일정은 Gemini → Groq → 규칙 기반. 교통비는 AI를 쓰지 않는다

## 2. 2026-10-03 원래 PC 세션에서 한 일

### 2-1. 첫 묶음 (`6da5de3`, 배포됨)

| 묶음 | 내용 |
|---|---|
| 알려진 문제 1 | 영어·일본어 도시별 일수('Osaka 3 days then Kyoto 2 days', '大阪3日間、京都2日間', '3 days in Osaka…', 'N nights', 'after'), 한국어 '3일 오사카, 2일 교토'·'N일간·N일 동안'·'그중/중 N일은'·'하루는 교토'·같은 도시 두 번·쉼표 없는 'N박은', 하루 예산·호텔 N박·JR패스는 일수가 아님, 도시 안 동네(浅草·Harajuku)는 지역이 아님. 영어·일본어의 '데이터 없는 지역'은 아는 지역 이름(당일치기 명소 별칭 + 작은 목록)일 때만 센다 |
| 알려진 문제 2 | 영어 일정에 한국어 이름(도시별 대표 카드 현지화, `nameKo` 유지), 언어를 ko로 바꿔 다시 만들면 한국어 이름으로 되돌림 |
| 알려진 문제 3 | 긴 여러 도시 일정 AI 후보: 도시마다 '그 도시 일수×3' 몫(`selectAiPicks`, `expandPicksForAi`의 `cityTargets`), 추천 카드는 일정에 든 곳을 자르지 않음 |
| 알려진 문제 4·7 | 식사 도시 맞추기(h-1a, 꼭 갈 곳 식당은 그 도시 날로 옮김, 출발 전 식사는 떠나는 도시 가게 유지), 식당 반복 줄이기 |
| 알려진 문제 5 | 이동 시간 표 `CITY_TRANSFER_HINTS`(삿포로↔하코다테 특급 약 3시간 40분 등), 같은 신칸센 노선(`SHINKANSEN_LINES`)은 700km까지 신칸센, 섬(`ISLAND_CITY_KEYS`)은 배·비행기, 짧은 배편 표 |
| 대화 초기화 버튼 | 4절 1의 ①: `#btnChatReset` — 대화 기록·말로 정한 조건만 비우고 일정·폼 값·저장 데이터는 그대로, 서버 호출 0 |
| 여행지 30곳 데이터 | `assets/city-places.json` 1,378곳(62개 도시, 중간값 27, 도쿄 24·교토 27·오사카 16), 사진 1,169곳, 일본어로만 남은 이름 0. 한국어 이름 없는 후보·호텔·료칸 제외, `NAME_FIXES` 약 50곳, `EXCLUDE_QIDS` 추가. 생성 장소는 큐레이션 명소 뒤(`isGeneratedCityPlace`). `wip/city-places-30` 브랜치는 이제 필요 없음(지울지는 사용자) |
| 실내 위주 | AI 후보에 실내 생성 장소 유지(큐레이션 실내 먼저), 여러 도시 규칙 일정은 그날 도시 밖 장소로 채우지 않음, 하루 야외 1곳 |
| 같은 장소가 두 도시에 | 삿포로·오카다마, 미야코지마·시모지시마 같은 QID는 도시 중심이 가까운 쪽으로 찾음(가짜 '도시 이동' 없앰). 중심이 5km 안이면 큐레이션 명소가 많은 도시(삿포로). 규칙 일정에서 같은 장소는 한 번만 |
| 날짜 나눔 | '아사히카와 3일 아라시야마 공원'처럼 전체 일수를 한 도시에 붙이고 다른 도시는 장소로만 말하면 그 도시가 주 도시(`specialPrefs.mainCity`), 장소 도시는 꼭 갈 곳을 넣을 만큼만. '나고야 2박3일 하루는 교토'·'with a day trip to X and a day trip to Y' 읽기. 짧은 일정에는 요청하지 않은 하루짜리 카드를 붙이지 않음 |
| 테스트·문서 | Travelpayouts marker(507447) 고정 테스트, DEPLOY(Groq·핫페퍼 변수, Gemini 한도는 프로젝트 단위, `ALLOWED_LOGINS`는 선택)·README·ARCHITECTURE·CLAUDE.md·api-review 정리 |

### 2-2. 두 번째 묶음 (테스트 1,575개)

| 묶음 | 내용 |
|---|---|
| 대화로 일정 일부만 고치기(4절 1의 ②③) | 일정이 있을 때 빼기·넣기·옮기기·바꾸기·시간 편집은 그 칸만(`mode: 'edit'`, Groq만·Gemini 0회·없으면 규칙). 넣을 장소는 그날 도시 후보만, 못 찾거나 애매하면 선택지로 되묻기(글로 답해도 `editChoices`로 맞춤). **모든 편집은 '이렇게 바꿀까요? [이대로 바꾸기] [취소]' 확인 후에만 적용**(검토 입력 약 1,100건에서 묻지 않고 바뀐 경우 0). 남은 약점: '빼기 싫어'·'cancel removing X' 같은 일부 부정 말에 빼기 확인이 [취소]와 함께 뜸(저절로 바뀌지는 않음). 종류·음식 넣기('라멘 맛집 넣어줘')는 다시 만들기를 확인 후 진행. 시각이 섞인 넣기/빼기·일수/도시 변경은 다시 만들기. '바뀐 점' + ↩ |
| 실내 위주 긴 규칙 일정(5절 2 해결) | 실내를 다 쓰면 그날 도시 바깥 명소 하루 1곳(큐레이션 → 생성 장소 문화 → 자연), 고른 바깥 카드가 있는 날은 더하지 않음, 못 넣은 꼭 갈 곳 먼저 |
| 데이터 정리(4절 10 해결) | 다리 32곳 검토 → 19곳 제외(고속도로 4곳 + 고노하나 대교 + 보통 도로 다리 14곳), 이름 49곳 정리('~의 녹나무', 끝의 の 제거, 시설 낱말 번역, 縣→현), 1,372곳. 水前寺江津湖公園은 '에즈호'(호수, 다른 장소)와 이름 포함 충돌이라 '스이젠지 에즈코 공원' 유지(테스트 예외) |
| 항공·숙소·투어 링크(api-review 5번) | 항공 카드에 Google 항공편·네이버·스카이스캐너·카약·Trip.com(편도·왕복·다구간 날짜 맞춤, 다구간 날짜 버그 수정), 숙소 결과에 Booking·Agoda·Google 호텔·じゃらん, 투어에 KKday. Travelpayouts 통화 변환, `grouped_prices`(4초, 병렬), `scripts/travelpayouts-check.mjs`(market 비교, 수동) |
| OpenFreeMap 지도(api-review 6번) | MapLibre GL 5.24.0 + maplibre-gl-leaflet 0.1.4(unpkg, SRI), 지명 ko/en/ja, 실패·10초 무응답(탭이 보일 때만 셈)이면 OSM 타일 |
| CLAUDE.md | 114줄 → 46줄(코드에서 알 수 있는 것 제거) + Karpathy 'Coding Guidelines' 요약. 원본은 `CLAUDE.md.bak`(커밋 안 함) |

검증 방법(다음에 같은 규모로 고칠 때 참고): 작업마다 격리된 작업 복사본에서 고치고 적대적 검토 → 합친 뒤 HEAD(운영 코드)와 같은 격리 서버(가짜 벤더 + net-guard, 키 빈 값)로 채팅 문장 5,863개·일정 4,358개를 비교해 회귀를 없앰(남은 것은 5절). 비교 도구는 그 세션의 임시 폴더에만 있어서 다른 PC에는 없다.

## 3. 진행 중인 작업

2-2절 묶음을 사용자 요청 시 커밋·배포. 배포 뒤 확인: `/api/health`(`ok`·`app: "tabimaru"`·`supabaseCheck: "ok"`·`sessionSecretConfigured: true`·`sessionSecretWeak: false`), 일정 지도에 한국어 지명(OpenFreeMap 표기), 항공·숙소 카드 아래 다른 사이트 링크, 일정이 있을 때 채팅 '2일째 오후 ○○ 빼줘'가 다시 만들지 않고 그 칸만 바뀌고 ↩로 돌아오는지(Groq 한도만 조금 씀).

## 4. 협의 중 · 사용자 결정 대기 (빠짐없이)

| # | 주제 | 지금까지의 내용 | 결정할 것 |
|---|---|---|---|
| 1 | 대화로 일정 고치기 세부 | ①②③ 모두 만들었다(2-2절, 커밋 전). 정할 것이 남음 | (a) 채팅으로 뺀 장소를 다음 '다시 만들기'의 제외 목록에도 넣을지 (b) 날짜 없이 '은각사도 가고 싶어'는 지금처럼 다시 만들지 (c) '3일에'(째·차 없음)를 날짜로 읽을지(지금) 일차로 읽을지 |
| 2 | 일정 AI 순서 | 품질은 비슷하나 Groq 무료 분당 한도 때문에 일정은 Gemini 먼저로 유지하기로 권함 | 그대로 둘지(바꾸려면 `AI_ITINERARY_PROVIDER_ORDER` 새로 만들어야 함) |
| 3 | 무리한 요청 대응 | 일수보다 도시가 많으면 앞 도시부터 하루씩 넣고 빠진 도시·필요한 일수를 알림 | 자동으로 빼는 지금 방식 vs 만들기 전에 되묻기 |
| 4 | "당일치기로 도쿄랑 홋카이도 둘 다" | 일수 말이 없다고 보고 일수 칸 값(기본 4일)으로 잡음 | '당일치기로 A랑 B'를 하루짜리 여행으로 볼지 |
| 5 | 핫페퍼 가게를 AI 일정 식사 칸에 쓸지 | 지금은 맛집 카드·추천 맛집에만. 넣으면 지방 도시 식당 반복도 줄어듦 | 식사 칸에 자동으로 넣을지(서버가 원문 이름 그대로) |
| 6 | 표기 | '나카시베츠', '타카마츠성 유적'(이전 세션), 새 데이터의 '야마노우에 대신궁'·'야마구치 대신궁'(대신궁 vs 다이진구, 관례대로 둠), の가 든 음차는 2-2절에서 정리함. 남은 것: '시세이뵤'·'다쿠 세이뵤'(廟), 가톨릭 성당인데 '교회'(누노이케·시쓰), '조쿄 기민 기념관'(義民) | 그대로 둘지, 고칠지 |
| 7 | ~~원래 PC의 로컬 일정~~ | **결정됨(2026-10-03): 옮기지 않는다.** `data/saved_plans.json`은 옛날에 만든 것이고 새로 저장한 일정은 아직 없다 | — |
| 8 | 선택 기능 | 다크 모드 켜고 끄는 버튼(새 localStorage 키 말고 `travelPreferences` 안에), 로고에 한자 旅丸 | 할지 |
| 9 | 외부 서비스 결정 | `docs/api-review-2026-10-02.md` 5절 7번: NAVITIME(카드), SerpApi(소송), Gemini 유료(카드), Google Places(카드) | 각각 할지 말지 |
| 10 | 다리 판단 | 고속도로 다리는 뺐다(2-2절). 와카토 대교(1990년부터 자동차 전용이지만 중요문화재·도시 상징)는 남겼고, 보통 도로 다리 14곳(아키타·도카치·데와·지토세 대교 등)도 뺐다 | 와카토 대교를 뺄지, 보통 도로 다리를 뺀 판단이 맞는지 |
| 12 | 실내 위주 바깥 명소 | 큐레이션 바깥 명소를 다 쓰면 위키데이터 생성 장소(문화 먼저)도 쓴다(원래 계획은 큐레이션만, 그러면 긴 일정에 빈 날이 다시 생김) | 생성 장소까지 쓸지 |
| 13 | 항공 | Travelpayouts 호출 하나의 제한 15초(정확한 날짜·가격순 둘 다 무응답이면 30초, 예전 45초), market 비교는 `node scripts/travelpayouts-check.mjs`(실제 API 약 40회) | 제한을 줄일지, 점검 스크립트를 돌릴지, 一休·Trip.com 호텔 링크(도시 ID 필요)를 넣을지 |
| 14 | 지도 | OpenFreeMap이 응답하지 않으면 마커가 최대 10초 늦게 나옴, OpenFreeMap 끄는 스위치 없음(실패 시 자동 대체만) | 마커 먼저 그리기·끄는 설정을 만들지 |
| 11 | Gemini 시간 예산 | api-review 3절 7: `GEMINI_TOTAL_BUDGET_MS` 40초 → 20초 검토(일정이 Groq로 빨리 넘어감, 대신 Groq 분당 한도에 더 걸릴 수 있음) | Render에 넣을지 |

## 5. 알려진 문제 (아직 안 고침)

| # | 문제 | 재현 | 원인·방향 |
|---|---|---|---|
| 1 | Groq 400 | 부하가 클 때 `gpt-oss-120b`가 400을 낸 적 있음 | 운영 로그의 `[openai] Groq model … failed (400 …)` 확인 |
| 2 | ~~실내 위주 긴 규칙 일정의 빈 날~~ | 2-2절에서 해결(커밋 전). 작은 섬(도쿠노시마 등)은 장소가 모자라 긴 일정에 빈 날이 남음 | 데이터 부족 |
| 3 | 언어별로 다른 해석 | 'Tokyo 3 days, Kinkakuji 1 day'류는 고쳤지만, 'Sado Island 1 day'처럼 아는 지역 목록 밖의 실제 지역은 영어·일본어에서 세지 않음(한국어는 셈) | 아는 지역 목록을 늘리거나 지명 사전 |
| 4a | 날짜 나눔 남은 것 | '아사히카와 3일 아라시야마 공원 교토도 가고 싶어'(교토를 이름으로도 말함)는 교토 2·아사히카와 1(HEAD 1·2), 일본어 '京都IN東京OUT、京都3日東京2日'은 3일 | 주 도시 판정을 이름+장소 혼합에도, 일본어 붙여 쓴 재언급 읽기 |
| 4 | '오사카에'의 '사카에' | '오사카에 3일…'에서 나고야(사카에)를 경로에 넣는 경우(HEAD부터) | 도시 이름 안의 동네 이름 매칭 제외 |
| 5 | AI 일정의 후보 밖 관광 반복 | AI가 후보에 없는 내장 장소(센소지 등)를 매일 쓰면 그대로 남음(HEAD부터, 테스트가 알려진 한계로 기록) | 후처리 (g-2)가 picks·꼭 갈 곳만 반복으로 봄 |
| 6 | 데이터 | 모에레누마 공원·홋카이도 역사 마을이 실내로 분류, 좌표 없는 큐레이션 명소(선멧세 니치난 등) 지도 핀 없음 | 데이터 보정 |

## 6. 사용자가 직접 할 일

- **보안**: 원래 PC 작업 폴더의 `render.txt`(SESSION_SECRET·DIAGNOSTICS_TOKEN 평문)를 저장소 밖으로 옮기기(공개 저장소, git 제외 대상 아님). 원래 세션에서 쓴 GitHub 토큰 폐기. 데스크톱 `Desktop\프로젝트`의 `githubpersonaltoken.txt`·`privatekey.ppk` 정리
- 원래 PC `.env`에 `HOTPEPPER_API_KEY` 추가(로컬 점검용. `GROQ_API_KEY`는 있음)
- 운영 사이트에서 로그인 → 일정 저장 → 15분 넘게 지난 뒤 로그인·일정이 남는지 확인
- 옛 Google 키 삭제, Rakuten accessKey 재발급, Klook 위젯 코드 재발급
- Render: `AMADEUS_*`·`APP_ENV` 삭제(옛 `GOOGLE_MAPS_API_KEY` 값도 삭제 — `render.yaml`의 이름은 테스트 고정이라 남김), Auto-Deploy를 "After CI Checks Pass"로, 로그의 `[proxy]` 분포 줄 확인
- (ORS 작업 때) HeiGIT 가입 → `ORS_API_KEY`
- 2-2절 배포 뒤: 숙소 링크(Agoda·じゃらん·Google 호텔 날짜)와 네이버 다구간 링크를 직접 눌러 보기(api-review 5번 완료 기준)

## 7. 다음 작업 순서(권장)

1. 2-2절 묶음 커밋·푸시(사용자 요청 시) → 3절의 배포 후 확인
2. 4절 결정: 핫페퍼 식사 칸(5), 대화 편집 세부(1), 다리(10), 실내 위주(12), 항공(13), 지도(14)
3. 5절 남은 것(언어별 지역 세기, 날짜 나눔 남은 것, '사카에')
4. `docs/api-review-2026-10-02.md` 5절 4번(ORS, 키 필요)

## 8. 작업 환경 메모

- 원래 PC: `C:\Users\wx94\OneDrive\바탕 화면\codex_project`. git 2.16이라 `git worktree remove`가 없다(폴더를 지우고 `git worktree prune`). Edit 도구는 한글 경로에서 정상 동작
- 데스크톱 PC: `C:\Users\wx94\Desktop\프로젝트\tabimaru`. 원격은 SSH(SourceTree의 Pageant 키). SourceTree가 꺼져 있으면 SSH가 "No supported authentication methods"로 실패한다
  → 공개 저장소라 fetch는 `git fetch https://github.com/wsxc94/tabimaru-japan-travel-planner.git main:refs/remotes/origin/main`로 되고, push는 SourceTree를 켜야 한다
- 로컬 점검(AI 한도 아끼기):
  - 규칙만: 키를 끄고 서버를 띄운 뒤 `node scripts/prompt-matrix.mjs --base http://127.0.0.1:<포트> --prompts my.json`
  - Groq만: `GEMINI_API_KEY`를 끄고 README "Groq 무료 연결"의 값, `--gap 25000`
  - 운영 Supabase·`data/`를 건드리지 않게 `SUPABASE_URL`을 끄고 `TABIMARU_DATA_DIR=<임시 폴더>`
  - **PowerShell 5.1에서 `$env:X=''`는 변수를 지워서 `.env` 값이 다시 들어간다.** 끌 때는 공백 한 칸(`$env:GEMINI_API_KEY=' '`)을 넣고 `GOOGLE_API_KEY`·`OPENAI_API_KEY`·`OPENAI_KEY`도 막는다. 띄운 뒤 `/api/health`의 `supabaseConfigured: false`를 먼저 본다
- 테스트를 여러 개 동시에 돌릴 때는 `TABIMARU_TEST_PORT`·`TABIMARU_TEST_MOCK_PORT`로 포트를 나눈다. 부분 실행 `TEST_ONLY=intent,itinerary,city,…`
