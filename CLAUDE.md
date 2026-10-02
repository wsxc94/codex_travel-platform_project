# Tabimaru 작업 규칙 (AI 어시스턴트용)

혼자 쓰는 AI 일본 여행 플래너다. 운영 주소는 https://japanjapantravel.onrender.com 이다.
Render 무료 플랜에서 돌고, `main`에 푸시하면 CI(`npm test`)가 통과한 뒤 자동으로 배포된다.

이 문서는 **하지 말아야 할 것**과 작업 습관만 적는다. 나머지는 아래 문서가 단일 출처다.
- 구조·데이터 흐름·변경 이력: `ARCHITECTURE.md`
- 환경변수·API·테스트: `README.md`
- 배포: `deploy/DEPLOY.md`
- 외부 API 다음 작업: `docs/api-review-2026-10-02.md`

## 절대 규칙

1. **도메인에 묶인 값은 바꾸지 않는다.** 바꾸면 로그인·저장 데이터·배포가 깨지고, 테스트가 고정하고 있다.
   - 운영 주소 `japanjapantravel.onrender.com`, Render 서비스 이름 `japantravel-suite`
   - OAuth 콜백 `/api/auth/<공급자>/callback`
   - Rakuten 요청 Referer, Travelpayouts marker·ID
   - 쿠키 `sid`
   - localStorage 키: `travelLang`·`travelWishlist`·`travelSearchHistory`·`travelPreferences`·`travelChecklist`·`placeMemos`·`tabimaru.draft.v1`
   - Supabase 표 `travel_plans`, 매니페스트 `start_url`
2. **첫 화면에서는 유료·AI 호출을 하지 않는다.** 일정·항공·숙소·맛집은 사용자가 버튼을 눌렀을 때만 부른다.
3. **무료 모드가 기본이다.** `PLACES_PROVIDER=free`, `MAP_PROVIDER=osm`이고 Google 호출은 0이다.
   - Google 경로는 지우지 말고 다시 켤 수 있게 둔다(README "Google로 다시 전환하기").
   - 결제를 먼저 켜라고 권하지 않는다.
4. **긴급 전화번호는 화면에 보이는 숫자와 `tel:` 링크가 같아야 한다.**
5. **비밀값을 다루는 원칙**
   - `.env`와 `data/`는 사용자 허락 없이 고치지 않는다.
   - 키 값을 화면·로그·커밋·응답에 출력하지 않는다.
   - 실제 키는 `.env`(git 제외)와 Render 환경변수에만 둔다. `.env.example`에는 빈 값만 둔다.
6. **AI 일정은 서버가 넘긴 후보 장소만 쓴다.** 지어낸 장소는 금지이고, 후처리(`postProcessItinerary`)가 이 계약을 강제한다. 이 경로를 느슨하게 만들지 않는다.
7. **데이터 출처를 지킨다.**
   - 사진은 위키미디어 Commons의 자유 라이선스만 쓰고, 저작자·라이선스를 함께 표시한다.
   - 도시 명소는 위키데이터 QID와 좌표가 있는 것만 넣는다(`scripts/build-city-places.js`).
   - Google Places 결과를 OSM 지도 위에 표시하지 않는다(Google 약관).
8. **커밋 규칙**
   - "Co-Authored-By: Claude"나 "Generated with Claude Code" 줄을 넣지 않는다.
   - 작성자는 저장소 로컬 git 설정을 그대로 쓴다.
   - 커밋·푸시는 사용자가 요청할 때만 한다. 푸시하면 곧바로 운영에 배포된다.

## 수정 후 확인 (보고 전에 반드시)

1. 고친 JS 파일마다 `node --check server.js`, `node --check public/app.js`로 구문을 검사한다.
2. `npm test`(= `node test_all.js`)로 전체 테스트를 돌린다.
   - 2026-10-02 기준 782개가 모두 통과하는 것이 정상이다.
   - 외부 패키지가 없어 `npm install`은 필요 없다. Node 20 이상이 필요하다.
   - 실제 네트워크와 `.env` 값을 쓰지 않는다(가짜 벤더 서버, 네트워크 차단).
   - 포트 13581·3205가 비어 있어야 한다.
3. 화면 기능을 고쳤다면 실제 경로를 따라가 본다. 이벤트가 맞는 요소 ID에 붙는지, 그 ID가 `index.html`에 있는지, 불리는 함수가 있는지 확인한다.
4. 사용자가 직접 실패를 찾아내게 하지 않는다. 확인이 끝나기 전에는 "완료"라고 보고하지 않는다.

테스트는 다음도 고정한다. 테스트가 깨지면 규칙을 건드린 것일 수 있다.
- 도메인 값
- 환경변수 목록: 코드가 읽는 변수는 `render.yaml`·`.env.example`·README 세 곳에 모두 있어야 한다
- ko/en/ja 사전 키
- 긴급 번호, 첫 화면 무호출

## 실수 잦은 지점

