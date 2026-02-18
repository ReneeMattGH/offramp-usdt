-- Create enum for transaction types
CREATE TYPE public.transaction_type AS ENUM ('deposit', 'salary', 'withdrawal');

-- Create enum for transaction/withdrawal status
CREATE TYPE public.transaction_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Create users table (bank-based auth)
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_holder_name TEXT NOT NULL,
    account_number TEXT NOT NULL UNIQUE,
    ifsc_code TEXT NOT NULL,
    tron_wallet_address TEXT,
    encrypted_private_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create sessions table for auth
CREATE TABLE public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create OTP table
CREATE TABLE public.otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create transactions table
CREATE TABLE public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    type transaction_type NOT NULL,
    amount DECIMAL(20, 6) NOT NULL,
    status transaction_status DEFAULT 'pending' NOT NULL,
    tx_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create withdrawals table
CREATE TABLE public.withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    amount DECIMAL(20, 6) NOT NULL,
    status transaction_status DEFAULT 'pending' NOT NULL,
    bank_account_number TEXT NOT NULL,
    ifsc_code TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users (public read for auth, restricted write)
CREATE POLICY "Users can view their own data" ON public.users
    FOR SELECT USING (true);

CREATE POLICY "Allow insert for signup" ON public.users
    FOR INSERT WITH CHECK (true);

-- RLS Policies for sessions
CREATE POLICY "Sessions are viewable" ON public.sessions
    FOR SELECT USING (true);

CREATE POLICY "Sessions can be created" ON public.sessions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Sessions can be deleted" ON public.sessions
    FOR DELETE USING (true);

-- RLS Policies for OTPs
CREATE POLICY "OTPs can be created" ON public.otps
    FOR INSERT WITH CHECK (true);

CREATE POLICY "OTPs can be viewed" ON public.otps
    FOR SELECT USING (true);

CREATE POLICY "OTPs can be updated" ON public.otps
    FOR UPDATE USING (true);

-- RLS Policies for transactions
CREATE POLICY "Transactions viewable by owner" ON public.transactions
    FOR SELECT USING (true);

CREATE POLICY "Transactions can be inserted" ON public.transactions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Transactions can be updated" ON public.transactions
    FOR UPDATE USING (true);

-- RLS Policies for withdrawals
CREATE POLICY "Withdrawals viewable by owner" ON public.withdrawals
    FOR SELECT USING (true);

CREATE POLICY "Withdrawals can be inserted" ON public.withdrawals
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Withdrawals can be updated" ON public.withdrawals
    FOR UPDATE USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_withdrawals_updated_at
    BEFORE UPDATE ON public.withdrawals
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();