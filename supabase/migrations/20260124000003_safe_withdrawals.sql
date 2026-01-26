-- Safe Withdrawals Migration
-- 1. Updates lock_funds to include Idempotency, KYC Check, and Strict Pending Check
-- 2. Updates settle_exchange to include Idempotency
-- 3. Updates refund_exchange to include Idempotency
-- 4. Adds failure_reason column to withdrawals table

-- Add failure_reason column to withdrawals table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'withdrawals' AND column_name = 'failure_reason') THEN
        ALTER TABLE withdrawals ADD COLUMN failure_reason TEXT;
    END IF;
END $$;

-- Lock Funds for Exchange (Strict & Safe)
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
    v_kyc_status TEXT;
    v_existing_id UUID;
BEGIN
    -- 1. Idempotency Check
    -- Check if we already have a withdrawal_lock entry for this reference_id
    SELECT id INTO v_existing_id FROM ledger_entries 
    WHERE reference_id = p_ref_id AND type = 'withdrawal_lock' LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
        -- Already locked, treat as success (idempotent)
        RETURN jsonb_build_object('success', true, 'message', 'Already processed');
    END IF;

    -- 2. KYC Check
    SELECT kyc_status INTO v_kyc_status FROM users WHERE id = p_user_id;
    
    -- Treat null as 'none' or handle strictly. 
    -- Assuming 'verified' is the required status.
    IF v_kyc_status IS DISTINCT FROM 'verified' THEN
        RAISE EXCEPTION 'User KYC is not verified';
    END IF;

    -- 3. Lock Row & Get Balances
    SELECT available_balance, locked_balance INTO v_avail_before, v_locked_before
    FROM ledger_accounts WHERE user_id = p_user_id FOR UPDATE;

    -- 4. Check Pending Withdrawals (Strict Mode)
    -- If locked_balance > 0, we assume a withdrawal is in progress.
    -- NOTE: This assumes locked_balance is ONLY used for withdrawals.
    IF v_locked_before > 0 THEN
        RAISE EXCEPTION 'Another withdrawal is already pending';
    END IF;

    -- 5. Check Sufficient Balance
    IF v_avail_before < p_amount THEN
        RAISE EXCEPTION 'Insufficient available balance';
    END IF;

    v_avail_after := v_avail_before - p_amount;
    v_locked_after := v_locked_before + p_amount;

    -- 6. Execute Ledger Entries (Debit Available)
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_lock', p_amount, 'available', 'debit', p_ref_id, p_description, v_avail_before, v_avail_after
    );

    -- 7. Execute Ledger Entries (Credit Locked)
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_lock', p_amount, 'locked', 'credit', p_ref_id, p_description, v_locked_before, v_locked_after
    );

    -- 8. Update Account
    UPDATE ledger_accounts 
    SET available_balance = v_avail_after, locked_balance = v_locked_after
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- Settle Exchange (Safe & Idempotent)
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
    v_existing_id UUID;
BEGIN
    -- 1. Idempotency Check
    -- Check if we already have a withdrawal_settle entry for this reference_id
    SELECT id INTO v_existing_id FROM ledger_entries 
    WHERE reference_id = p_ref_id AND type = 'withdrawal_settle' LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already processed');
    END IF;

    -- 2. Lock Row
    SELECT locked_balance, settled_balance INTO v_locked_before, v_settled_before
    FROM ledger_accounts WHERE user_id = p_user_id FOR UPDATE;

    -- 3. Validate Consistency
    -- We expect locked_balance >= amount.
    IF v_locked_before < p_amount THEN
        RAISE EXCEPTION 'Insufficient locked balance for settlement';
    END IF;

    v_locked_after := v_locked_before - p_amount;
    v_settled_after := v_settled_before + p_amount;

    -- 4. Debit Locked
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_settle', p_amount, 'locked', 'debit', p_ref_id, 'Exchange Settled', v_locked_before, v_locked_after
    );

    -- 5. Credit Settled
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_settle', p_amount, 'settled', 'credit', p_ref_id, 'Exchange Settled', v_settled_before, v_settled_after
    );

    -- 6. Update Account
    UPDATE ledger_accounts 
    SET locked_balance = v_locked_after, settled_balance = v_settled_after
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- Refund Exchange (Safe & Idempotent)
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
    v_existing_id UUID;
BEGIN
    -- 1. Idempotency Check
    SELECT id INTO v_existing_id FROM ledger_entries 
    WHERE reference_id = p_ref_id AND type = 'withdrawal_refund' LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already processed');
    END IF;

    -- 2. Lock Row
    SELECT available_balance, locked_balance INTO v_avail_before, v_locked_before
    FROM ledger_accounts WHERE user_id = p_user_id FOR UPDATE;

    -- 3. Validate Consistency
    IF v_locked_before < p_amount THEN
        RAISE EXCEPTION 'Insufficient locked balance for refund';
    END IF;

    v_locked_after := v_locked_before - p_amount;
    v_avail_after := v_avail_before + p_amount;

    -- 4. Debit Locked
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_refund', p_amount, 'locked', 'debit', p_ref_id, 'Exchange Refunded', v_locked_before, v_locked_after
    );

    -- 5. Credit Available
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_refund', p_amount, 'available', 'credit', p_ref_id, 'Exchange Refunded', v_avail_before, v_avail_after
    );

    -- 6. Update Account
    UPDATE ledger_accounts 
    SET available_balance = v_avail_after, locked_balance = v_locked_after
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
