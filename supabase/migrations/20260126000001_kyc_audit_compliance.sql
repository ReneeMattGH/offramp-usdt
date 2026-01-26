-- 20260126000001_kyc_audit_compliance.sql
-- Hardening KYC, adding Audit Logs, and preparing for Compliance

DO $$
BEGIN
    -- 1. Enhance users table for full KYC tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kyc_provider') THEN
        ALTER TABLE public.users ADD COLUMN kyc_provider TEXT DEFAULT 'manual';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kyc_reference_id') THEN
        ALTER TABLE public.users ADD COLUMN kyc_reference_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kyc_verified_at') THEN
        ALTER TABLE public.users ADD COLUMN kyc_verified_at TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kyc_rejection_reason') THEN
        ALTER TABLE public.users ADD COLUMN kyc_rejection_reason TEXT;
    END IF;

END $$;

-- 2. Create kyc_records table for audit trail of submissions
CREATE TABLE IF NOT EXISTS public.kyc_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) NOT NULL,
    aadhaar_number_masked TEXT NOT NULL, -- Store only last 4 digits or masked version
    full_name TEXT NOT NULL,
    dob DATE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    provider TEXT DEFAULT 'manual',
    provider_reference_id TEXT,
    raw_response JSONB, -- Store provider response for debugging
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT
);

-- 3. Create audit_logs table for system-wide tracking
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    actor_id UUID, -- Can be null if system action
    actor_type TEXT NOT NULL DEFAULT 'user', -- user, admin, system
    action TEXT NOT NULL, -- e.g., 'KYC_APPROVE', 'EXCHANGE_CREATE'
    reference_id TEXT, -- e.g., order_id, user_id
    metadata JSONB, -- Flexible payload
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create RLS Policies

-- kyc_records: Users can see their own, Admins can see all
ALTER TABLE public.kyc_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own kyc records" ON public.kyc_records;
CREATE POLICY "Users can view own kyc records" ON public.kyc_records
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all kyc records" ON public.kyc_records;
CREATE POLICY "Admins can view all kyc records" ON public.kyc_records
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
    );

-- audit_logs: Admins only
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
    );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_kyc_records_user_id ON public.kyc_records(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
