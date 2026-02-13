
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. Audit Logs (referenced by code)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_type VARCHAR(50), -- 'user', 'admin', 'system'
    actor_id UUID, -- Can be null for system
    action VARCHAR(100) NOT NULL,
    reference_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    ip_address VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1. Create Wallets Table
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL UNIQUE, -- 'system', 'treasury', 'safe_hold'
    address VARCHAR(255) NOT NULL,
    private_key_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    balance DECIMAL(20, 6) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Deposit Addresses Table
CREATE TABLE IF NOT EXISTS deposit_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    tron_address VARCHAR(255) NOT NULL UNIQUE,
    private_key_encrypted TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Ledger Accounts Table
CREATE TABLE IF NOT EXISTS ledger_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
    available_balance DECIMAL(20, 6) DEFAULT 0,
    locked_balance DECIMAL(20, 6) DEFAULT 0,
    settled_balance DECIMAL(20, 6) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create Ledger Entries Table
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(20, 6) NOT NULL,
    balance_type VARCHAR(20) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    reference_id VARCHAR(255),
    description TEXT,
    balance_before DECIMAL(20, 6),
    balance_after DECIMAL(20, 6),
    status VARCHAR(20) DEFAULT 'confirmed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create Blockchain Transactions Table
CREATE TABLE IF NOT EXISTS blockchain_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tx_hash VARCHAR(255) UNIQUE NOT NULL,
    network VARCHAR(50) DEFAULT 'tron_mainnet',
    from_address VARCHAR(255),
    to_address VARCHAR(255),
    token_symbol VARCHAR(20),
    amount DECIMAL(20, 6),
    status VARCHAR(50), -- detected, credited, ignored, late_deposit
    user_id UUID REFERENCES auth.users(id),
    block_number BIGINT,
    sweep_tx_hash VARCHAR(255),
    swept_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create USDT Withdrawals Table
CREATE TABLE IF NOT EXISTS usdt_withdrawals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    destination_address VARCHAR(255) NOT NULL,
    usdt_amount DECIMAL(20, 6) NOT NULL,
    fee DECIMAL(20, 6) NOT NULL,
    net_amount DECIMAL(20, 6) NOT NULL, 
    tx_hash VARCHAR(255) UNIQUE,
    status VARCHAR(50) DEFAULT 'pending',
    failure_reason TEXT,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Create Bank Accounts Table
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    account_number VARCHAR(50) NOT NULL,
    ifsc_code VARCHAR(20) NOT NULL,
    account_holder_name VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    razorpay_fund_account_id VARCHAR(255), -- Optional optimization
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, account_number)
);

