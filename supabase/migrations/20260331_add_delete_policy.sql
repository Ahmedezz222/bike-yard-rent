drop policy if exists "customers_delete_all" on public.customers;
create policy "customers_delete_all"
on public.customers
for delete
to authenticated
using (auth.uid() is not null);

