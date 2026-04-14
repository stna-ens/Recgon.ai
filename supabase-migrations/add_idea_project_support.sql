-- Add idea/description project support
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'codebase';
ALTER TABLE projects ALTER COLUMN path DROP NOT NULL;
