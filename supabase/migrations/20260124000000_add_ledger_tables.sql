-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Ledger Accounts (Real-time User Balances)
CREATE TABLE IF NOT EXISTS ledger_accounts (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    available_balance DECIMAL(20, 6) DEFAULT 0 CHECK (available_balance >= 0),
    locked_balance DECIMAL(20, 6) DEFAULT 0 CHECK (locked_balance >= 0),
    settled_balance DECIMAL(20, 6) DEFAULT 0 CHECK (settled_balance >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Ledger Entries (Append-Only History)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    type VARCHAR(50) NOT NULL CHECK (type IN ('deposit', 'withdrawal_lock', 'withdrawal_settle', 'withdrawal_refund', 'admin_adjustment')),
    amount DECIMAL(20, 6) NOT NULL,
    balance_type VARCHAR(50) NOT NULL CHECK (balance_type IN ('available', 'locked', 'settled')),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('credit', 'debit')),
    reference_id UUID, 
    description TEXT,
    balance_before DECIMAL(20, 6) NOT NULL,
    balance_after DECIMAL(20, 6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Triggers for Updated At
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_ledger_accounts_updated_at ON ledger_accounts;
CREATE TRIGGER update_ledger_accounts_updated_at
    BEFORE UPDATE ON ledger_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- RPC Functions for Atomic Transactions

-- Credit Deposit
CREATE OR REPLACE FUNCTION credit_deposit(
    p_user_id UUID,
    p_amount DECIMAL,
    p_tx_hash UUID, -- Using UUID for internal reference if possible, or cast to string if needed. DB schema says reference_id is UUID.
    p_description TEXT
) RETURNS JSONB AS $$
DECLARE
    v_balance_before DECIMAL;
    v_balance_after DECIMAL;
    v_existing_id UUID;
BEGIN
    -- Check for duplicate
    SELECT id INTO v_existing_id FROM ledger_entries 
    WHERE reference_id = p_tx_hash AND type = 'deposit' LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Duplicate transaction');
    END IF;

    -- Ensure account exists
    INSERT INTO ledger_accounts (user_id, available_balance, locked_balance, settled_balance)
    VALUES (p_user_id, 0, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    -- Lock row and get current balance
    SELECT available_balance INTO v_balance_before 
    FROM ledger_accounts WHERE user_id = p_user_id FOR UPDATE;

    v_balance_after := v_balance_before + p_amount;

    -- Insert Entry
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'deposit', p_amount, 'available', 'credit', p_tx_hash, p_description, v_balance_before, v_balance_after
    );

    -- Update Account
    UPDATE ledger_accounts 
    SET available_balance = v_balance_after 
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true, 'new_balance', v_balance_after);
END;
$$ LANGUAGE plpgsql;


-- Lock Funds for Exchange
CREATE OR REPLACE FUNCTION lock_funds(
    p_user_id UUID,
    p_amount DECIMAL,
    p_ref_id UUID,
    p_description TEXT
) RETURNS JSONB AS $$
DECLARE
    v_avail_before DECIMAL;
    v_avail_after DECIMAL;
    v_locked_before DECIMAL;
    v_locked_after DECIMAL;
BEGIN
    -- Lock row
    SELECT available_balance, locked_balance INTO v_avail_before, v_locked_before
    FROM ledger_accounts WHERE user_id = p_user_id FOR UPDATE;

    IF v_avail_before < p_amount THEN
        RAISE EXCEPTION 'Insufficient available balance';
    END IF;

    v_avail_after := v_avail_before - p_amount;
    v_locked_after := v_locked_before + p_amount;

    -- Debit Available
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_lock', p_amount, 'available', 'debit', p_ref_id, p_description, v_avail_before, v_avail_after
    );

    -- Credit Locked
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_lock', p_amount, 'locked', 'credit', p_ref_id, p_description, v_locked_before, v_locked_after
    );

    -- Update Account
    UPDATE ledger_accounts 
    SET available_balance = v_avail_after, locked_balance = v_locked_after
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- Settle Exchange (Success)
CREATE OR REPLACE FUNCTION settle_exchange(
    p_user_id UUID,
    p_amount DECIMAL,
    p_ref_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_locked_before DECIMAL;
    v_locked_after DECIMAL;
    v_settled_before DECIMAL;
    v_settled_after DECIMAL;
BEGIN
    SELECT locked_balance, settled_balance INTO v_locked_before, v_settled_before
    FROM ledger_accounts WHERE user_id = p_user_id FOR UPDATE;

    v_locked_after := v_locked_before - p_amount;
    v_settled_after := v_settled_before + p_amount;

    -- Debit Locked
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_settle', p_amount, 'locked', 'debit', p_ref_id, 'Exchange Settled', v_locked_before, v_locked_after
    );

    -- Credit Settled
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_settle', p_amount, 'settled', 'credit', p_ref_id, 'Exchange Settled', v_settled_before, v_settled_after
    );

    UPDATE ledger_accounts 
    SET locked_balance = v_locked_after, settled_balance = v_settled_after
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- Refund Exchange (Failure)
CREATE OR REPLACE FUNCTION refund_exchange(
    p_user_id UUID,
    p_amount DECIMAL,
    p_ref_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_avail_before DECIMAL;
    v_avail_after DECIMAL;
    v_locked_before DECIMAL;
    v_locked_after DECIMAL;
BEGIN
    SELECT available_balance, locked_balance INTO v_avail_before, v_locked_before
    FROM ledger_accounts WHERE user_id = p_user_id FOR UPDATE;

    v_locked_after := v_locked_before - p_amount;
    v_avail_after := v_avail_before + p_amount;

    -- Debit Locked
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_refund', p_amount, 'locked', 'debit', p_ref_id, 'Exchange Refunded', v_locked_before, v_locked_after
    );

    -- Credit Available
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_refund', p_amount, 'available', 'credit', p_ref_id, 'Exchange Refunded', v_avail_before, v_avail_after
    );

    UPDATE ledger_accounts 
    SET available_balance = v_avail_after, locked_balance = v_locked_after
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
