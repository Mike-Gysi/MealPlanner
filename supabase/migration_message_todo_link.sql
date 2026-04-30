-- Run in Supabase SQL Editor
ALTER TABLE messages ADD COLUMN IF NOT EXISTS todo_id UUID REFERENCES todos(id) ON DELETE SET NULL;
