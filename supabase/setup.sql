-- À exécuter dans le SQL Editor de VOTRE projet Supabase.
-- Le contenu du panier n'est jamais une source de prix fiable pour un paiement.
begin;
create table if not exists public.customer_carts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint customer_cart_array check (jsonb_typeof(items) = 'array'),
  constraint customer_cart_size check (jsonb_array_length(items) <= 100 and octet_length(items::text) <= 2100000)
);
alter table public.customer_carts enable row level security;
alter table public.customer_carts force row level security;
revoke all on public.customer_carts from anon;
revoke all on public.customer_carts from authenticated;
grant select, insert, update, delete on public.customer_carts to authenticated;
drop policy if exists "customer_owns_cart" on public.customer_carts;
create policy "customer_owns_cart" on public.customer_carts for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
commit;
