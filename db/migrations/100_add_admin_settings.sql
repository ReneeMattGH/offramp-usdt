
-- 1. Create System Settings Table (Singleton)
CREATE TABLE IF NOT EXISTS system_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    min_usdt_withdrawal DECIMAL(20, 2) DEFAULT 20.0,
    usdt_withdrawal_fee DECIMAL(20, 2) DEFAULT 5.0,
    daily_withdrawal_limit DECIMAL(20, 2) DEFAULT 100000.0,
    exchange_spread_percent DECIMAL(5, 2) DEFAULT 1.0, -- 1.0%
    withdrawals_enabled BOOLEAN DEFAULT TRUE,
    deposits_enabled BOOLEAN DEFAULT TRUE,
    exchanges_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2. Add Ban Status to Users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;

-- 3. Add Updated At Trigger for Settings
DROP TRIGGER IF EXISTS update_system_settings_updated_at ON system_settings;
CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
