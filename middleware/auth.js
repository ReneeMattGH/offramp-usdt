const supabase = require('../utils/supabase');
const jwt = require('jsonwebtoken');
const config = require('../config');

const JWT_SECRET = config.JWT_SECRET;

async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', decoded.id)
            .single();
        
        if (error || !user) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid session' });
    }
}

function requireKycApproved(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.user.kyc_status !== 'approved') {
        return res.status(403).json({ 
            error: 'KYC_REQUIRED', 
            message: 'KYC verification required'
        });
    }

    next();
}

module.exports = { authMiddleware, requireKycApproved };
