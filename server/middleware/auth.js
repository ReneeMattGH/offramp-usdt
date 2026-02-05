const { createClient } = require('@supabase/supabase-js');
const { kycStatusStore, sessionStore } = require('../utils/mockStore');
const kycService = require('../services/kycService');
require('dotenv').config();

// Safe Supabase Initialization
let supabase;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
} else {
    console.warn('Auth Middleware: Supabase credentials missing. Using mock fallback.');
    supabase = {
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: null, error: { code: 'MISSING_CREDS', message: 'Credentials missing' } })
                })
            })
        })
    };
}

async function authMiddleware(req, res, next) {
    try {
        // BYPASS AUTHENTICATION: Always use the Demo User
        const demoAccountNumber = 'DEMO_USER_001';
        
        let user = null;
        
        // Try to fetch existing demo user to preserve KYC status
        const { data: dbUser, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('account_number', demoAccountNumber)
            .maybeSingle();

        if (dbUser) {
            user = dbUser;
        } else {
            // Fallback if DB is empty or connection fails
            user = {
                id: 'mock-user-id',
                account_number: demoAccountNumber,
                account_holder_name: 'Guest User',
                kyc_status: 'not_submitted',
                email: 'guest@example.com'
            };
        }

        // Attach User to Request
        req.user = user;

        // ENRICHMENT: Fetch fresh KYC status from service if possible
        if (req.user.id) {
            try {
                const kycData = await kycService.getKycStatus(req.user.id);
                if (kycData && kycData.kyc_status) {
                    req.user.kyc_status = kycData.kyc_status;
                    req.user.kyc_verified_at = kycData.kyc_verified_at;
                    req.user.kyc_rejection_reason = kycData.kyc_rejection_reason;
                }
            } catch (e) {
                // Ignore errors here
            }
        }

        next();

    } catch (err) {
        console.error('Auth Middleware Error:', err);
        // Fallback to basic user to prevent app crash
        req.user = {
            id: 'mock-user-id',
            account_number: 'DEMO_USER_001',
            account_holder_name: 'Guest User',
            kyc_status: 'not_submitted'
        };
        next();
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
