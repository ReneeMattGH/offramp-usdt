
-- RPC Functions for USDT Withdrawals

-- Finalize Withdrawal (Success: Burn Locked Funds)
CREATE OR REPLACE FUNCTION finalize_withdrawal(
    p_user_id UUID,
    p_amount DECIMAL,
    p_withdrawal_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_locked_before DECIMAL;
    v_locked_after DECIMAL;
BEGIN
    -- Lock row
    SELECT locked_balance INTO v_locked_before
    FROM ledger_accounts WHERE user_id = p_user_id FOR UPDATE;

    v_locked_after := v_locked_before - p_amount;

    IF v_locked_after < 0 THEN
        RAISE EXCEPTION 'Negative locked balance detected';
    END IF;

    -- Debit Locked (Burn)
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_finalized', p_amount, 'locked', 'debit', p_withdrawal_id, 'USDT Withdrawal Finalized', v_locked_before, v_locked_after
    );

    -- Update Account
    UPDATE ledger_accounts 
    SET locked_balance = v_locked_after
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- Fail Withdrawal (Failure: Refund Locked to Available)
-- This is similar to refund_exchange but with specific description/type if needed.
-- We can reuse refund_exchange logic but keeping it separate for clarity in logs is good.
CREATE OR REPLACE FUNCTION fail_withdrawal(
    p_user_id UUID,
    p_amount DECIMAL,
    p_withdrawal_id UUID
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
        p_user_id, 'withdrawal_failed', p_amount, 'locked', 'debit', p_withdrawal_id, 'USDT Withdrawal Failed - Unlock', v_locked_before, v_locked_after
    );

    -- Credit Available
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_failed', p_amount, 'available', 'credit', p_withdrawal_id, 'USDT Withdrawal Failed - Unlock', v_avail_before, v_avail_after
    );

    UPDATE ledger_accounts 
    SET available_balance = v_avail_after, locked_balance = v_locked_after
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
