-- Add pan_number to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pan_number TEXT;
