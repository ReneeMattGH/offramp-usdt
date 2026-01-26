-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Wallets (System & Safe Hold)
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('system', 'safe_hold', 'deposit')),
    address VARCHAR(255) NOT NULL UNIQUE,
    private_key_encrypted TEXT NOT NULL,
    balance DECIMAL(20, 6) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Ledger Accounts (Real-time User Balances)
CREATE TABLE IF NOT EXISTS ledger_accounts (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    available_balance DECIMAL(20, 6) DEFAULT 0 CHECK (available_balance >= 0),
    locked_balance DECIMAL(20, 6) DEFAULT 0 CHECK (locked_balance >= 0),
    settled_balance DECIMAL(20, 6) DEFAULT 0 CHECK (settled_balance >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Ledger Entries (Append-Only History)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    type VARCHAR(50) NOT NULL CHECK (type IN ('deposit', 'withdrawal_lock', 'withdrawal_settle', 'withdrawal_refund', 'admin_adjustment')),
    amount DECIMAL(20, 6) NOT NULL,
    balance_type VARCHAR(50) NOT NULL CHECK (balance_type IN ('available', 'locked', 'settled')),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('credit', 'debit')),
    reference_id UUID, -- Link to transaction_id or withdrawal_id
    description TEXT,
    balance_before DECIMAL(20, 6) NOT NULL,
    balance_after DECIMAL(20, 6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Blockchain Transactions (Raw On-Chain Data)
CREATE TABLE IF NOT EXISTS blockchain_transactions (
    tx_hash VARCHAR(255) PRIMARY KEY,
    network VARCHAR(50) DEFAULT 'tron_nile',
    from_address VARCHAR(255) NOT NULL,
    to_address VARCHAR(255) NOT NULL,
    token VARCHAR(50) DEFAULT 'USDT',
    amount DECIMAL(20, 6) NOT NULL,
    block_number BIGINT,
    status VARCHAR(50) DEFAULT 'confirmed', -- confirmed, failed
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(255) NOT NULL,
    admin_id UUID, -- Nullable if system action
    target_id UUID,
    target_type VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Update Withdrawals Table for Exchange Flow
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(20, 6);
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS usdt_amount DECIMAL(20, 6);
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255); -- For the payout TX

-- 7. Triggers for Updated At
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_wallets_updated_at ON wallets;
CREATE TRIGGER update_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ledger_accounts_updated_at ON ledger_accounts;
CREATE TRIGGER update_ledger_accounts_updated_at
    BEFORE UPDATE ON ledger_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
