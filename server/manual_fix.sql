-- 1. Ensure KYC columns exist in users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT 'not_submitted';
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT;

-- 2. Create KYC Records table (Audit Trail)
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
    document_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
