-- Add status column to ledger_entries
ALTER TABLE ledger_entries 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'confirmed'; -- pending, confirmed, locked, reversed

-- RPC: Calculate Wallet Balance from Ledger History
-- Returns: { available, locked, ledger_consistent }
CREATE OR REPLACE FUNCTION get_calculated_balance(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    v_calc_available DECIMAL := 0;
    v_calc_locked DECIMAL := 0;
    v_current_available DECIMAL;
    v_current_locked DECIMAL;
BEGIN
    -- Calculate Available Balance: Sum of Credits to 'available' - Sum of Debits from 'available'
    SELECT 
        COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)
    INTO v_calc_available
    FROM ledger_entries
    WHERE user_id = p_user_id 
      AND balance_type = 'available'
      AND status = 'confirmed'; -- Only count confirmed entries

    -- Calculate Locked Balance: Sum of Credits to 'locked' - Sum of Debits from 'locked'
    -- Note: Withdrawal Lock = Credit Locked. Withdrawal Finalize = Debit Locked.
    SELECT 
        COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)
    INTO v_calc_locked
    FROM ledger_entries
    WHERE user_id = p_user_id 
      AND balance_type = 'locked';
      -- Locked entries might be 'locked' status or 'confirmed' depending on flow, 
      -- but usually we just track the movement.

    -- Get current cached balance
    SELECT available_balance, locked_balance 
    INTO v_current_available, v_current_locked
    FROM ledger_accounts
    WHERE user_id = p_user_id;

    RETURN json_build_object(
        'calculated_available', v_calc_available,
        'calculated_locked', v_calc_locked,
        'cached_available', v_current_available,
        'cached_locked', v_current_locked,
        'is_consistent', (v_calc_available = v_current_available AND v_calc_locked = v_current_locked)
    );
END;
$$ LANGUAGE plpgsql;

-- RPC: Recalculate and Fix Ledger Account Balance
CREATE OR REPLACE FUNCTION reconcile_ledger(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    v_calc_available DECIMAL := 0;
    v_calc_locked DECIMAL := 0;
BEGIN
    -- Calculate Available
    SELECT 
        COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)
    INTO v_calc_available
    FROM ledger_entries
    WHERE user_id = p_user_id 
      AND balance_type = 'available'
      AND status = 'confirmed';

    -- Calculate Locked
    SELECT 
        COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)
    INTO v_calc_locked
    FROM ledger_entries
    WHERE user_id = p_user_id 
      AND balance_type = 'locked';

    -- Update Ledger Account
    UPDATE ledger_accounts
    SET available_balance = v_calc_available,
        locked_balance = v_calc_locked,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN json_build_object('success', true, 'new_available', v_calc_available, 'new_locked', v_calc_locked);
END;
$$ LANGUAGE plpgsql;

-- Update credit_deposit to use status
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

    INSERT INTO ledger_entries (user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after, status)
    VALUES 
    (p_user_id, 'deposit', p_amount, 'available', 'credit', p_tx_hash, p_description, v_available, v_new_available, 'confirmed');

    RETURN json_build_object('success', true, 'new_balance', v_new_available);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;
