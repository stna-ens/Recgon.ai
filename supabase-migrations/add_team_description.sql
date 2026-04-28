-- Add description, avatar_color, and avatar_url fields to teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS avatar_color TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS avatar_url TEXT;
