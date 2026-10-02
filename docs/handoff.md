# 인수인계 (세션이 바뀔 때마다 갱신)

마지막 갱신: 2026-10-03 새벽, 데스크톱 PC에서. 다음 세션(다른 PC 포함)은 이 문서와 `CLAUDE.md`를 먼저 읽는다.

## 1. 지금 상태

- 운영: https://japanjapantravel.onrender.com (Render 무료, `main` 푸시 → CI 통과 → 자동 배포)
- 마지막 배포: `def620a`(맛집·여러 도시·탐색 30곳). 테스트 `npm test` 815개 통과
- 운영 설정(Render, 사용자가 넣음): `GROQ_API_KEY`, `OPENAI_BASE_URL=https://api.groq.com/openai/v1`, `OPENAI_FALLBACK_MODELS=openai/gpt-oss-20b,qwen/qwen3.8-27b`,
  `OPENAI_MAX_OUTPUT_TOKENS=3500`, `OPENAI_REASONING_EFFORT=low`, `AI_CHAT_PROVIDER_ORDER=openai,gemini`, `HOTPEPPER_API_KEY`
- AI 순서: 채팅 해석은 Groq → Gemini, 일정은 Gemini → Groq → 규칙 기반. 교통비는 AI를 쓰지 않는다

## 2. 2026-10-02~03에 한 일

| 커밋 | 내용 |
|---|---|
| `15093f0` | 규정 정비(Rakuten 배지, OSM `{s}` 제거, Frankfurter v2 `providers=ecb`) + Groq 연결(`GROQ_API_KEY`, 모델 체인, 채팅 순서) |
| `0606730` | 교통비 AI 제거 + 구간별 Google 지도 대중교통 링크 |
| `def620a` | ホットペッパー 맛집(도시당 30곳), 여러 도시 일정 수정, 탐색 탭 30곳+[더보기], '하나마키 기요미즈데라' 제외 칩 버그, 위키데이터 목표 30(스크립트만) |

측정 결과(다음 판단의 근거):
- Gemini vs Groq 일정(같은 요청 5개): 둘 다 5/5 AI 일정. 시간 배치는 Gemini가 더 현실적이고, Groq만 쓰면 채팅 직후 일정에서 분당 8천 토큰 한도에 걸린다(5건 중 3건) → 일정은 Gemini 먼저 유지
- AI 영향도: AI 일정 10건(블록 137개) 중 서버 후처리가 고친 블록 28개(약 20%). 후보 장소·날짜별 도시는 서버가 100% 정하고, AI는 후보를 어느 날 몇 시에 어떤 순서로 넣을지와 식당 선택·요약을 정한다
- 데이터 양(무료 모드, 확장 전): 추천 여행지 도쿄 6·교토 3·오사카 7, 도시 중간값 12곳. 맛집은 핫페퍼로 도시당 30곳(요나고 같은 지방 도시 포함)

## 3. 진행 중인 작업

**여행지 30곳 확장 데이터** (`scripts/build-city-places.js` 목표 30)
- 데스크톱 PC에서 위키데이터로 다시 받았다. 62개 도시 모두 대부분 27~28곳을 받았고, 작은 섬은 `few`로 표시된다
- 결과는 **`wip/city-places-30` 브랜치의 `wip/city-places-30.json`**(1,439곳, 지금 511곳)과 보고서·`wip/README.md`에 있다(운영 미반영). 도쿄 0→25, 교토 0→27, 오사카 3→18, 삿포로 6→28, 후쿠오카 5→27곳
- 그대로 넣으면 테스트 815개 중 5개 실패: 한국어 이름에 가나·한자가 남은 곳 210곳(`nameFrom: 'ja'`, 위키데이터에 한국어 이름·읽는 법이 없음, 3건), 온천 사진 검토 1건(`matsuyama|기스케 BOX`), 표기 1건(`기타노 덴만구` → 앱은 '텐만구'). 가장 빠른 길은 한국어 이름을 못 만드는 후보를 빼고 다시 만드는 것(약 1,229곳). 자세한 방법은 브랜치의 `wip/README.md`
- 다시 만들기: `node scripts/build-city-places.js --report report.tsv`(위키데이터 초당 1회라 1시간 넘게 걸림, 응답 캐시는 `<OS 임시 폴더>/tabimaru-city-places-cache`)
- 넣는 순서: 새 파일로 바꿈 → `npm test`(이름 검사: 가나·한자 남음, 美術館→미술관 같은 번역, 이름 겹침) → 걸리는 이름은 `scripts/ja-names.js` 고침 표나 `build-city-places.js`의 `NAME_FIXES`로 고침 → 도쿄·교토·오사카 추천 카드 30곳 확인 → 배포

