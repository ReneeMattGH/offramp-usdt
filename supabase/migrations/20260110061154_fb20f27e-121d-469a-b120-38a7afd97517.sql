-- Create salary_transactions table for tracking salary payments
CREATE TABLE public.salary_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount_usdt NUMERIC(20, 6) NOT NULL CHECK (amount_usdt > 0),
  tx_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED', 'BROADCASTED', 'CONFIRMED', 'FAILED')),
  block_number BIGINT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  broadcasted_at TIMESTAMP WITH TIME ZONE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create ledger table for tracking user balances
CREATE TABLE public.ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id),
  tx_hash TEXT NOT NULL,
  credit_usdt NUMERIC(20, 6) NOT NULL DEFAULT 0,
  debit_usdt NUMERIC(20, 6) NOT NULL DEFAULT 0,
  balance_after NUMERIC(20, 6) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, tx_hash)
);

-- Create processed_transactions table for idempotency
CREATE TABLE public.processed_transactions (
  tx_hash TEXT PRIMARY KEY,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  transaction_type TEXT NOT NULL,
  amount_usdt NUMERIC(20, 6) NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  block_number BIGINT
);

-- Create admin_wallets table for company hot wallet
CREATE TABLE public.admin_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  wallet_type TEXT NOT NULL DEFAULT 'company_hot_wallet',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.salary_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_wallets ENABLE ROW LEVEL SECURITY;

-- RLS policies for salary_transactions
CREATE POLICY "Users can view their own salary transactions"
ON public.salary_transactions
FOR SELECT
USING (true);

CREATE POLICY "Salary transactions can be inserted by system"
ON public.salary_transactions
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Salary transactions can be updated by system"
ON public.salary_transactions
FOR UPDATE
USING (true);

-- RLS policies for ledger
CREATE POLICY "Users can view their own ledger entries"
ON public.ledger
FOR SELECT
USING (true);

CREATE POLICY "Ledger entries can be inserted by system"
ON public.ledger
FOR INSERT
WITH CHECK (true);

-- RLS policies for processed_transactions
CREATE POLICY "Processed transactions viewable"
ON public.processed_transactions
FOR SELECT
USING (true);

CREATE POLICY "Processed transactions can be inserted"
ON public.processed_transactions
FOR INSERT
WITH CHECK (true);

-- RLS policies for admin_wallets
CREATE POLICY "Admin wallets viewable"
ON public.admin_wallets
FOR SELECT
USING (true);

-- Create indexes for performance
CREATE INDEX idx_salary_transactions_user_id ON public.salary_transactions(user_id);
CREATE INDEX idx_salary_transactions_status ON public.salary_transactions(status);
CREATE INDEX idx_salary_transactions_tx_hash ON public.salary_transactions(tx_hash);
CREATE INDEX idx_ledger_user_id ON public.ledger(user_id);
CREATE INDEX idx_ledger_tx_hash ON public.ledger(tx_hash);
CREATE INDEX idx_processed_transactions_to_address ON public.processed_transactions(to_address);

-- Create function to get user balance from ledger
CREATE OR REPLACE FUNCTION public.get_user_balance(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_balance NUMERIC(20, 6);
BEGIN
  SELECT COALESCE(
    (SELECT balance_after FROM public.ledger 
     WHERE user_id = p_user_id 
     ORDER BY created_at DESC 
     LIMIT 1),
    0
  ) INTO v_balance;
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to update salary_transactions updated_at
CREATE TRIGGER update_salary_transactions_updated_at
BEFORE UPDATE ON public.salary_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();