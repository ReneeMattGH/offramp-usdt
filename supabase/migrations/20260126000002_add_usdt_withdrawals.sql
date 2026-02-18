
-- 20260126000002_add_usdt_withdrawals.sql
-- Add usdt_withdrawals table for crypto withdrawals

CREATE TABLE IF NOT EXISTS public.usdt_withdrawals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) NOT NULL,
    destination_address TEXT NOT NULL,
    usdt_amount NUMERIC NOT NULL,
    fee NUMERIC NOT NULL,
    net_amount NUMERIC NOT NULL,
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, refunded
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_usdt_withdrawals_user_id ON public.usdt_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_usdt_withdrawals_status ON public.usdt_withdrawals(status);

-- RLS Policies
ALTER TABLE public.usdt_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own usdt withdrawals" ON public.usdt_withdrawals;
CREATE POLICY "Users can view own usdt withdrawals" ON public.usdt_withdrawals
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all usdt withdrawals" ON public.usdt_withdrawals;
CREATE POLICY "Admins can view all usdt withdrawals" ON public.usdt_withdrawals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        )
    );