## 4. 협의 중 · 사용자 결정 대기 (빠짐없이)

| # | 주제 | 지금까지의 내용 | 결정할 것 |
|---|---|---|---|
| 1 | **대화로 일정 고치기 + 대화 초기화 버튼** | 사용자 제안("AI랑 계속 대화하며 일정 수정, 대화 초기화 버튼"). 지금은 후속 대화가 조건을 합쳐 **일정 전체를 다시 만든다**(손으로 고친 내용이 사라지고 Gemini 1회 사용). Claude 제안: ① 초기화 버튼(대화 기록·말로 정한 조건만 비우고 일정은 유지) ② "2일째 오후 금각사 빼고 은각사" 같은 말을 빼기·넣기·옮기기·바꾸기·시간 명령으로 해석해 그 칸만 바꿈(Groq 해석만, Gemini 0회, "바뀐 점" 한 줄 + ↩) ③ 애매하면 되묻기. 일수·도시가 바뀌는 말은 지금처럼 다시 만들기 | 이 3단계로 갈지, 1단계만 먼저 할지 |
| 2 | 일정 AI 순서 | 사용자: "Groq이 더 좋거나 비슷하면 Gemini 안 써도 됨". 비교 결과 품질은 비슷하나 Groq 무료 분당 한도 때문에 일정은 Gemini 먼저로 유지하기로 권함 | 그대로 둘지. 바꾸려면 `AI_ITINERARY_PROVIDER_ORDER` 같은 설정을 새로 만들어야 함(지금은 없음) |
| 3 | 무리한 요청 대응 | 일수보다 도시가 많으면(1박2일 도쿄·오사카·후쿠오카) 앞의 도시부터 하루씩 넣고, 빠진 도시와 필요한 일수(n일 이상, 이동 포함 2n-1일)를 답장·일정 맨 위에 알리게 구현함 | 자동으로 빼는 지금 방식이 좋은지, 만들기 전에 되묻는 방식이 좋은지 |
| 4 | "당일치기로 도쿄랑 홋카이도 둘 다" | 일수 말이 없다고 보고 4일로 잡고 답장에 그렇게 알림 | '당일치기로 A랑 B'를 하루짜리 여행으로 볼지(그러면 3번 규칙으로 B를 빼고 안내) |
| 5 | 핫페퍼 가게를 AI 일정 식사 칸에 쓸지 | 지금은 맛집 카드·추천 맛집에만 쓰고, 일정 식사 칸은 내장 맛집(약관 조건: 원문 그대로, AI 문장에 섞지 않음). 사용자가 카드에서 [일정에 넣기]로 넣을 수는 있음 | 식사 칸에 자동으로 넣을지(넣는다면 AI가 아니라 서버가 원문 이름 그대로 배치) |
| 6 | 표기 2건 | 도시 이름 '나카시베츠', 큐레이션 명소 '타카마츠성 유적'을 현행 유지하자고 권함(이전 세션) | 그대로 둘지 |
| 7 | 원래 PC의 로컬 일정 | 원래 PC `data/saved_plans.json`은 Supabase로 옮기지 않았다 | 옮길지(요청하면 옮김) |
| 8 | 선택 기능 | 다크 모드 켜고 끄는 버튼, 로고에 한자 旅丸 | 할지 |
| 9 | 외부 서비스 결정 | `docs/api-review-2026-10-02.md` 5절 7번: NAVITIME(카드), SerpApi(소송), Gemini 유료(카드), Google Places(카드) | 각각 할지 말지 |

## 5. 알려진 문제 (아직 안 고침)

