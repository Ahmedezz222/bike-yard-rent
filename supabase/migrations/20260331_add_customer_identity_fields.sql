alter table public.customers
add column if not exists customer_id text,
add column if not exists customer_id_image text;

