-- SCHEMA MIGRATION: Email + Google Authentication

-- Ensure email column is unique
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;

-- We don't drop phone or its uniqueness entirely since some may still exist from legacy,
-- but if we have backward compatibility without strict phone requirements, you can optionally drop NOT NULL on phone:
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- Google Identity Mapping
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_holder_name TEXT;

-- Password support for manual email login
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Provider Identification
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email';

-- Email Verification States
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP WITH TIME ZONE;
