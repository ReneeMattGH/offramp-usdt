-- Ensure KYC columns exist in users table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'aadhaar_number') THEN
        ALTER TABLE public.users ADD COLUMN aadhaar_number TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kyc_status') THEN
        ALTER TABLE public.users ADD COLUMN kyc_status VARCHAR(50) DEFAULT 'pending';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kyc_verified_at') THEN
        ALTER TABLE public.users ADD COLUMN kyc_verified_at TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kyc_rejection_reason') THEN
        ALTER TABLE public.users ADD COLUMN kyc_rejection_reason TEXT;
    END IF;
END $$;

-- Create KYC Records table if not exists
CREATE TABLE IF NOT EXISTS kyc_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    aadhaar_number_masked VARCHAR(20),
    full_name VARCHAR(255),
    dob DATE,
    status VARCHAR(50),
    provider VARCHAR(50),
    raw_response JSONB,
    rejection_reason TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
