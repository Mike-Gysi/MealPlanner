-- Run this in the Supabase SQL Editor to enable push notifications.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  unique (user_id)
);

alter table push_subscriptions enable row level security;

create policy "Users manage their own subscription" on push_subscriptions
  for all using (auth.uid() = user_id);
