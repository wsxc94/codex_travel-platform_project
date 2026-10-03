# Tabimaru 작업 규칙

혼자 쓰는 AI 일본 여행 플래너(https://japanjapantravel.onrender.com, Render 무료). `main` 푸시 = CI 후 운영 배포.
이어서 작업할 때 `docs/handoff.md`(상태·결정 대기·다음 작업)를 먼저 읽고, 세션을 마칠 때 갱신한다.

## 절대 규칙
1. 도메인 값은 바꾸지 않는다: 운영 주소, Render 서비스 이름(`japanjapantravel`, render.yaml `japantravel-suite`), OAuth 콜백, Rakuten Referer, Travelpayouts marker, 쿠키 `sid`, localStorage 키, Supabase 표 `travel_plans`, `start_url`.
2. 첫 화면에서는 유료·AI 호출을 하지 않는다(버튼을 눌렀을 때만).
3. 무료 모드(`PLACES_PROVIDER=free`, `MAP_PROVIDER=osm`, Google 호출 0)가 기본이다. Google 경로는 지우지 않고, 결제를 권하지 않는다.
4. 긴급 번호는 화면의 숫자와 `tel:` 링크가 같아야 한다.
5. 비밀값: `.env`·`data/`는 허락 없이 고치지 않고, 키 값을 화면·로그·커밋·응답에 내지 않는다. `.env.example`은 빈 값만.
6. AI 일정은 서버가 넘긴 후보 장소만 쓴다. `postProcessItinerary`를 느슨하게 하지 않는다.
7. 데이터 출처: 사진은 Commons 자유 라이선스 + 저작자 표시, 명소는 위키데이터 QID·좌표 필수, Google Places 결과를 OSM 지도에 표시 금지, 핫페퍼는 원문 그대로 + 크레딧 + 24시간 안 갱신 + AI 문장에 섞지 않기.
8. 커밋: Claude 표기 줄(Co-Authored-By 등) 금지, 작성자는 로컬 git 설정, 커밋·푸시는 사용자가 요청할 때만.

## 수정 후 확인 (완료 보고 전에)
- 고친 JS마다 `node --check`, 그리고 `npm test` 0 failures(포트 13581·3205가 비어 있어야 함). 테스트가 깨지면 위 규칙을 건드렸다는 신호다.
- 화면을 고쳤으면 요소 ID(index.html)·이벤트·함수·ko/en/ja 사전 키를 직접 따라가 본다.
- 사용자가 실패를 찾게 하지 않는다.

## 함정
- JS에 서로게이트 제거 정규식 금지(예전에 app.js가 0바이트가 됨).
- 일괄 치환이 `I18N` 사전 안까지 바꾸지 않게. `t()`는 사전 밖에서만, 식사 시간 키(아침·점심·저녁·오전·오후)는 `t()`로 바꾸지 않는다.
- Render는 15분 쉬면 잠들고 메모리·디스크가 지워진다 → 오래 남을 상태를 서버 메모리·디스크에 두지 않는다.
- Supabase 무료는 7일 무요청이면 정지된다 → `keepalive.yml`(3일마다). 저장소가 60일 조용하면 GitHub가 예약 작업을 끈다.
- 로컬 `.env`의 Supabase는 운영과 같은 프로젝트다(파일 저장만 바꾸려면 `TABIMARU_DATA_DIR`).
- PowerShell 5.1: `&&` 대신 `;`, 한글 경로는 Bash 대신 PowerShell, 커밋 메시지는 UTF-8 파일 + `git commit -F`, curl에 한국어 인자 금지(UTF-8 파일로 `--data-binary @파일`), `$env:X=''`는 변수를 지워 `.env` 값이 다시 들어간다(끌 때는 `' '`).

## AI 한도 (실측)
- Gemini 무료는 모델마다 하루 20회, 프로젝트 단위(키를 늘려도 같음), 운영·로컬 공유, 한국 시간 16시(표준시 17시)에 다시 찬다. 실제 AI 점검은 운영 한도를 쓰니 먼저 알린다.
- Groq 키는 `GROQ_API_KEY`에(`OPENAI_API_KEY` 아님). Groq는 분당 8천 토큰이라 일정은 Gemini가 먼저다.

## 배포 후 확인
`/api/health`: `ok`, `app: "tabimaru"`, `supabaseCheck: "ok"`, `sessionSecretConfigured: true`, `sessionSecretWeak: false`.

## 사용자
- 한국어로, 쉬운 말로 짧게. 혼자 쓰는 앱이라 여러 사용자·수익화 관점 제안은 하지 않는다.
- 결과에는 다음 작업 가이드(뜻, 권장 다음 작업과 이유, 사용자가 할 일, 완료 기준)를 붙인다.
- 합의한 결정은 기록한다(큰 변경 → ARCHITECTURE.md 13절, 규칙 → 이 파일, 진행 → handoff).
- `ALLOWED_LOGINS`는 꼭 필요할 때만 설정한다.

## Coding Guidelines (Karpathy 가이드 요약, 사소한 일은 판단껏)
- 코딩 전에 생각한다: 가정은 밝히고, 해석이 여러 개면 고르기 전에 묻는다. 더 단순한 방법이 있으면 제안하고, 헷갈리면 멈추고 묻는다.
- 단순하게: 요청한 것만 만든다. 한 번 쓰는 코드에 추상화·설정값을 만들지 않고, 일어날 수 없는 경우의 예외 처리를 넣지 않는다.
- 필요한 곳만 고친다: 옆 코드·주석·서식을 '개선'하지 않고 기존 스타일을 따른다. 관계없는 죽은 코드는 지우지 말고 알리며, 내 변경으로 안 쓰게 된 것만 치운다. 바뀐 줄마다 요청과 이어져야 한다.
- 목표를 검증할 수 있게: 버그는 재현 테스트를 먼저 쓰고 통과시킨다. 여러 단계 작업은 "단계 → 확인 방법" 짧은 계획을 먼저 말한다(완료 확인은 위 '수정 후 확인').