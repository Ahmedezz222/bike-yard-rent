drop policy if exists "customers_delete_all" on public.customers;
create policy "customers_delete_all"
on public.customers
for delete
to anon, authenticated
using (true);

