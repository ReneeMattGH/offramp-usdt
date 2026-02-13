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
    let { aadhaar_number, full_name, dob } = data;

    if (aadhaar_number) {
      aadhaar_number = aadhaar_number.toString().replace(/\D/g, '');
    }

    if (!aadhaar_number || !/^\d{12}$/.test(aadhaar_number)) {
      throw new Error('Invalid Aadhaar number');
    }

    let status = 'pending';
    let verifiedAt = null;
    let documentUrl = null;

    if (file) {
      try {
        const fileName = `${userId}_${Date.now()}_aadhaar.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('kyc-documents')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: true
          });

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('kyc-documents')
            .getPublicUrl(fileName);
          documentUrl = publicUrl;
        }
      } catch (err: any) {
        console.error('KYC upload failed:', err.message);
      }
    }

    const { error: userError } = await supabase
      .from('users')
      .update({
        kyc_status: status,
        kyc_verified_at: verifiedAt,
        aadhaar_number: aadhaar_number,
        aadhaar_photo_url: documentUrl
      })
      .eq('id', userId);

    if (userError) throw userError;

    const maskedAadhaar = 'XXXXXXXX' + aadhaar_number.slice(-4);
    
    await supabase.from('kyc_records').insert({
      user_id: userId,
      aadhaar_number_masked: maskedAadhaar,
      full_name,
      dob,
      status,
      provider: this.mode,
      document_url: documentUrl
    });

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
}

export const kycService = KycService.getInstance();
