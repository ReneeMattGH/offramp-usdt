-- Add kyc_status and is_admin to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'none'; -- none, pending, verified, rejected
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON public.users(kyc_status);
CREATE INDEX IF NOT EXISTS idx_deposit_addresses_is_used ON public.deposit_addresses(is_used);
CREATE INDEX IF NOT EXISTS idx_deposit_addresses_expires_at ON public.deposit_addresses(expires_at);
