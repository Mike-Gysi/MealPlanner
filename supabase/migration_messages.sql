-- Run in Supabase SQL Editor

-- Messages table
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_username text not null,
  recipient_id uuid references auth.users(id) on delete cascade not null,
  recipient_username text not null,
  body text not null,
  read boolean default false not null,
  created_at timestamptz default now() not null
);

alter table messages enable row level security;
create policy "Authenticated users can do everything" on messages
  for all using (auth.role() = 'authenticated');

-- Note field on todos (if not already added)
alter table todos add column if not exists note text;

-- Messages notification preference
alter table notification_preferences add column if not exists notify_messages boolean default true;
