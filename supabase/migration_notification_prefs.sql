CREATE TABLE notification_preferences (
  user_id             uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  notify_shopping     boolean NOT NULL DEFAULT true,
  notify_todos        boolean NOT NULL DEFAULT true,
  notify_meals        boolean NOT NULL DEFAULT true,
  todo_reminder_3d    boolean NOT NULL DEFAULT false,
  todo_reminder_2d    boolean NOT NULL DEFAULT false,
  todo_reminder_1d    boolean NOT NULL DEFAULT false,
  todo_reminder_time  text    NOT NULL DEFAULT '18:00'
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification preferences"
  ON notification_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
