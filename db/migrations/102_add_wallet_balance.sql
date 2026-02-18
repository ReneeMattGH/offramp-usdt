
-- Add balance column to wallets if it doesn't exist
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS balance DECIMAL(20, 6) DEFAULT 0;

-- Create Payout Attempts table if we decide to use it separately, 
-- but for now we are using audit_logs. 
-- However, if the code references it, we might as well define it or migrate away.
-- The code in index.js referenced it, but we are changing index.js to use audit_logs.
-- So we strictly just need the balance column here.
