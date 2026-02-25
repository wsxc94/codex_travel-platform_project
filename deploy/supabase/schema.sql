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

-- Optional RLS setup for future auth integration
alter table public.travel_plans enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='travel_plans' and policyname='service_role_all'
  ) then
    create policy service_role_all on public.travel_plans
      for all
      using (true)
      with check (true);
  end if;
end;
$$;
