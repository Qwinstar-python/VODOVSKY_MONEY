-- ============================================================
-- VODOVSKY MONEY · Supabase schema v3.0
-- Запуск: Supabase Dashboard → SQL Editor → New query → Run
-- Можно запускать повторно: существующие данные не удаляются.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- ПРОФИЛИ: личный кабинет пользователя
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default 'Пользователь',
  avatar_url text,
  currency text not null default 'RUB',
  theme text not null default 'dark',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ОПЕРАЦИИ: доходы и расходы
-- ------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14,2) not null check (amount > 0),
  category text not null default 'other',
  note text not null default '',
  date date not null default current_date,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists tx_user_date_idx
  on public.transactions(user_id, date desc);

create index if not exists tx_user_sort_idx
  on public.transactions(user_id, sort_order);

-- ------------------------------------------------------------
-- ЦЕЛИ: накопления с фотографиями
-- ------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  target numeric(14,2) not null check (target > 0),
  saved numeric(14,2) not null default 0 check (saved >= 0),
  photo_path text,
  deadline date,
  created_at timestamptz not null default now()
);

create index if not exists goals_user_idx
  on public.goals(user_id);

-- ------------------------------------------------------------
-- ВЫПЛАТЫ: регулярные платежи
-- ------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  amount numeric(14,2) not null check (amount > 0),
  day integer not null check (day between 1 and 31),
  category text not null default 'other',
  active boolean not null default true,
  last_paid_month text,
  created_at timestamptz not null default now()
);

create index if not exists payments_user_idx
  on public.payments(user_id);

-- ------------------------------------------------------------
-- RLS: каждый пользователь видит только свои данные
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;
alter table public.payments enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- transactions
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated
  using (user_id = auth.uid());

-- goals
drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own" on public.goals
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own" on public.goals
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own" on public.goals
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_delete_own" on public.goals
  for delete to authenticated
  using (user_id = auth.uid());

-- payments
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "payments_insert_own" on public.payments;
create policy "payments_insert_own" on public.payments
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "payments_update_own" on public.payments;
create policy "payments_update_own" on public.payments
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "payments_delete_own" on public.payments;
create policy "payments_delete_own" on public.payments
  for delete to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- Автоматическое создание профиля при регистрации
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ------------------------------------------------------------
-- STORAGE: приватные фотографии целей
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('goal-photos', 'goal-photos', false)
on conflict (id) do nothing;

drop policy if exists "goal_photos_select_own" on storage.objects;
create policy "goal_photos_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'goal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "goal_photos_insert_own" on storage.objects;
create policy "goal_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'goal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "goal_photos_update_own" on storage.objects;
create policy "goal_photos_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'goal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'goal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "goal_photos_delete_own" on storage.objects;
create policy "goal_photos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'goal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
