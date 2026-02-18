-- Create exchange_orders table
CREATE TABLE IF NOT EXISTS exchange_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    usdt_amount DECIMAL(20, 6) NOT NULL,
    inr_amount DECIMAL(20, 2) NOT NULL,
    rate DECIMAL(20, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, PROCESSING, SUCCESS, FAILED, STUCK
    bank_reference VARCHAR(255), -- UTR or Bank Transaction ID
    failure_reason TEXT,
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create payout_logs table for audit
CREATE TABLE IF NOT EXISTS payout_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES exchange_orders(id),
    request_payload JSONB,
    response_payload JSONB,
    status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for queue processing
CREATE INDEX IF NOT EXISTS idx_exchange_orders_status_created_at ON exchange_orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_exchange_orders_user_id ON exchange_orders(user_id);

-- Enable RLS
ALTER TABLE exchange_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_logs ENABLE ROW LEVEL SECURITY;

-- Policies for exchange_orders
CREATE POLICY "Users can view their own exchange orders"
    ON exchange_orders FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own exchange orders"
    ON exchange_orders FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policies for payout_logs (Admin only, effectively, or system)
-- Users shouldn't see raw logs usually, but maybe for debugging? 
-- Let's restrict logs to admins or system. For now, disable public access.
-- (No policy = no access for anon/authenticated, only service_role)

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE exchange_orders;

-- RPC: Create Exchange Order (Atomic Lock + Create)
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

    -- 4. Insert Exchange Order
    INSERT INTO exchange_orders (
        user_id, usdt_amount, inr_amount, rate, idempotency_key, status
    ) VALUES (
        p_user_id, p_usdt_amount, p_inr_amount, p_rate, p_idempotency_key, 'PENDING'
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
        'Locked for Exchange Order', (SELECT locked_balance - p_usdt_amount FROM ledger_accounts WHERE user_id = p_user_id), (SELECT locked_balance FROM ledger_accounts WHERE user_id = p_user_id)
    );

    RETURN v_new_order_id;
END;
$$ LANGUAGE plpgsql;

-- RPC: Settle Exchange (Success)
CREATE OR REPLACE FUNCTION settle_exchange_order(
    p_order_id UUID,
    p_bank_reference VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
    v_order exchange_orders%ROWTYPE;
    v_locked_balance DECIMAL;
BEGIN
    -- 1. Get Order
    SELECT * INTO v_order FROM exchange_orders WHERE id = p_order_id FOR UPDATE;
    
    IF v_order.status = 'SUCCESS' THEN
        RETURN TRUE; -- Already settled
    END IF;
    
    -- 2. Update Balances (Burn Locked)
    SELECT locked_balance INTO v_locked_balance FROM ledger_accounts WHERE user_id = v_order.user_id FOR UPDATE;
    
    UPDATE ledger_accounts
    SET locked_balance = locked_balance - v_order.usdt_amount,
        settled_balance = settled_balance + v_order.usdt_amount
    WHERE user_id = v_order.user_id;
    
    -- 3. Update Order Status
    UPDATE exchange_orders
    SET status = 'SUCCESS',
        bank_reference = p_bank_reference,
        updated_at = NOW()
    WHERE id = p_order_id;
    
    -- 4. Ledger Entry
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES (
        v_order.user_id, 'exchange_success', v_order.usdt_amount, 'locked', 'debit', p_order_id, 
        'Exchange Successful - Debited Locked', v_locked_balance, v_locked_balance - v_order.usdt_amount
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- RPC: Refund Exchange (Failure)
CREATE OR REPLACE FUNCTION refund_exchange_order(
    p_order_id UUID,
    p_reason TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_order exchange_orders%ROWTYPE;
    v_available_balance DECIMAL;
    v_locked_balance DECIMAL;
BEGIN
    -- 1. Get Order
    SELECT * INTO v_order FROM exchange_orders WHERE id = p_order_id FOR UPDATE;
    
    IF v_order.status = 'FAILED' THEN
        RETURN TRUE; -- Already refunded
    END IF;
    
    -- 2. Update Balances (Locked -> Available)
    SELECT available_balance, locked_balance INTO v_available_balance, v_locked_balance 
    FROM ledger_accounts WHERE user_id = v_order.user_id FOR UPDATE;
    
    UPDATE ledger_accounts
    SET locked_balance = locked_balance - v_order.usdt_amount,
        available_balance = available_balance + v_order.usdt_amount
    WHERE user_id = v_order.user_id;
    
    -- 3. Update Order Status
    UPDATE exchange_orders
    SET status = 'FAILED',
        failure_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_order_id;
    
    -- 4. Ledger Entries
    INSERT INTO ledger_entries (
        user_id, type, amount, balance_type, direction, reference_id, description, balance_before, balance_after
    ) VALUES 
    (
        v_order.user_id, 'exchange_refund', v_order.usdt_amount, 'locked', 'debit', p_order_id, 
        'Exchange Refunded - Released Locked', v_locked_balance, v_locked_balance - v_order.usdt_amount
    ),
    (
        v_order.user_id, 'exchange_refund', v_order.usdt_amount, 'available', 'credit', p_order_id, 
        'Exchange Refunded - Credited Available', v_available_balance, v_available_balance + v_order.usdt_amount
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
