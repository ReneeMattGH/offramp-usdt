-- 20260125000003_ensure_kyc_status.sql
-- Forcefully ensure kyc_status exists on users table

DO $$
BEGIN
    -- 1. Ensure kyc_status column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kyc_status') THEN
        ALTER TABLE public.users ADD COLUMN kyc_status TEXT DEFAULT 'none';
    END IF;

    -- 2. Ensure is_admin column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_admin') THEN
        ALTER TABLE public.users ADD COLUMN is_admin BOOLEAN DEFAULT false;
    END IF;

    -- 3. Ensure aadhaar_number column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'aadhaar_number') THEN
        ALTER TABLE public.users ADD COLUMN aadhaar_number TEXT;
    END IF;
    
    -- 4. Ensure razorpay_fund_account_id exists (for Payout Service)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'razorpay_fund_account_id') THEN
        ALTER TABLE public.users ADD COLUMN razorpay_fund_account_id TEXT;
    END IF;
    
    -- 5. Ensure razorpay_contact_id exists (for Payout Service)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'razorpay_contact_id') THEN
        ALTER TABLE public.users ADD COLUMN razorpay_contact_id TEXT;
    END IF;

END $$;

-- Re-create indexes to be safe
DROP INDEX IF EXISTS idx_users_kyc_status;
CREATE INDEX idx_users_kyc_status ON public.users(kyc_status);
