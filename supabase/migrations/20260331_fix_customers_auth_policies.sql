drop policy if exists "customers_select_all" on public.customers;
create policy "customers_select_all"
on public.customers
for select
to anon, authenticated
using (true);

drop policy if exists "customers_insert_all" on public.customers;
create policy "customers_insert_all"
on public.customers
for insert
to anon, authenticated
with check (true);

drop policy if exists "customers_update_all" on public.customers;
create policy "customers_update_all"
on public.customers
for update
to anon, authenticated
using (true)
with check (true);

