-- Create Wallets Table
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL UNIQUE, -- 'system', 'treasury', 'safe_hold'
    address VARCHAR(255) NOT NULL,
    private_key_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Deposit Addresses Table
CREATE TABLE IF NOT EXISTS deposit_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    tron_address VARCHAR(255) NOT NULL UNIQUE,
    private_key_encrypted TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Ledger Accounts Table
CREATE TABLE IF NOT EXISTS ledger_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
    available_balance DECIMAL(20, 6) DEFAULT 0,
    locked_balance DECIMAL(20, 6) DEFAULT 0,
    settled_balance DECIMAL(20, 6) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Ledger Entries Table
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    type VARCHAR(50) NOT NULL, -- 'deposit', 'withdrawal_lock', 'withdrawal_finalized', 'withdrawal_failed', etc.
    amount DECIMAL(20, 6) NOT NULL,
    balance_type VARCHAR(20) NOT NULL, -- 'available', 'locked', 'settled'
    direction VARCHAR(10) NOT NULL, -- 'credit', 'debit'
    reference_id VARCHAR(255), -- tx_hash or withdrawal_id
    description TEXT,
    balance_before DECIMAL(20, 6),
    balance_after DECIMAL(20, 6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create USDT Withdrawals Table
CREATE TABLE IF NOT EXISTS usdt_withdrawals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    destination_address VARCHAR(255) NOT NULL,
    usdt_amount DECIMAL(20, 6) NOT NULL, -- Amount requested
    fee DECIMAL(20, 6) NOT NULL,
    net_amount DECIMAL(20, 6) NOT NULL, 
    tx_hash VARCHAR(255) UNIQUE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed, refunded
    failure_reason TEXT,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Blockchain Transactions Table (for Deposits)
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

-- RPC: Lock Funds
CREATE OR REPLACE FUNCTION lock_funds(p_user_id UUID, p_amount DECIMAL, p_ref_id TEXT, p_description TEXT)
RETURNS JSON AS $$
DECLARE
    v_available DECIMAL;
    v_locked DECIMAL;
    v_new_available DECIMAL;
    v_new_locked DECIMAL;
BEGIN
    -- Select for update to lock the row
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

    INSERT INTO ledger_entries (user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after)
    VALUES 
    (p_user_id, 'withdrawal_lock', p_amount, 'available', 'debit', p_ref_id, p_description, v_available, v_new_available),
    (p_user_id, 'withdrawal_lock', p_amount, 'locked', 'credit', p_ref_id, p_description, v_locked, v_new_locked);

    RETURN json_build_object('success', true, 'new_available', v_new_available, 'new_locked', v_new_locked);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- RPC: Finalize Withdrawal
CREATE OR REPLACE FUNCTION finalize_withdrawal(p_user_id UUID, p_amount DECIMAL, p_withdrawal_id UUID)
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

    INSERT INTO ledger_entries (user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after)
    VALUES 
    (p_user_id, 'withdrawal_finalized', p_amount, 'locked', 'debit', p_withdrawal_id, 'Withdrawal Finalized', v_locked, v_new_locked);

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- RPC: Fail Withdrawal (Refund)
CREATE OR REPLACE FUNCTION fail_withdrawal(p_user_id UUID, p_amount DECIMAL, p_withdrawal_id UUID)
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

    INSERT INTO ledger_entries (user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after)
    VALUES 
    (p_user_id, 'withdrawal_failed', p_amount, 'locked', 'debit', p_withdrawal_id, 'Withdrawal Failed - Unlock', v_locked, v_new_locked),
    (p_user_id, 'withdrawal_failed', p_amount, 'available', 'credit', p_withdrawal_id, 'Withdrawal Failed - Refund', v_available, v_new_available);

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- RPC: Credit Deposit
CREATE OR REPLACE FUNCTION credit_deposit(p_user_id UUID, p_amount DECIMAL, p_tx_hash TEXT, p_description TEXT)
RETURNS JSON AS $$
DECLARE
    v_available DECIMAL;
    v_new_available DECIMAL;
BEGIN
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

    INSERT INTO ledger_entries (user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after)
    VALUES 
    (p_user_id, 'deposit', p_amount, 'available', 'credit', p_tx_hash, p_description, v_available, v_new_available);

    RETURN json_build_object('success', true, 'new_balance', v_new_available);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;
