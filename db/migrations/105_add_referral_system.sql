-- Add Referral Columns to Users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES auth.users(id);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_points INTEGER DEFAULT 0;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON public.users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON public.users(referred_by);

-- Create Referral History Table (Optional but good for tracking point history)
CREATE TABLE IF NOT EXISTS referral_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES auth.users(id),
    referred_user_id UUID REFERENCES auth.users(id), -- Can be null if it's a generic bonus
    points_amount INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'signup_bonus', 'trade_commission', etc.
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
