
-- Fix for ledger_entries and RPC functions to support string reference IDs (e.g. Tron transaction hashes)

-- 1. Alter ledger_entries table
ALTER TABLE public.ledger_entries ALTER COLUMN reference_id TYPE TEXT;

-- 2. Update credit_deposit function
CREATE OR REPLACE FUNCTION public.credit_deposit(
    p_user_id UUID,
    p_amount DECIMAL,
    p_tx_hash TEXT,
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
    INSERT INTO public.ledger_accounts (user_id, available_balance, locked_balance, settled_balance)
    VALUES (p_user_id, 0, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    -- Lock row and get current balance
    SELECT available_balance INTO v_balance_before 
    FROM public.ledger_accounts WHERE user_id = p_user_id FOR UPDATE;

    IF v_balance_before IS NULL THEN
        v_balance_before := 0;
    END IF;

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

-- 3. Update lock_funds function
CREATE OR REPLACE FUNCTION public.lock_funds(
    p_user_id UUID,
    p_amount DECIMAL,
    p_ref_id TEXT,
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

-- 6. Update finalize_withdrawal function
CREATE OR REPLACE FUNCTION public.finalize_withdrawal(
    p_user_id UUID,
    p_amount DECIMAL,
    p_withdrawal_id TEXT
) RETURNS JSONB AS $$
DECLARE
    v_locked_before DECIMAL;
    v_locked_after DECIMAL;
BEGIN
    -- Lock row
    SELECT locked_balance INTO v_locked_before
    FROM public.ledger_accounts WHERE user_id = p_user_id FOR UPDATE;

    v_locked_after := v_locked_before - p_amount;

    IF v_locked_after < 0 THEN
        RAISE EXCEPTION 'Negative locked balance detected';
    END IF;

    -- Debit Locked (Burn)
    INSERT INTO public.ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_finalized', p_amount, 'locked', 'debit', p_withdrawal_id, 'USDT Withdrawal Finalized', v_locked_before, v_locked_after
    );

    -- Update Account
    UPDATE public.ledger_accounts 
    SET locked_balance = v_locked_after
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- 7. Update fail_withdrawal function
CREATE OR REPLACE FUNCTION public.fail_withdrawal(
    p_user_id UUID,
    p_amount DECIMAL,
    p_withdrawal_id TEXT
) RETURNS JSONB AS $$
DECLARE
    v_avail_before DECIMAL;
    v_avail_after DECIMAL;
    v_locked_before DECIMAL;
    v_locked_after DECIMAL;
BEGIN
    SELECT available_balance, locked_balance INTO v_avail_before, v_locked_before
    FROM public.ledger_accounts WHERE user_id = p_user_id FOR UPDATE;

    v_locked_after := v_locked_before - p_amount;
    v_avail_after := v_avail_before + p_amount;

    -- Debit Locked
    INSERT INTO public.ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_failed', p_amount, 'locked', 'debit', p_withdrawal_id, 'USDT Withdrawal Failed - Unlock', v_locked_before, v_locked_after
    );

    -- Credit Available
    INSERT INTO public.ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        p_user_id, 'withdrawal_failed', p_amount, 'available', 'credit', p_withdrawal_id, 'USDT Withdrawal Failed - Unlock', v_avail_before, v_avail_after
    );

    UPDATE public.ledger_accounts 
    SET available_balance = v_avail_after, locked_balance = v_locked_after
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- 4. Update settle_exchange function
CREATE OR REPLACE FUNCTION public.settle_exchange(
    p_user_id UUID,
    p_amount DECIMAL,
    p_ref_id TEXT
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

-- 5. Update refund_exchange function
CREATE OR REPLACE FUNCTION public.refund_exchange(
    p_user_id UUID,
    p_amount DECIMAL,
    p_ref_id TEXT
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
