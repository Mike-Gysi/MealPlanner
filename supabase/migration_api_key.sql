-- Run this in the Supabase SQL Editor to enable the Siri Shortcut API key.

alter table households add column if not exists api_key uuid default gen_random_uuid();
update households set api_key = gen_random_uuid() where api_key is null;
