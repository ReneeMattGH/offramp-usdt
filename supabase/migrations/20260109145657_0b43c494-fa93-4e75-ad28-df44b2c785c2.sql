-- Create table for rotating deposit addresses
CREATE TABLE public.deposit_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tron_address TEXT NOT NULL UNIQUE,
  private_key_encrypted TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT false
);

-- Enable RLS
ALTER TABLE public.deposit_addresses ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own deposit addresses"
ON public.deposit_addresses
FOR SELECT
USING (true);

CREATE POLICY "Deposit addresses can be inserted"
ON public.deposit_addresses
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Deposit addresses can be updated"
ON public.deposit_addresses
FOR UPDATE
USING (true);

-- Create banks table for withdrawal options
CREATE TABLE public.banks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  processing_time TEXT NOT NULL DEFAULT '1-2 business days',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;

-- Banks are publicly viewable
CREATE POLICY "Banks are viewable by everyone"
ON public.banks
FOR SELECT
USING (true);

-- Insert popular Indian banks
INSERT INTO public.banks (name, code, processing_time) VALUES
  ('State Bank of India', 'SBI', '1-2 business days'),
  ('HDFC Bank', 'HDFC', '1-2 business days'),
  ('ICICI Bank', 'ICICI', '1-2 business days'),
  ('Axis Bank', 'AXIS', '1-2 business days'),
  ('Kotak Mahindra Bank', 'KOTAK', '1-2 business days'),
  ('Punjab National Bank', 'PNB', '2-3 business days'),
  ('Bank of Baroda', 'BOB', '2-3 business days'),
  ('Canara Bank', 'CANARA', '2-3 business days'),
  ('Union Bank of India', 'UNION', '2-3 business days'),
  ('IndusInd Bank', 'INDUSIND', '1-2 business days');

-- Add bank_code column to withdrawals table
ALTER TABLE public.withdrawals ADD COLUMN bank_code TEXT;