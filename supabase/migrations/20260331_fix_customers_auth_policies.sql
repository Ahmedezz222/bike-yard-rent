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