- **JS 파일에 서로게이트 제거 정규식을 쓰지 않는다.** 예전에 그 방법으로 `app.js`가 0바이트가 됐다. 이모지는 문자열을 그대로 바꿔서 고친다.
- **문자열을 일괄 치환할 때는 `I18N` 사전 안까지 바뀌지 않게 범위를 확인한다.**
  - `t()`는 사전 밖에서만 쓴다.
  - 식사 시간 같은 내부 키(아침·점심·저녁·오전·오후)는 비교용이라 `t()`로 바꾸지 않는다.
- **Render 무료 플랜은 15분 쉬면 잠들고, 다시 시작할 때 메모리와 디스크가 지워진다.**
  - 그래서 로그인은 서명 쿠키(`SESSION_SECRET`)로, 내 일정은 Supabase에 둔다.
  - 오래 남아야 하는 상태를 서버 메모리나 디스크에 새로 두지 않는다.
- **Supabase 무료 프로젝트는 7일 동안 요청이 없으면 일시 정지된다.**
  - `.github/workflows/keepalive.yml`이 3일마다 `/api/keepalive`를 부른다.
  - 공개 저장소에 60일 동안 활동이 없으면 GitHub가 예약 작업을 끈다. 그러면 Actions 탭에서 다시 켠다.
- **Windows PowerShell 5.1 환경**
  - `&&` 대신 `;`를 쓴다.
  - 경로에 한글이 있으면 Bash 도구가 실패할 수 있으니 PowerShell을 쓴다.
  - 커밋 메시지는 UTF-8 파일로 만들어 `git commit -F`로 넣는다.

## AI 한도와 키 (실측)

- **Gemini 무료 한도는 모델마다 하루 20회이고, 프로젝트 단위로 센다.** 키를 여러 개 만들어도 늘지 않는다.
  - 운영과 로컬이 같은 한도를 나눠 쓴다.
  - 한국 시간 16시(미국 표준시 기간에는 17시)에 다시 찬다.
  - 실제 AI 점검(`scripts/prompt-matrix.mjs`는 약 32회)을 돌리면 운영에서 쓸 한도가 준다.
- 모델 순서와 시간 예산은 README의 `GEMINI_FALLBACK_MODELS`·`GEMINI_TOTAL_BUDGET_MS`를 본다. 실제 순서는 `/api/health`의 `ai.geminiModelChain`이다.
- **Groq 키는 `GROQ_API_KEY`에 둔다.** 서버는 이 키를 `OPENAI_BASE_URL`이 Groq 주소일 때만 보낸다.
  - `OPENAI_API_KEY` 없이 `GROQ_API_KEY`만 있으면 주소는 Groq, 모델은 `openai/gpt-oss-120b`가 기본이다.
  - Groq 키를 `OPENAI_API_KEY`에 넣지 않는다. 넣으면 서버가 api.openai.com에 보내지 않고 경고만 남긴다(OpenAI 키도 Groq로 보내지 않는다).
  - 어느 키를 쓰는지는 `/api/health`의 `ai.openaiKeySource`, 모델 순서는 `ai.openaiModelChain`이다.
  - Render 설정값(대체 모델·출력 상한·reasoning·채팅 순서)은 README "Groq 무료 연결"에 있다.
- **로컬 `.env`의 Supabase는 운영과 같은 프로젝트다.** 로컬에서 저장한 일정도 운영 표에 들어간다. 파일 저장 위치만 바꾸려면 `TABIMARU_DATA_DIR`을 쓴다.

## 배포 후 확인

- 푸시하면 CI가 통과한 뒤 Render가 자동 배포한다.
- `/api/health`에서 다음 값을 확인한다.
  - `ok: true`, `app: "tabimaru"`
  - `supabaseCheck: "ok"`
  - `sessionSecretWeak: false`
- AI 일정이 실제로 만들어지는지 볼 때는 무료 한도를 쓴다는 점을 사용자에게 먼저 알린다.

## 사용자에 대해

- 한국어로 답한다. 쉬운 말로 짧게 쓴다.
- 혼자 쓰는 앱이다. 여러 사용자·수익화 관점의 제안은 하지 않는다. 예를 들어 Open-Meteo의 비상업 조건은 문제 삼지 않는다.
- 다음은 사용자가 정한 것이다.
  - `ALLOWED_LOGINS`는 꼭 필요한 경우가 아니면 설정하지 않는다.
  - 무료 모드를 유지하되 Google로 다시 전환할 수 있게 둔다.
- 작업 결과에는 다음 작업 가이드를 붙인다. 지금 결과가 뜻하는 것, 권장하는 다음 작업과 이유, 사용자가 할 일, 완료 기준이다.
- 사용자와 합의한 결정은 기록한다. 큰 변경은 `ARCHITECTURE.md` 13절 변경 이력에, 작업 규칙은 이 파일에 적는다.
- 다음 작업 순서는 `docs/api-review-2026-10-02.md` 5절을 따른다. 하지 말 것 목록은 같은 문서 4절에 있다.
