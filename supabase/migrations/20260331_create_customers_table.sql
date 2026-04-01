create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  bike_id text not null,
  status boolean not null default true
);

alter table public.customers enable row level security;

drop policy if exists "customers_select_all" on public.customers;
create policy "customers_select_all"
on public.customers
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "customers_insert_all" on public.customers;
create policy "customers_insert_all"
on public.customers
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "customers_update_all" on public.customers;
create policy "customers_update_all"
on public.customers
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

alter publication supabase_realtime add table public.customers;

