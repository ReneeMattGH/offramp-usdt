-- 1. Fix Users table schema
DO $$ 
BEGIN 
    -- Ensure phone_number exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone_number') THEN
        ALTER TABLE public.users ADD COLUMN phone_number VARCHAR(20) UNIQUE;
    END IF;

    -- Ensure email exists (referenced in AuthService)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email') THEN
        ALTER TABLE public.users ADD COLUMN email VARCHAR(255);
    END IF;

    -- Ensure referral_code exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'referral_code') THEN
        ALTER TABLE public.users ADD COLUMN referral_code VARCHAR(50) UNIQUE;
    END IF;

    -- Ensure referred_by exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'referred_by') THEN
        ALTER TABLE public.users ADD COLUMN referred_by UUID;
    END IF;

    -- Ensure account_number exists (already should, but just in case)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'account_number') THEN
        ALTER TABLE public.users ADD COLUMN account_number VARCHAR(50) UNIQUE;
    END IF;

END $$;

-- 2. Fix foreign key constraints to point to public.users instead of auth.users
-- This is critical because the app inserts into public.users

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find all foreign keys pointing to auth.users and change them to public.users
    FOR r IN (
        SELECT 
            tc.table_name, 
            kcu.column_name, 
            tc.constraint_name
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND ccu.table_schema = 'auth' 
          AND ccu.table_name = 'users'
          AND tc.table_schema = 'public'
    ) LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.table_name) || ' DROP CONSTRAINT ' || quote_ident(r.constraint_name);
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.table_name) || ' ADD CONSTRAINT ' || quote_ident(r.constraint_name) || 
                ' FOREIGN KEY (' || quote_ident(r.column_name) || ') REFERENCES public.users(id)';
    END LOOP;
END $$;

-- 3. Ensure otp_store is correct
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'otp_store') THEN
        CREATE TABLE public.otp_store (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            phone_number VARCHAR(50) UNIQUE NOT NULL,
            otp VARCHAR(6) NOT NULL,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            attempts INT DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    ELSE
        -- Ensure phone_number column exists if renamed from account_number
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'otp_store' AND column_name = 'account_number') THEN
            ALTER TABLE public.otp_store RENAME COLUMN account_number TO phone_number;
        END IF;
    END IF;
END $$;

-- 4. Ensure ledger_accounts exists and points to public.users
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) UNIQUE,
    available_balance DECIMAL(20, 6) DEFAULT 0,
    locked_balance DECIMAL(20, 6) DEFAULT 0,
    settled_balance DECIMAL(20, 6) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
