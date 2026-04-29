-- ============================================================
-- HOUSEHOLDS MIGRATION
-- Run this once in the Supabase SQL Editor for your project.
-- ============================================================

-- 1. Create households table
CREATE TABLE IF NOT EXISTS households (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  join_key TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create household_members table
CREATE TABLE IF NOT EXISTS household_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, user_id)
);

-- 3. Enable RLS on new tables
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything" ON households
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can do everything" ON household_members
  FOR ALL USING (auth.role() = 'authenticated');

-- 4. Add household_id to all data tables
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);
ALTER TABLE todos ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);
ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);
ALTER TABLE shopping_list_history ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);
ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);

-- recipe_categories may or may not exist depending on project state
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipe_categories') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recipe_categories' AND column_name = 'household_id') THEN
      ALTER TABLE recipe_categories ADD COLUMN household_id UUID REFERENCES households(id);
    END IF;
  END IF;
END $$;

-- 5. Create the BeeReal household for all existing data
-- UUID: beed0000-feed-4eed-8eed-000000000001 (all valid hex)
INSERT INTO households (id, name, join_key, created_by)
VALUES ('beed0000-feed-4eed-8eed-000000000001', 'BeeReal', 'BEEHIVE1', NULL)
ON CONFLICT (id) DO NOTHING;

-- 6. Migrate all existing rows to BeeReal
UPDATE todos           SET household_id = 'beed0000-feed-4eed-8eed-000000000001' WHERE household_id IS NULL;
UPDATE shopping_list_items   SET household_id = 'beed0000-feed-4eed-8eed-000000000001' WHERE household_id IS NULL;
UPDATE shopping_list_history SET household_id = 'beed0000-feed-4eed-8eed-000000000001' WHERE household_id IS NULL;
UPDATE recipes         SET household_id = 'beed0000-feed-4eed-8eed-000000000001' WHERE household_id IS NULL;
UPDATE calendar_entries SET household_id = 'beed0000-feed-4eed-8eed-000000000001' WHERE household_id IS NULL;
UPDATE activity_log    SET household_id = 'beed0000-feed-4eed-8eed-000000000001' WHERE household_id IS NULL;
UPDATE profiles        SET household_id = 'beed0000-feed-4eed-8eed-000000000001' WHERE household_id IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipe_categories') THEN
    EXECUTE 'UPDATE recipe_categories SET household_id = ''beed0000-feed-4eed-8eed-000000000001'' WHERE household_id IS NULL';
  END IF;
END $$;

-- 7. Add all existing users as admins of BeeReal
INSERT INTO household_members (household_id, user_id, username, role)
SELECT 'beed0000-feed-4eed-8eed-000000000001', id, username, 'admin'
FROM profiles
ON CONFLICT (household_id, user_id) DO NOTHING;
