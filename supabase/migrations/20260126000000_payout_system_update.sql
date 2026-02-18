-- 20260126000000_payout_system_update.sql
-- Update exchange_orders and create payout_attempts

-- 1. Update exchange_orders table
ALTER TABLE IF EXISTS exchange_orders 
ADD COLUMN IF NOT EXISTS payout_reference_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS utr VARCHAR(255),
ADD COLUMN IF NOT EXISTS failure_reason TEXT,
ADD COLUMN IF NOT EXISTS rate_locked DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;

-- 2. Create payout_attempts table
CREATE TABLE IF NOT EXISTS payout_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange_order_id UUID REFERENCES exchange_orders(id) NOT NULL,
    provider VARCHAR(50) NOT NULL, -- 'RAZORPAY', 'CASHFREE'
    request_payload JSONB,
    response_payload JSONB,
    status VARCHAR(50), -- 'REQUEST', 'SUCCESS', 'FAILED', 'WEBHOOK'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for payout_attempts
ALTER TABLE payout_attempts ENABLE ROW LEVEL SECURITY;

-- 3. Update create_exchange_order RPC to support rate_locked
CREATE OR REPLACE FUNCTION create_exchange_order(
    p_user_id UUID,
    p_usdt_amount DECIMAL,
    p_inr_amount DECIMAL,
    p_rate DECIMAL,
    p_idempotency_key VARCHAR
) RETURNS UUID AS $$
DECLARE
    v_available_balance DECIMAL;
    v_new_order_id UUID;
BEGIN
    -- 1. Check Idempotency
    IF EXISTS (SELECT 1 FROM exchange_orders WHERE idempotency_key = p_idempotency_key) THEN
        RAISE EXCEPTION 'Duplicate order request';
    END IF;

    -- 2. Lock Row & Check Balance
    SELECT available_balance INTO v_available_balance
    FROM ledger_accounts
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_available_balance IS NULL OR v_available_balance < p_usdt_amount THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;

    -- 3. Update Balances (Lock Funds)
    UPDATE ledger_accounts
    SET available_balance = available_balance - p_usdt_amount,
        locked_balance = locked_balance + p_usdt_amount
    WHERE user_id = p_user_id;

    -- 4. Insert Exchange Order (Added rate_locked)
    INSERT INTO exchange_orders (
        user_id, usdt_amount, inr_amount, rate, rate_locked, idempotency_key, status
    ) VALUES (
        p_user_id, p_usdt_amount, p_inr_amount, p_rate, p_rate, p_idempotency_key, 'PENDING'
    ) RETURNING id INTO v_new_order_id;

    -- 5. Insert Ledger Entries (Audit)
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES 
    (
        p_user_id, 'exchange_lock', p_usdt_amount, 'available', 'debit', v_new_order_id, 
        'Locked for Exchange Order', v_available_balance, v_available_balance - p_usdt_amount
    ),
    (
        p_user_id, 'exchange_lock', p_usdt_amount, 'locked', 'credit', v_new_order_id, 
        'Locked for Exchange Order', 
        (SELECT locked_balance - p_usdt_amount FROM ledger_accounts WHERE user_id = p_user_id), -- Approximate previous state
        (SELECT locked_balance FROM ledger_accounts WHERE user_id = p_user_id)
    );

    RETURN v_new_order_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Update settle_exchange_order RPC to use new columns
CREATE OR REPLACE FUNCTION settle_exchange_order(
    p_order_id UUID,
    p_bank_reference VARCHAR,
    p_payout_reference_id VARCHAR
) RETURNS VOID AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- Get Order
    SELECT * INTO v_order FROM exchange_orders WHERE id = p_order_id FOR UPDATE;
    
    IF v_order.status = 'SUCCESS' THEN
        RETURN;
    END IF;

    -- Update Order
    UPDATE exchange_orders
    SET status = 'SUCCESS',
        bank_reference = p_bank_reference, -- Legacy column support
        utr = p_bank_reference,
        payout_reference_id = p_payout_reference_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Deduct Locked Balance
    UPDATE ledger_accounts
    SET locked_balance = locked_balance - v_order.usdt_amount
    WHERE user_id = v_order.user_id;

    -- Ledger Entry (Completion)
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        v_order.user_id, 'exchange_complete', v_order.usdt_amount, 'locked', 'debit', p_order_id,
        'Exchange Completed', 0, 0 -- Simplify for now, ideally fetch real balances
    );
END;
$$ LANGUAGE plpgsql;

-- 5. Update refund_exchange_order RPC to use failure_reason
CREATE OR REPLACE FUNCTION refund_exchange_order(
    p_order_id UUID,
    p_reason TEXT
) RETURNS VOID AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order FROM exchange_orders WHERE id = p_order_id FOR UPDATE;

    IF v_order.status = 'REFUNDED' OR v_order.status = 'SUCCESS' THEN
        RETURN;
    END IF;

    -- Update Order
    UPDATE exchange_orders
    SET status = 'REFUNDED',
        failure_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Unlock Funds
    UPDATE ledger_accounts
    SET locked_balance = locked_balance - v_order.usdt_amount,
        available_balance = available_balance + v_order.usdt_amount
    WHERE user_id = v_order.user_id;

    -- Ledger Entry
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        v_order.user_id, 'exchange_refund', v_order.usdt_amount, 'locked', 'debit', p_order_id,
        'Exchange Refunded', 0, 0 
    ),
    (
        v_order.user_id, 'exchange_refund', v_order.usdt_amount, 'available', 'credit', p_order_id,
        'Exchange Refunded', 0, 0
    );
END;
$$ LANGUAGE plpgsql;
