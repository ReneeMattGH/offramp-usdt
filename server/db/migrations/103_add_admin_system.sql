-- Admin Users Table
CREATE TABLE IF NOT EXISTS admins (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'superadmin', -- superadmin, support, viewer
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    admin_id UUID REFERENCES admins(id),
    action TEXT NOT NULL,
    target_type TEXT, -- 'user', 'transaction', 'system'
    target_id TEXT,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default admin if not exists (password: admin123)
INSERT INTO admins (username, password_hash, role)
SELECT 'admin', '$2b$10$n3lxESdIdSMi04ufErMSQ.bFRMPEelvntrI4ojW34Pq9sd8SHs.Ea', 'superadmin'
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE username = 'admin');
