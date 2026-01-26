-- Fix KYC Schema: Ensure columns exist
-- This migration fixes the "column does not exist" errors for kyc_status, aadhaar_number, and is_admin

-- 1. Add kyc_status if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kyc_status') THEN
        ALTER TABLE public.users ADD COLUMN kyc_status TEXT DEFAULT 'none';
        CREATE INDEX idx_users_kyc_status ON public.users(kyc_status);
    END IF;
END $$;

-- 2. Add aadhaar_number if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'aadhaar_number') THEN
        ALTER TABLE public.users ADD COLUMN aadhaar_number TEXT;
    END IF;
END $$;

-- 3. Add is_admin if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_admin') THEN
        ALTER TABLE public.users ADD COLUMN is_admin BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 4. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
