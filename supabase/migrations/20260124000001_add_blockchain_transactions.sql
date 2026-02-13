-- Create blockchain_transactions table if not exists
CREATE TABLE IF NOT EXISTS blockchain_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tx_hash VARCHAR(255) UNIQUE NOT NULL,
    network VARCHAR(50) DEFAULT 'tron_mainnet',
    from_address VARCHAR(255) NOT NULL,
    to_address VARCHAR(255) NOT NULL,
    token_symbol VARCHAR(50) DEFAULT 'USDT',
    amount DECIMAL(20, 6) NOT NULL,
    block_number BIGINT,
    status VARCHAR(50) DEFAULT 'detected', -- detected, validated, credited, ignored
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure deposit_addresses table exists (it should, but just in case)
CREATE TABLE IF NOT EXISTS deposit_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    tron_address VARCHAR(255) NOT NULL,
    private_key_encrypted TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
