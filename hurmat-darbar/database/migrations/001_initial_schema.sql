-- Hurmat Darbar shared database foundation (Supabase/PostgreSQL)
create extension if not exists pgcrypto;

create type public.app_role as enum ('owner','admin','rider','customer');
create type public.order_status as enum ('pending','accepted','preparing','ready','assigned','picked_up','out_for_delivery','delivered','cancelled','rejected');
create type public.reservation_status as enum ('requested','confirmed','cancelled','completed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text unique,
  role public.app_role not null default 'customer',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  active boolean not null default true
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.menu_categories(id),
  name text not null,
  description text,
  price_paise int check (price_paise >= 0),
  availability boolean not null default false,
  verification_status text not null default 'needs_review' check (verification_status in ('needs_review','verified')),
  source_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id),
  customer_name text not null,
  phone text not null,
  delivery_address text,
  order_type text not null check (order_type in ('delivery','takeaway','dine_in')),
  status public.order_status not null default 'pending',
  subtotal_paise int not null check (subtotal_paise >= 0),
  delivery_fee_paise int not null default 0 check (delivery_fee_paise >= 0),
  total_paise int not null check (total_paise >= 0),
  payment_method text,
  payment_status text not null default 'pending',
  rider_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id),
  item_name_snapshot text not null,
  unit_price_paise int not null check (unit_price_paise >= 0),
  quantity int not null check (quantity > 0)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id),
  customer_name text not null,
  phone text not null,
  reservation_date date not null,
  reservation_time time not null,
  guest_count int not null check (guest_count > 0),
  table_number int check (table_number between 1 and 15),
  status public.reservation_status not null default 'requested',
  notes text,
  created_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id),
  order_id uuid references public.customer_orders(id),
  phone text not null,
  issue_type text not null,
  message text not null,
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  created_at timestamptz not null default now()
);

create table public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  rider_id uuid not null references public.profiles(id),
  status public.order_status not null,
  latitude double precision,
  longitude double precision,
  note text,
  created_at timestamptz not null default now()
);

create table public.business_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.customer_orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reservations enable row level security;
alter table public.support_tickets enable row level security;
alter table public.delivery_events enable row level security;
alter table public.business_settings enable row level security;

-- Public visitors can only read active categories and verified, available menu items.
create policy "public read active categories" on public.menu_categories
for select using (active = true);
create policy "public read verified available menu" on public.menu_items
for select using (availability = true and verification_status = 'verified');
create policy "public read public business settings" on public.business_settings
for select using (key in ('opening_hours','public_contact','delivery_policy'));

-- No client-side write policies are intentionally granted here.
-- Authenticated customer/admin/rider operations must be added through audited
-- server-side API/RPC functions after role and ownership checks are implemented.
