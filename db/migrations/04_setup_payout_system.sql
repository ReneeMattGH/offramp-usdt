-- Create Payout Orders Table
CREATE TABLE IF NOT EXISTS payout_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    usdt_amount DECIMAL(20, 6) NOT NULL,
    inr_amount DECIMAL(20, 2) NOT NULL,
    exchange_rate DECIMAL(20, 2) NOT NULL,
    bank_account_id UUID, -- References a bank_accounts table if exists, or just stored ID
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED, UNDER_REVIEW
    gateway_ref_id VARCHAR(255),
    idempotency_key VARCHAR(255) UNIQUE,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique constraint to prevent multiple active payouts per user
CREATE UNIQUE INDEX idx_active_payout_per_user ON payout_orders (user_id) 
WHERE status IN ('PENDING', 'PROCESSING');

-- RPC: Lock Payout Funds
CREATE OR REPLACE FUNCTION lock_payout_funds(p_user_id UUID, p_amount DECIMAL, p_order_id TEXT, p_description TEXT)
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

    INSERT INTO ledger_entries (user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after, status)
    VALUES 
    (p_user_id, 'payout_lock', p_amount, 'available', 'debit', p_order_id, p_description, v_available, v_new_available, 'locked'),
    (p_user_id, 'payout_lock', p_amount, 'locked', 'credit', p_order_id, p_description, v_locked, v_new_locked, 'locked');

    RETURN json_build_object('success', true, 'new_available', v_new_available, 'new_locked', v_new_locked);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- RPC: Finalize Payout
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
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- RPC: Fail Payout (Refund)
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
    (p_user_id, 'payout_failed', p_amount, 'locked', 'debit', p_order_id, 'Payout Failed - Unlock', v_locked, v_new_locked, 'reversed'),
    (p_user_id, 'payout_failed', p_amount, 'available', 'credit', p_order_id, 'Payout Failed - Refund', v_available, v_new_available, 'reversed');

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;
