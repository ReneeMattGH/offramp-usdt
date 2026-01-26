
const { createClient } = require('@supabase/supabase-js');
const auditService = require('./auditService');
const { kycStatusStore } = require('../utils/mockStore');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

class KycService {
    constructor() {
        this.mode = process.env.KYC_MODE || 'DUMMY';
        this.dummyApprovedAadhaars = ['123456789012', '999988887777'];
    }

    async submitKyc(userId, data, ipAddress) {
        const { aadhaar_number, full_name, dob } = data;

        // 1. Validation
        if (!/^\d{12}$/.test(aadhaar_number)) {
            throw new Error('Invalid Aadhaar Number (Must be 12 digits)');
        }

        let status = 'pending';
        let verifiedAt = null;
        let rejectionReason = null;
        let providerResponse = {};

        // 2. Verification Logic
        if (this.mode === 'DUMMY') {
            console.log(`[KYC] Running DUMMY verification for ${aadhaar_number}`);
            if (this.dummyApprovedAadhaars.includes(aadhaar_number)) {
                status = 'approved';
                verifiedAt = new Date().toISOString();
                providerResponse = { message: 'Dummy Auto-Approval' };
            } else {
                status = 'rejected';
                rejectionReason = 'Identity could not be verified (Dummy Check Failed)';
                providerResponse = { message: 'Dummy Auto-Rejection' };
            }
        } else {
            // TODO: Implement Real Provider (e.g. Zoop/Karza)
            throw new Error('Real KYC Provider not configured yet');
        }

        // 3. Update User Table
        const { error: userError } = await supabase
            .from('users')
            .update({
                kyc_status: status,
                kyc_verified_at: verifiedAt,
                kyc_rejection_reason: rejectionReason,
                aadhaar_number: aadhaar_number // Consider hashing/encrypting in prod
            })
            .eq('id', userId);

        if (userError) {
            // FALLBACK: If columns are missing (migrations not run), log warning but allow flow to continue for DEMO
            if (userError.code === '42703' || userError.message?.includes('column')) {
                 console.warn('[KYC] Database schema mismatch (missing columns). KYC status NOT persisted.');
                 // MOCK STORE UPDATE FOR DEV/DEMO
                 kycStatusStore[userId] = status;
                 console.log(`[KYC] Mock Store Updated: User ${userId} -> ${status}`);
            } else {
                 throw userError;
            }
        }
        
        // Also update mock store on success to be safe/consistent
        kycStatusStore[userId] = status;

        // 4. Create KYC Record (Audit Trail)
        // Mask Aadhaar: XXXXXXXX1234
        const maskedAadhaar = 'XXXXXXXX' + aadhaar_number.slice(-4);
        
        try {
            await supabase.from('kyc_records').insert({
                user_id: userId,
                aadhaar_number_masked: maskedAadhaar,
                full_name: full_name,
                dob: dob,
                status: status,
                provider: this.mode,
                raw_response: providerResponse,
                verified_at: verifiedAt,
                rejection_reason: rejectionReason
            });
        } catch (err) {
            console.warn('[KYC] Failed to insert kyc_record (Table missing?):', err.message);
        }

        // 5. Audit Log
        await auditService.log('user', userId, 'KYC_SUBMIT', userId, {
            status,
            mode: this.mode,
            rejection_reason: rejectionReason
        }, ipAddress);

        return {
            success: true,
            status,
            message: status === 'approved' ? 'KYC Verified Successfully' : 'KYC Verification Failed',
            reason: rejectionReason
        };
    }

    async getKycStatus(userId) {
        const { data, error } = await supabase
            .from('users')
            .select('kyc_status, kyc_verified_at, kyc_rejection_reason')
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        return data;
    }
}

module.exports = new KycService();
