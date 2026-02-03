const { createClient } = require('@supabase/supabase-js');
const { kycStatusStore } = require('../utils/mockStore');
const kycService = require('../services/kycService');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // Fallback: Check if user_id is provided in body (LEGACY SUPPORT - REMOVE SOON)
        // For now, we allow it but log a warning, OR we enforce strict auth.
        // The user said "Update auth middleware... On every protected request".
        // If I enforce it now, the frontend will break until I update it.
        // I will implement strict auth and update frontend immediately after.
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // 1. Verify Session
        let session = null;
        try {
            const { data, error: sessionError } = await supabase
                .from('sessions')
                .select('user_id')
                .eq('token', token)
                .gt('expires_at', new Date().toISOString())
                .single();
            
            if (sessionError) throw sessionError;
            session = data;
        } catch (e) {
            return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
        }

        if (!session) {
            return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
        }

        // 2. Fetch User with KYC Status
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*') // Fetch all fields for context
            .eq('id', session.user_id)
            .single();

        if (userError || !user) {
            return res.status(401).json({ error: 'Unauthorized: User not found' });
        }

        // 3. Attach User to Request
        req.user = user;

        // ENRICHMENT: If kyc_status is missing (schema issue), fetch from kycService fallback
        if (!req.user.kyc_status) {
            try {
                const kycData = await kycService.getKycStatus(user.id);
                if (kycData && kycData.kyc_status) {
                    req.user.kyc_status = kycData.kyc_status;
                    req.user.kyc_verified_at = kycData.kyc_verified_at;
                    req.user.kyc_rejection_reason = kycData.kyc_rejection_reason;
                }
            } catch (e) {
                console.warn('Auth Middleware: Failed to fetch fallback KYC status', e.message);
            }
        }

        next();

    } catch (err) {
        console.error('Auth Middleware Error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

function requireKycApproved(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.user.kyc_status !== 'approved' && req.user.kyc_status !== undefined) {
        return res.status(403).json({ 
            error: 'KYC_REQUIRED', 
            message: 'Your account is not verified. Please complete KYC.',
            current_status: req.user.kyc_status 
        });
    }

    next();
}

module.exports = { authMiddleware, requireKycApproved };
