const jwt = require('jsonwebtoken');
const supabase = require('../utils/supabase');
const config = require('../config');
const JWT_SECRET = config.JWT_SECRET;

async function adminAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const { data: admin, error } = await supabase
            .from('admins')
            .select('id, username, role')
            .eq('id', decoded.id)
            .maybeSingle();

        if (error || !admin) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        req.admin = admin;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid session' });
    }
}

module.exports = adminAuth;