-- 8. Create Payout Orders Table
CREATE TABLE IF NOT EXISTS payout_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    usdt_amount DECIMAL(20, 6) NOT NULL,
    inr_amount DECIMAL(20, 2) NOT NULL,
    exchange_rate DECIMAL(20, 2) NOT NULL,
    bank_account_id UUID REFERENCES bank_accounts(id), -- Linked to bank account
    status VARCHAR(50) DEFAULT 'PENDING',
    gateway_ref_id VARCHAR(255),
    idempotency_key VARCHAR(255) UNIQUE,
    failure_reason TEXT,
    rate_locked DECIMAL(20, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Create Exchange Orders Table
CREATE TABLE IF NOT EXISTS exchange_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    usdt_amount DECIMAL(20, 6) NOT NULL,
    inr_amount DECIMAL(20, 2) NOT NULL,
    rate DECIMAL(20, 2) NOT NULL,
    bank_account_id UUID REFERENCES bank_accounts(id), -- Track which bank account was used
    status VARCHAR(50) DEFAULT 'PENDING',
    idempotency_key VARCHAR(255) UNIQUE,
    rate_locked DECIMAL(20, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    min_usdt_withdrawal DECIMAL(20, 2) DEFAULT 20.0,
    usdt_withdrawal_fee DECIMAL(20, 2) DEFAULT 5.0,
    daily_withdrawal_limit DECIMAL(20, 2) DEFAULT 100000.0,
    exchange_spread_percent DECIMAL(5, 2) DEFAULT 1.0, 
    withdrawals_enabled BOOLEAN DEFAULT TRUE,
    deposits_enabled BOOLEAN DEFAULT TRUE,
    exchanges_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 11. Alter Users Table (if needed)
DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE users ADD COLUMN is_banned BOOLEAN DEFAULT FALSE;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
END $$;

-- 12. RPC Functions

-- Credit Deposit
CREATE OR REPLACE FUNCTION credit_deposit(p_user_id UUID, p_amount DECIMAL, p_tx_hash TEXT, p_description TEXT)
RETURNS JSON AS $$
DECLARE
    v_available DECIMAL;
    v_new_available DECIMAL;
    v_account_exists BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM ledger_accounts WHERE user_id = p_user_id) INTO v_account_exists;
    IF NOT v_account_exists THEN
        INSERT INTO ledger_accounts (user_id, available_balance, locked_balance) VALUES (p_user_id, 0, 0);
    END IF;

    IF EXISTS (SELECT 1 FROM ledger_entries WHERE reference_id = p_tx_hash AND type = 'deposit') THEN
         RETURN json_build_object('success', false, 'message', 'Transaction already processed');
    END IF;

    SELECT available_balance INTO v_available FROM ledger_accounts WHERE user_id = p_user_id FOR UPDATE;
    v_new_available := v_available + p_amount;

    UPDATE ledger_accounts SET available_balance = v_new_available, updated_at = NOW() WHERE user_id = p_user_id;

    INSERT INTO ledger_entries (user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after, status)
    VALUES (p_user_id, 'deposit', p_amount, 'available', 'credit', p_tx_hash, p_description, v_available, v_new_available, 'confirmed');

    RETURN json_build_object('success', true, 'new_balance', v_new_available);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Lock Funds
CREATE OR REPLACE FUNCTION lock_funds(p_user_id UUID, p_amount DECIMAL, p_ref_id TEXT, p_description TEXT)
RETURNS JSON AS $$
DECLARE
    v_available DECIMAL;
    v_locked DECIMAL;
    v_new_available DECIMAL;
    v_new_locked DECIMAL;
BEGIN
    SELECT available_balance, locked_balance INTO v_available, v_locked FROM ledger_accounts WHERE user_id = p_user_id FOR UPDATE;

    IF v_available < p_amount THEN
        RETURN json_build_object('success', false, 'message', 'Insufficient funds');
    END IF;

    v_new_available := v_available - p_amount;
    v_new_locked := v_locked + p_amount;

    UPDATE ledger_accounts SET available_balance = v_new_available, locked_balance = v_new_locked, updated_at = NOW() WHERE user_id = p_user_id;

    INSERT INTO ledger_entries (user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after, status)
    VALUES 
    (p_user_id, 'lock', p_amount, 'available', 'debit', p_ref_id, p_description, v_available, v_new_available, 'locked'),
    (p_user_id, 'lock', p_amount, 'locked', 'credit', p_ref_id, p_description, v_locked, v_new_locked, 'locked');

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- Create Exchange Order (Atomic)
CREATE OR REPLACE FUNCTION create_exchange_order(
    p_user_id UUID, 
    p_usdt_amount DECIMAL, 
    p_inr_amount DECIMAL, 
    p_rate DECIMAL, 
    p_bank_account_id UUID,
    p_idempotency_key TEXT
)
RETURNS JSON AS $$
DECLARE
    v_lock_result JSON;
    v_order_id UUID;
    v_payout_id UUID;
BEGIN
    -- 1. Lock Funds
    v_lock_result := lock_funds(p_user_id, p_usdt_amount, p_idempotency_key, 'Exchange Lock');
    
    IF (v_lock_result->>'success')::boolean = false THEN
        RETURN v_lock_result;
    END IF;

    -- 2. Create Exchange Order
    INSERT INTO exchange_orders (user_id, usdt_amount, inr_amount, rate, bank_account_id, idempotency_key, status)
    VALUES (p_user_id, p_usdt_amount, p_inr_amount, p_rate, p_bank_account_id, p_idempotency_key, 'PROCESSING')
    RETURNING id INTO v_order_id;

    -- 3. Create Payout Order (Queue it)
    INSERT INTO payout_orders (user_id, usdt_amount, inr_amount, exchange_rate, bank_account_id, idempotency_key, status, rate_locked)
    VALUES (p_user_id, p_usdt_amount, p_inr_amount, p_rate, p_bank_account_id, p_idempotency_key, 'PENDING', p_rate)
    RETURNING id INTO v_payout_id;

    RETURN json_build_object('success', true, 'order_id', v_order_id, 'payout_id', v_payout_id);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;
