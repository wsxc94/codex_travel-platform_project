-- Tabimaru: Supabase 일정 저장소 스키마
-- 여러 번 실행해도 된다(모든 문장이 if not exists / or replace / drop ... if exists).
-- 테이블·정책 이름(travel_plans 등)은 서버가 쓰는 이름이라 이름 변경(예전 이름 JapanTravel Suite) 뒤에도 그대로 둔다.
-- 서버는 service role 키로만 접근한다(service role은 RLS를 우회). 브라우저(anon) 접근은 허용하지 않는다.
-- user_label: 서버가 넣는 로그인 사용자 id(세션의 userId). /api/travel-plan/save·list·get은 로그인이 필요하다.

-- Enable extension for UUID generation
create extension if not exists pgcrypto;

create table if not exists public.travel_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text unique not null,
  user_label text,
  city_key text not null,
  city_label text,
  theme text,
  budget text,
  start_date date,
  days int,
  summary text,
  source text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_travel_plans_created_at on public.travel_plans(created_at desc);
create index if not exists idx_travel_plans_city_key on public.travel_plans(city_key);
-- 목록 조회: user_label=eq.<userId> order by created_at desc
create index if not exists idx_travel_plans_user_created on public.travel_plans(user_label, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_travel_plans_updated_at on public.travel_plans;
create trigger trg_travel_plans_updated_at
before update on public.travel_plans
for each row execute function public.set_updated_at();

-- RLS: 켜 두고 anon/authenticated 정책은 두지 않는다 → 브라우저 키로는 읽기·쓰기 모두 불가.
alter table public.travel_plans enable row level security;

-- 예전 스크립트가 만든 정책 정리(없으면 건너뜀)
drop policy if exists service_role_all on public.travel_plans;
-- anon_read_own은 user_label을 JWT sub와 비교했지만, 서버는 앱 사용자 id를 넣으므로 의미가 없어 지운다.
drop policy if exists anon_read_own on public.travel_plans;

-- service role 전용 쓰기 정책(명시용). 다시 실행해도 되도록 먼저 지운다.
drop policy if exists service_write on public.travel_plans;
create policy service_write on public.travel_plans
  for all
  using (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');
