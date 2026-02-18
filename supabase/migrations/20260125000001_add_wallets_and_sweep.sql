-- Create wallets table for system and treasury wallets
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL UNIQUE, -- 'system', 'treasury', 'safe_hold'
    address VARCHAR(255) NOT NULL,
    private_key_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add sweep_tx_hash to blockchain_transactions
ALTER TABLE blockchain_transactions 
ADD COLUMN IF NOT EXISTS sweep_tx_hash VARCHAR(255);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_deposit_addresses_is_used ON deposit_addresses(is_used);
CREATE INDEX IF NOT EXISTS idx_deposit_addresses_expires_at ON deposit_addresses(expires_at);