| # | 문제 | 재현 | 원인·방향 |
|---|---|---|---|
| 1 | 영어 도시별 일수 | "Osaka 3 days then Kyoto 2 days" → 5일이 아니라 3일(규칙·AI 모두) | 규칙 해석의 지역별 일수가 영어 'N days'를 못 읽고, 서버가 메시지 일수(첫 숫자)를 AI보다 우선 |
| 2 | 영어 일정에 한국어 이름 | 위 요청의 영어 일정에 '오사카성 (Chuo Ward)', '후시미 이나리' | 대표 명소(MUST_ATTRACTIONS) 블록이 en으로 안 바뀜 |
| 3 | 긴 여러 도시 일정의 후보 부족 | 7박8일 구마모토·가고시마·미야자키 → 마지막 날 '자유 일정' 2칸 | AI 후보가 도시 전체 합쳐 최대 20곳(`expandPicksForAi`) → 도시 수·일수에 맞춰 늘리기(Groq 분당 토큰 주의) |
| 4 | 다른 도시 식당 | 2박3일 도쿄→오키나와 AI 일정의 오키나와 날에 '아후리 라멘 (에비스)' | 후처리가 식사 칸의 도시를 날짜별 도시와 맞추지 않음 |
| 5 | 이동 시간 안내 | 삿포로→하코다테 '대중교통 기준 1~3시간'(실제 특급 약 3.5~4시간), 구마모토→미야자키도 3시간 이상 | `transferHint()`가 비행기 거리 아래는 모두 1~3시간 → 거리 구간을 나누기 |
| 6 | Groq 400 | 부하가 클 때 `gpt-oss-120b`가 400을 낸 적 있음(간격을 두면 재현 안 됨) | 로그에 벤더 오류 코드를 남기게 했으니 운영 로그의 `[openai] Groq model … failed (400 …)` 확인 |
| 7 | 같은 식당 반복 | AI 일정에서 같은 식당이 여러 날(스시다이 1·3일째) | 후처리의 반복 교체가 관광지만 봄 |

## 6. 사용자가 직접 할 일

- 다른 PC의 `.env`에 `GROQ_API_KEY`, `HOTPEPPER_API_KEY` 추가(로컬 점검용. 운영은 Render에 이미 있음)
- 운영 사이트에서 로그인 → 일정 저장 → 15분 넘게 지난 뒤 로그인·일정이 남는지 확인
- 보안: 원래 세션에서 쓴 GitHub 토큰(`ghp_6P7k…`) 폐기. 데스크톱 `Desktop\프로젝트`의 `githubpersonaltoken.txt`·`privatekey.ppk` 정리
- 옛 Google 키 삭제, Rakuten accessKey 재발급, Klook 위젯 코드 재발급
- Render: `AMADEUS_*`·`APP_ENV`·옛 `GOOGLE_MAPS_API_KEY` 삭제, Auto-Deploy를 "After CI Checks Pass"로, 로그의 `[proxy]` 분포 줄 확인
- (4번 작업 때) OpenRouteService 키 발급 → `ORS_API_KEY`

## 7. 다음 작업 순서(권장)

1. 여행지 30곳 데이터 넣기(3번)
2. 대화 초기화 버튼(4번 표 1의 ①) — 결정되면 부분 수정 ②③
3. 알려진 문제 1~5
4. `docs/api-review-2026-10-02.md` 5절 4번(ORS 도보 시간) → 5번(항공 손보기·링크) → 6번(OpenFreeMap)

## 8. 작업 환경 메모

- 데스크톱 PC: `C:\Users\wx94\Desktop\프로젝트\tabimaru`. 원격은 SSH(SourceTree의 Pageant 키). SourceTree가 꺼져 있으면 SSH가 "No supported authentication methods"로 실패한다
  → 공개 저장소라 fetch는 `git fetch https://github.com/wsxc94/tabimaru-japan-travel-planner.git main:refs/remotes/origin/main`로 되고, push는 SourceTree를 켜야 한다
- 로컬 점검(AI 한도 아끼기):
  - 규칙만: `GEMINI_API_KEY=` `GROQ_API_KEY=` 빈 값으로 서버를 띄우고 `node scripts/prompt-matrix.mjs --base http://127.0.0.1:<포트> --prompts my.json`
  - Groq만: `GEMINI_API_KEY=` 빈 값 + README "Groq 무료 연결"의 값, `--gap 25000`
  - 로컬 서버를 띄울 때 `SUPABASE_URL=` 빈 값과 `TABIMARU_DATA_DIR=<임시 폴더>`로 운영 Supabase·`data/`를 건드리지 않는다
