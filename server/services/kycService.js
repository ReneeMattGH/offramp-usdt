
const { createClient } = require('@supabase/supabase-js');
const auditService = require('./auditService');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

class KycService {
    constructor() {
        this.mode = process.env.KYC_MODE || 'MANUAL'; // Default to Manual Review
    }

    async submitKyc(userId, data, ipAddress) {
        let { aadhaar_number, full_name, dob } = data;

        // SANITIZATION: Remove any non-digits (spaces, dashes, etc.)
        if (aadhaar_number) {
            aadhaar_number = aadhaar_number.toString().replace(/\D/g, '');
        }

        // 1. Validation
        if (!aadhaar_number || !/^\d{12}$/.test(aadhaar_number)) {
            throw new Error(`Invalid Aadhaar Number (Must be 12 digits). Received: ${aadhaar_number}`);
        }

        let status = 'pending';
        let verifiedAt = null;
        let rejectionReason = null;
        let providerResponse = {};

        // 2. Verification Logic
        // In a real system, we would call an external API here (e.g. Zoop, Karza)
        // For now, we store it as 'pending' for Manual Review or Webhook update.
        console.log(`[KYC] KYC Submitted for ${aadhaar_number}. Status: PENDING (Waiting for Review/Provider)`);
        providerResponse = { message: 'Submitted for Verification' };

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
             console.error('[KYC] Database update failed:', userError);
             throw userError;
        }
        
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
