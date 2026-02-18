-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Wallets Table
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL UNIQUE, -- 'system', 'treasury', 'safe_hold'
    address VARCHAR(255) NOT NULL,
    private_key_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.1 Create Deposit Addresses Table
CREATE TABLE IF NOT EXISTS deposit_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    tron_address VARCHAR(255) NOT NULL UNIQUE,
    private_key_encrypted TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Ledger Accounts Table
CREATE TABLE IF NOT EXISTS ledger_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
    available_balance DECIMAL(20, 6) DEFAULT 0,
    locked_balance DECIMAL(20, 6) DEFAULT 0,
    settled_balance DECIMAL(20, 6) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Ledger Entries Table
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

-- 4. Create Blockchain Transactions Table
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

-- 5. Create USDT Withdrawals Table
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

-- 6. Create Payout Orders Table
CREATE TABLE IF NOT EXISTS payout_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    usdt_amount DECIMAL(20, 6) NOT NULL,
    inr_amount DECIMAL(20, 2) NOT NULL,
    exchange_rate DECIMAL(20, 2) NOT NULL,
    bank_account_id UUID,
    status VARCHAR(50) DEFAULT 'PENDING',
    gateway_ref_id VARCHAR(255),
    idempotency_key VARCHAR(255) UNIQUE,
    failure_reason TEXT,
    rate_locked DECIMAL(20, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6.1 Create Exchange Orders Table
CREATE TABLE IF NOT EXISTS exchange_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    usdt_amount DECIMAL(20, 6) NOT NULL,
    inr_amount DECIMAL(20, 2) NOT NULL,
    rate DECIMAL(20, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    idempotency_key VARCHAR(255) UNIQUE,
    rate_locked DECIMAL(20, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique index for active payouts
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_payout_per_user ON payout_orders (user_id) 
WHERE status IN ('PENDING', 'PROCESSING');


-- 7. RPC Functions

-- Credit Deposit
CREATE OR REPLACE FUNCTION credit_deposit(p_user_id UUID, p_amount DECIMAL, p_tx_hash TEXT, p_description TEXT)
RETURNS JSON AS $$
DECLARE
    v_available DECIMAL;
    v_new_available DECIMAL;
    v_account_exists BOOLEAN;
BEGIN
    -- Ensure ledger account exists
    SELECT EXISTS(SELECT 1 FROM ledger_accounts WHERE user_id = p_user_id) INTO v_account_exists;
    IF NOT v_account_exists THEN
        INSERT INTO ledger_accounts (user_id, available_balance, locked_balance) VALUES (p_user_id, 0, 0);
    END IF;

    -- Check idempotency
    IF EXISTS (SELECT 1 FROM ledger_entries WHERE reference_id = p_tx_hash AND type = 'deposit') THEN
         RETURN json_build_object('success', false, 'message', 'Transaction already processed');
    END IF;

    SELECT available_balance INTO v_available
    FROM ledger_accounts
    WHERE user_id = p_user_id
    FOR UPDATE;

    v_new_available := v_available + p_amount;

    UPDATE ledger_accounts
    SET available_balance = v_new_available,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO ledger_entries (user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after, status)
    VALUES 
    (p_user_id, 'deposit', p_amount, 'available', 'credit', p_tx_hash, p_description, v_available, v_new_available, 'confirmed');

    RETURN json_build_object('success', true, 'new_balance', v_new_available);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Lock Funds (Generic)
CREATE OR REPLACE FUNCTION lock_funds(p_user_id UUID, p_amount DECIMAL, p_ref_id TEXT, p_description TEXT)
RETURNS JSON AS $$
DECLARE
    v_available DECIMAL;
    v_locked DECIMAL;
    v_new_available DECIMAL;
    v_new_locked DECIMAL;
BEGIN
    SELECT available_balance, locked_balance INTO v_available, v_locked
    FROM ledger_accounts
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_available < p_amount THEN
        RETURN json_build_object('success', false, 'message', 'Insufficient funds');
    END IF;

    v_new_available := v_available - p_amount;
    v_new_locked := v_locked + p_amount;

    UPDATE ledger_accounts
    SET available_balance = v_new_available,
        locked_balance = v_new_locked,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO ledger_entries (user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after, status)
    VALUES 
    (p_user_id, 'lock', p_amount, 'available', 'debit', p_ref_id, p_description, v_available, v_new_available, 'locked'),
    (p_user_id, 'lock', p_amount, 'locked', 'credit', p_ref_id, p_description, v_locked, v_new_locked, 'locked');

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- Lock Payout Funds
CREATE OR REPLACE FUNCTION lock_payout_funds(p_user_id UUID, p_amount DECIMAL, p_order_id TEXT, p_description TEXT)
RETURNS JSON AS $$
DECLARE
    v_available DECIMAL;
    v_locked DECIMAL;
    v_new_available DECIMAL;
    v_new_locked DECIMAL;
BEGIN
    SELECT available_balance, locked_balance INTO v_available, v_locked
    FROM ledger_accounts
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_available < p_amount THEN
        RETURN json_build_object('success', false, 'message', 'Insufficient funds');
    END IF;

    v_new_available := v_available - p_amount;
    v_new_locked := v_locked + p_amount;

    UPDATE ledger_accounts
    SET available_balance = v_new_available,
        locked_balance = v_new_locked,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO ledger_entries (user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after, status)
    VALUES 
    (p_user_id, 'payout_lock', p_amount, 'available', 'debit', p_order_id, p_description, v_available, v_new_available, 'locked'),
    (p_user_id, 'payout_lock', p_amount, 'locked', 'credit', p_order_id, p_description, v_locked, v_new_locked, 'locked');

    RETURN json_build_object('success', true, 'new_available', v_new_available, 'new_locked', v_new_locked);
END;
$$ LANGUAGE plpgsql;

-- Finalize Payout
CREATE OR REPLACE FUNCTION finalize_payout(p_user_id UUID, p_amount DECIMAL, p_order_id TEXT)
RETURNS JSON AS $$
DECLARE
    v_locked DECIMAL;
    v_new_locked DECIMAL;
BEGIN
    SELECT locked_balance INTO v_locked
    FROM ledger_accounts
    WHERE user_id = p_user_id
    FOR UPDATE;

    v_new_locked := v_locked - p_amount;

    UPDATE ledger_accounts
    SET locked_balance = v_new_locked,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO ledger_entries (user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after, status)
    VALUES 
    (p_user_id, 'payout_finalized', p_amount, 'locked', 'debit', p_order_id, 'Payout Finalized', v_locked, v_new_locked, 'confirmed');

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- Create Exchange Order (Atomic Lock + Create + Payout Queue)
CREATE OR REPLACE FUNCTION create_exchange_order(
    p_user_id UUID, 
    p_usdt_amount DECIMAL, 
    p_inr_amount DECIMAL, 
    p_rate DECIMAL, 
    p_bank_account_id UUID,
    p_idempotency_key TEXT
)
RETURNS UUID AS $$
DECLARE
    v_available DECIMAL;
    v_locked DECIMAL;
    v_new_available DECIMAL;
    v_new_locked DECIMAL;
    v_order_id UUID;
    v_payout_id UUID;
BEGIN
    -- 1. Check Idempotency
    SELECT id INTO v_order_id FROM exchange_orders WHERE idempotency_key = p_idempotency_key;
    IF v_order_id IS NOT NULL THEN
        RETURN v_order_id;
    END IF;

    -- 2. Lock Funds
    SELECT available_balance, locked_balance INTO v_available, v_locked
    FROM ledger_accounts
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_available < p_usdt_amount THEN
        RAISE EXCEPTION 'Insufficient funds';
    END IF;

    v_new_available := v_available - p_usdt_amount;
    v_new_locked := v_locked + p_usdt_amount;

    UPDATE ledger_accounts
    SET available_balance = v_new_available,
        locked_balance = v_new_locked,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- 3. Create Exchange Order
    INSERT INTO exchange_orders (
        user_id, usdt_amount, inr_amount, rate, status, idempotency_key, rate_locked
    ) VALUES (
        p_user_id, p_usdt_amount, p_inr_amount, p_rate, 'CONFIRMED', p_idempotency_key, p_rate
    ) RETURNING id INTO v_order_id;

    -- 4. Create Payout Order (Queue for Worker)
    INSERT INTO payout_orders (
        user_id, usdt_amount, inr_amount, exchange_rate, bank_account_id, status, idempotency_key
    ) VALUES (
        p_user_id, p_usdt_amount, p_inr_amount, p_rate, p_bank_account_id, 'PENDING', p_idempotency_key
    ) RETURNING id INTO v_payout_id;

    -- 5. Create Ledger Entries
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after, status
    ) VALUES 
    (p_user_id, 'exchange_lock', p_usdt_amount, 'available', 'debit', v_order_id::text, 'Exchange Lock', v_available, v_new_available, 'locked'),
    (p_user_id, 'exchange_lock', p_usdt_amount, 'locked', 'credit', v_order_id::text, 'Exchange Lock', v_locked, v_new_locked, 'locked');

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

-- Fail Payout (Refund)
CREATE OR REPLACE FUNCTION fail_payout(p_user_id UUID, p_amount DECIMAL, p_order_id TEXT)
RETURNS JSON AS $$
DECLARE
    v_available DECIMAL;
    v_locked DECIMAL;
    v_new_available DECIMAL;
    v_new_locked DECIMAL;
BEGIN
    SELECT available_balance, locked_balance INTO v_available, v_locked
    FROM ledger_accounts
    WHERE user_id = p_user_id
    FOR UPDATE;

    v_new_available := v_available + p_amount;
    v_new_locked := v_locked - p_amount;

    UPDATE ledger_accounts
    SET available_balance = v_new_available,
        locked_balance = v_new_locked,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO ledger_entries (user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after, status)
    VALUES 
    (p_user_id, 'payout_failed', p_amount, 'locked', 'debit', p_order_id, 'Payout Refund - Unlock', v_locked, v_new_locked, 'reversed'),
    (p_user_id, 'payout_failed', p_amount, 'available', 'credit', p_order_id, 'Payout Refund - Unlock', v_available, v_new_available, 'reversed');

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
