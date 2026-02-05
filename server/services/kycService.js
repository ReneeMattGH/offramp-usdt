
const { createClient } = require('@supabase/supabase-js');
const auditService = require('./auditService');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Safe Supabase Initialization
let supabase;
try {
    if (supabaseUrl && supabaseKey) {
        supabase = createClient(supabaseUrl, supabaseKey);
    } else {
        console.warn('KYC Service: Supabase credentials missing. Running in mock/fallback mode.');
        supabase = {
            from: () => ({
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: { code: 'PGRST204', message: 'Mock Error' } }) }) }),
                update: () => ({ eq: async () => ({ error: { code: 'PGRST204', message: 'Mock Error' } }) }),
                insert: async () => ({ error: null })
            })
        };
    }
} catch (e) {
    console.error('KYC Service: Failed to initialize Supabase client:', e);
}

const LOCAL_STORE_PATH = path.join(__dirname, '../kyc_data.json');

// Helper to manage local fallback store
function getLocalStore() {
    // Disable file store in Vercel/Serverless environment to prevent read-only errors
    if (process.env.VERCEL) return {};
    
    try {
        if (!fs.existsSync(LOCAL_STORE_PATH)) return {};
        return JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, 'utf8'));
    } catch (e) {
        return {};
    }
}

function updateLocalStore(userId, status, data = {}) {
    // Disable file store in Vercel/Serverless environment
    if (process.env.VERCEL) return;

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

    async submitKyc(userId, data, ipAddress, file) {
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
        let providerResponse = { message: 'Submitted for Manual Review' };
        let documentUrl = null;

        // DEMO BYPASS: Check for specific test number
        if (aadhaar_number === '123456123456') {
            status = 'approved';
            verifiedAt = new Date().toISOString();
            providerResponse = { message: 'Demo Verification Successful', code: 'DEMO_BYPASS' };
        }

        // 2. File Upload (Supabase Storage)
        if (file) {
            try {
                const fileName = `${userId}_${Date.now()}_aadhaar.jpg`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('kyc-documents')
                    .upload(fileName, file.buffer, {
                        contentType: file.mimetype,
                        upsert: true
                    });

                if (uploadError) {
                    console.error('[KYC] File upload failed:', uploadError);
                    // Continue without file URL, or throw error?
                    // For now, log and continue, but maybe we should fail?
                    // Let's not fail the whole process, but admin won't see image.
                } else {
                    const { data: { publicUrl } } = supabase.storage
                        .from('kyc-documents')
                        .getPublicUrl(fileName);
                    documentUrl = publicUrl;
                }
            } catch (err) {
                console.error('[KYC] Storage exception:', err);
            }
        }

        // 3. Update User Table
        const { error: userError } = await supabase
            .from('users')
            .update({
                kyc_status: status,
                kyc_verified_at: verifiedAt,
                kyc_rejection_reason: rejectionReason,
                aadhaar_number: aadhaar_number, // Consider hashing/encrypting in prod
                aadhaar_photo_url: documentUrl
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
                    aadhaar_number: aadhaar_number,
                    aadhaar_photo_url: documentUrl
                 });
             } else {
                 throw userError;
             }
        } else {
            // Also sync to local store just in case
            updateLocalStore(userId, status, { 
                verified_at: verifiedAt, 
                rejection_reason: rejectionReason,
                aadhaar_photo_url: documentUrl
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
                rejection_reason: rejectionReason,
                document_url: documentUrl
            });
        } catch (err) {
            console.warn('[KYC] Failed to insert kyc_record (Table missing?):', err.message);
        }

        // 5. Audit Log
        await auditService.log('user', userId, 'KYC_SUBMIT', userId, {
            status,
            mode: this.mode,
            rejection_reason: rejectionReason,
            has_document: !!documentUrl
        }, ipAddress);

        return {
            success: true,
            status,
            message: status === 'approved' ? 'Identity Verified Successfully' : 'KYC Submitted Successfully. Waiting for Admin Approval.',
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
