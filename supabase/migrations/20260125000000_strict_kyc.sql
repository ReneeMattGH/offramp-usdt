-- Strict KYC Migration
-- 1. Create ENUM type for KYC Status
-- 2. Alter users table to use ENUM
-- 3. Add kyc_verified_at column
-- 4. Set defaults and migrate existing data

-- Create the ENUM type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_status_enum') THEN
        CREATE TYPE kyc_status_enum AS ENUM ('not_submitted', 'pending', 'approved', 'rejected');
    END IF;
END $$;

-- Add kyc_verified_at column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kyc_verified_at') THEN
        ALTER TABLE public.users ADD COLUMN kyc_verified_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Migrate existing text data to ENUM compatible values
-- First, ensure all existing values map to the new ENUM values
UPDATE public.users 
SET kyc_status = 'approved' 
WHERE kyc_status = 'verified' OR kyc_status = 'true';

UPDATE public.users 
SET kyc_status = 'not_submitted' 
WHERE kyc_status IS NULL OR kyc_status = 'none' OR kyc_status = '';

-- Now alter the column to use the ENUM type
-- We use a USING clause to cast the text to the enum
ALTER TABLE public.users 
ALTER COLUMN kyc_status TYPE kyc_status_enum 
USING kyc_status::kyc_status_enum;

-- Set Default Value
ALTER TABLE public.users 
ALTER COLUMN kyc_status SET DEFAULT 'not_submitted';

-- Update kyc_verified_at for existing approved users
UPDATE public.users
SET kyc_verified_at = NOW()
WHERE kyc_status = 'approved' AND kyc_verified_at IS NULL;
