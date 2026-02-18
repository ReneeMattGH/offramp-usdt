-- Create OTP Store Table
CREATE TABLE IF NOT EXISTS otp_store (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_number VARCHAR(50) NOT NULL,
    otp VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_number)
);

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_store(expires_at);
