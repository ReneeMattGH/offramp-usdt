const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Safe Supabase Initialization
let supabase;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    // Mock fallback for middleware to prevent crash
    supabase = {
        from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
        })
    };
}

async function adminAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }

        const token = authHeader.split(' ')[1];
        
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // Hardcoded Fallback Admin ID check
            if (decoded.id === '00000000-0000-0000-0000-000000000000') {
                req.admin = decoded;
                return next();
            }

            // Verify admin still exists in DB
            const { data: admin, error } = await supabase
                .from('admins')
                .select('id, username, role')
                .eq('id', decoded.id)
                .maybeSingle();

            if (error || !admin) {
                return res.status(401).json({ error: 'Unauthorized: Admin not found' });
            }

            req.admin = admin;
            next();
        } catch (err) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

    } catch (err) {
        console.error('Admin Auth Middleware Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

module.exports = adminAuth;
