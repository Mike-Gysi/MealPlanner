-- Requires the pg_cron and pg_net extensions.
-- Enable them in the Supabase dashboard under Database → Extensions before running this.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old job if it exists, then schedule the new one
SELECT cron.unschedule('send-todo-reminders');

-- Run every minute so the exact HH:MM the user sets is respected
SELECT cron.schedule(
  'send-todo-reminders',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://dkawxtvslcvdizqgzhre.supabase.co/functions/v1/send-todo-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
