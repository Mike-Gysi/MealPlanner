-- Run this in the Supabase SQL Editor (https://supabase.com → your project → SQL Editor)

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references recipes(id) on delete cascade not null,
  name text not null,
  quantity numeric,
  unit text
);

create table if not exists calendar_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner')),
  recipe_id uuid references recipes(id) on delete set null,
  custom_text text,
  leftover_of uuid references calendar_entries(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity numeric,
  unit text,
  is_purchased boolean default false not null,
  created_at timestamptz default now()
);

create table if not exists shopping_list_history (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity numeric,
  unit text,
  purchased_at timestamptz default now()
);

-- Profiles: stores username per user for todo assignment
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  updated_at timestamptz default now()
);

-- Todos
create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  due_date date not null,
  assigned_to text not null default 'all',
  completed boolean default false not null,
  created_at timestamptz default now()
);

-- Row-level security
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table calendar_entries enable row level security;
alter table shopping_list_items enable row level security;
alter table shopping_list_history enable row level security;
alter table profiles enable row level security;
alter table todos enable row level security;

create policy "Authenticated users can do everything" on recipes
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users can do everything" on recipe_ingredients
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users can do everything" on calendar_entries
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users can do everything" on shopping_list_items
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users can do everything" on shopping_list_history
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users can do everything" on profiles
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users can do everything" on todos
  for all using (auth.role() = 'authenticated');

-- Activity log
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  username text not null,
  action text not null,
  entity_type text not null,
  entity_name text not null,
  created_at timestamptz default now() not null
);

alter table activity_log enable row level security;

create policy "Authenticated users can do everything" on activity_log
  for all using (auth.role() = 'authenticated');
