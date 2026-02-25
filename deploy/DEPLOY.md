# Deploy Guide (Supabase + Render)

## 1) Supabase 준비
1. https://supabase.com 에서 프로젝트 생성
2. SQL Editor 열기
3. `deploy/supabase/schema.sql` 전체 실행
4. Project Settings > API에서 아래 2개 복사
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## 2) GitHub 푸시
1. 현재 프로젝트를 GitHub repo로 push

## 3) Render 배포
1. https://render.com 로그인
2. New + > Web Service > GitHub repo 연결
3. Render가 `render.yaml`을 읽어 자동 세팅
4. Environment Variables에 아래 추가
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_MAPS_API_KEY` (선택)
5. Deploy 클릭

## 4) 동작 확인
- 배포 URL + `/api/health` 호출
- 여행 계획 생성 후 `/api/travel-plan/save` 저장 테스트

## 5) 주의
- `SUPABASE_SERVICE_ROLE_KEY`는 서버에서만 사용
- 프론트 코드에 키 직접 노출 금지
