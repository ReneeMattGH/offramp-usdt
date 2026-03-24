-- Add phone_number to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_number ON public.users(phone_number);

-- Update otp_store table
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'otp_store' AND column_name = 'account_number') THEN
        ALTER TABLE otp_store RENAME COLUMN account_number TO phone_number;
    END IF;
END $$;

-- Update unique constraint on otp_store
ALTER TABLE otp_store DROP CONSTRAINT IF EXISTS otp_store_account_number_key;
ALTER TABLE otp_store ADD CONSTRAINT otp_store_phone_number_key UNIQUE (phone_number);
