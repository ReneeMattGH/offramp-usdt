import supabase from '../utils/supabase.js';
import config from '../config/index.js';
import { auditService } from './auditService.js';

export class KycService {
  private static instance: KycService;
  private mode: string;

  private constructor() {
    this.mode = config.kycMode;
  }

  public static getInstance(): KycService {
    if (!KycService.instance) {
      KycService.instance = new KycService();
    }
    return KycService.instance;
  }

  async submitKyc(userId: string, data: any, ipAddress: string | null, file?: any) {
    let { aadhaar_number, full_name, dob, phone_number } = data;

    if (aadhaar_number) {
      aadhaar_number = aadhaar_number.toString().replace(/\D/g, '');
    }

    if (!aadhaar_number || !/^\d{12}$/.test(aadhaar_number)) {
      throw new Error('Invalid Aadhaar number. Must be 12 digits.');
    }

    // Convert DD-MM-YYYY to YYYY-MM-DD for database compatibility if needed
    let formattedDob = dob;
    if (dob && dob.includes('-')) {
      const parts = dob.split('-');
      if (parts[0].length === 2) {
        // parts are 0:DD, 1:MM, 2:YYYY -> convert to YYYY-MM-DD
        formattedDob = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    let status = 'pending';
    let documentUrl = null;

    if (file) {
      try {
        const fileName = `${userId}_${Date.now()}_aadhaar.jpg`;
        console.log(`[KYC_SERVICE] Attempting upload to KYC-DOCUMENTS bucket: ${fileName}`);
        
        const { error: uploadError } = await supabase.storage
          .from('KYC-DOCUMENTS')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600',
            upsert: true
          });

        if (uploadError) {
          console.error('[KYC_SERVICE] Supabase Storage Upload Error:', uploadError);
          throw new Error(`Document upload failed: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('KYC-DOCUMENTS')
          .getPublicUrl(fileName);
          
        if (!publicUrl) {
          console.error('[KYC_SERVICE] Failed to generate public URL for:', fileName);
          throw new Error('Failed to generate document link');
        }

        documentUrl = publicUrl;
        console.log(`[KYC_SERVICE] Document uploaded successfully: ${documentUrl}`);
      } catch (err: any) {
        console.error('[KYC_SERVICE] KYC upload exception:', err);
        throw err; // Re-throw to catch it in the controller
      }
    }

    // 3. Update public.users table
    const { error: userError } = await supabase
      .from('users')
      .update({
        kyc_status: status,
        aadhaar_number: aadhaar_number,
        aadhaar_photo_url: documentUrl,
        account_holder_name: full_name, // Mapping full_name here
        phone: phone_number, // Added phone_number storage
        phone_number: phone_number,
        kyc_provider: 'manual',
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (userError) {
      console.error('[KYC_SERVICE] User update error:', userError);
      throw userError;
    }

    // 4. Insert into kyc_records
    const maskedAadhaar = 'XXXXXXXX' + aadhaar_number.slice(-4);
    const { error: recordError } = await supabase.from('kyc_records').insert({
      user_id: userId,
      aadhaar_number_masked: maskedAadhaar,
      full_name: full_name,
      status: status,
      document_url: documentUrl,
      submitted_at: new Date().toISOString()
    });

    if (recordError) {
      console.error('[KYC_SERVICE] KYC record insert error:', recordError);
      throw recordError;
    }

    await auditService.log('user', userId, 'KYC_SUBMIT', userId, {
      status,
      mode: this.mode,
      has_document: !!documentUrl
    }, ipAddress);

    return {
      success: true,
      status,
      message: 'KYC submitted successfully'
    };
  }

  async getKycStatus(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('kyc_status, kyc_verified_at, kyc_rejection_reason')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return data;
  }

  async resetKyc(userId: string, ipAddress: string | null) {
    // 1. Update users table, clearing all KYC related fields
    const { error: userError } = await supabase
      .from('users')
      .update({
        kyc_status: 'not_submitted', // Use 'not_submitted' for enum compatibility
        aadhaar_number: null,
        aadhaar_photo_url: null,
        phone: null,
        phone_number: null,
        kyc_verified_at: null,
        kyc_rejection_reason: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (userError) {
      console.error('[KYC_SERVICE] User reset error:', userError);
      throw userError;
    }

    // 2. Delete existing records from kyc_records
    const { error: deleteError } = await supabase
      .from('kyc_records')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('[KYC_SERVICE] KYC record delete error:', deleteError);
      throw deleteError;
    }

    // 3. Log the audit
    await auditService.log('user', userId, 'KYC_RESET', userId, {
      message: 'User started over KYC process'
    }, ipAddress);

    return {
      success: true,
      message: 'KYC data cleared successfully'
    };
  }
}

export const kycService = KycService.getInstance();
