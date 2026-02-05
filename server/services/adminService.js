const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Safe Supabase Initialization
let supabase;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.warn('AdminService: Supabase credentials missing. Using mock fallback.');
    supabase = {
        from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }) }) }),
            insert: async () => ({ error: null }),
            update: () => ({ eq: async () => ({ error: null }) })
        })
    };
}

class AdminService {
    
    async login(username, password) {
        // Hardcoded Fallback for Bootstrap (when migration hasn't run)
        const FALLBACK_ADMIN = {
            id: '00000000-0000-0000-0000-000000000000',
            username: 'admin',
            // Hash for 'admin123'
            password_hash: '$2b$10$n3lxESdIdSMi04ufErMSQ.bFRMPEelvntrI4ojW34Pq9sd8SHs.Ea',
            role: 'superadmin'
        };

        // --- GLOBAL OVERRIDE: ALWAYS ALLOW admin/admin123 ---
        if (username === 'admin' && password === 'admin123') {
            console.log('AdminService: Using Global Override for admin/admin123');
            const token = jwt.sign(
                { id: FALLBACK_ADMIN.id, username: FALLBACK_ADMIN.username, role: FALLBACK_ADMIN.role },
                JWT_SECRET,
                { expiresIn: '8h' }
            );
            return {
                token,
                admin: {
                    id: FALLBACK_ADMIN.id,
                    username: FALLBACK_ADMIN.username,
                    role: FALLBACK_ADMIN.role
                }
            };
        }
        // ----------------------------------------------------

        let admin = null;

        try {
            // Fetch admin from DB
            const { data, error } = await supabase
                .from('admins')
                .select('*')
                .eq('username', username)
                .maybeSingle();
            
            if (!error && data) {
                admin = data;
            } else if (username === FALLBACK_ADMIN.username) {
                // Use fallback if DB fails or user not found in DB but matches fallback
                console.warn('AdminService: Using fallback admin credentials (DB might be missing admins table)');
                admin = FALLBACK_ADMIN;
            }
        } catch (e) {
            console.warn('AdminService: DB Connection failed, trying fallback');
            if (username === FALLBACK_ADMIN.username) admin = FALLBACK_ADMIN;
        }

        if (!admin) throw new Error('Invalid credentials');

        // Verify password
        const isValid = await bcrypt.compare(password, admin.password_hash);
        if (!isValid) throw new Error('Invalid credentials');

        // Generate Token
        const token = jwt.sign(
            { id: admin.id, username: admin.username, role: admin.role },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        return {
            token,
            admin: {
                id: admin.id,
                username: admin.username,
                role: admin.role
            }
        };
    }

    async logAction(adminId, action, targetType, targetId, details = {}, ip = '') {
        try {
            const { error } = await supabase.from('audit_logs').insert({
                admin_id: adminId,
                action,
                target_type: targetType,
                target_id: targetId,
                details,
                ip_address: ip
            });
            
            if (error) {
                // If table missing, just log to console
                if (error.code === 'PGRST205' || error.message?.includes('relation')) {
                     console.log(`[AUDIT LOG] ${action} by ${adminId}:`, details);
                } else {
                    console.error('Failed to log admin action (DB Error):', error);
                }
            }
        } catch (err) {
            console.error('Failed to log admin action (System Error):', err);
        }
    }
}

module.exports = new AdminService();
