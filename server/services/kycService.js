
const { createClient } = require('@supabase/supabase-js');
const auditService = require('./auditService');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const LOCAL_STORE_PATH = path.join(__dirname, '../kyc_data.json');

// Helper to manage local fallback store
function getLocalStore() {
    try {
        if (!fs.existsSync(LOCAL_STORE_PATH)) return {};
        return JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, 'utf8'));
    } catch (e) {
        return {};
    }
}

function updateLocalStore(userId, status, data = {}) {
    try {
        const store = getLocalStore();
        store[userId] = { 
            status, 
            updated_at: new Date().toISOString(),
            ...data
        };
        fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(store, null, 2));
    } catch (e) {
        console.error('Failed to update local store:', e);
    }
}

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
        
        // DEMO MODE: Auto-approve specific numbers
        const DEMO_NUMBERS = ['123456789012', '999988887777'];
        
        if (DEMO_NUMBERS.includes(aadhaar_number)) {
            status = 'approved';
            verifiedAt = new Date().toISOString();
            console.log(`[KYC] Demo Number ${aadhaar_number} Auto-Approved`);
            providerResponse = { message: 'Demo Auto-Approval', demo: true };
        } else {
            // For now, we store it as 'pending' for Manual Review or Webhook update.
            console.log(`[KYC] KYC Submitted for ${aadhaar_number}. Status: PENDING (Waiting for Review/Provider)`);
            providerResponse = { message: 'Submitted for Verification' };
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
             console.error('[KYC] Database update failed:', userError.message);
             // FALLBACK: If column missing, use local store
             if (userError.code === 'PGRST204' || userError.message.includes('column')) {
                 console.warn('[KYC] Falling back to local JSON store due to schema mismatch');
                 updateLocalStore(userId, status, { 
                    verified_at: verifiedAt, 
                    rejection_reason: rejectionReason,
                    aadhaar_number: aadhaar_number
                 });
             } else {
                 throw userError;
             }
        } else {
            // Also sync to local store just in case
            updateLocalStore(userId, status, { 
                verified_at: verifiedAt, 
                rejection_reason: rejectionReason
            });
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
        // Try to read from local store first (as fallback priority if schema is broken)
        const localData = getLocalStore()[userId];
        
        try {
            const { data, error } = await supabase
                .from('users')
                .select('kyc_status, kyc_verified_at, kyc_rejection_reason')
                .eq('id', userId)
                .single();
            
            if (error) {
                if (error.code === 'PGRST204' || error.message.includes('column')) {
                    // Return local data if DB fails
                    if (localData) {
                        return {
                            kyc_status: localData.status,
                            kyc_verified_at: localData.updated_at,
                            kyc_rejection_reason: localData.rejection_reason
                        };
                    }
                    return { kyc_status: 'not_submitted' };
                }
                throw error;
            }
            return data;
        } catch (e) {
             if (localData) {
                return {
                    kyc_status: localData.status,
                    kyc_verified_at: localData.updated_at,
                    kyc_rejection_reason: localData.rejection_reason
                };
            }
            // If genuinely no data and error is about columns, return default
            if (e.message && e.message.includes('column')) return { kyc_status: 'not_submitted' };
            throw e;
        }
    }
}

module.exports = new KycService();
