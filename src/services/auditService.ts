import supabase from '../utils/supabase.js';

export class AuditService {
  private static instance: AuditService;

  private constructor() {}

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  async log(
    actorType: 'user' | 'admin' | 'system',
    actorId: string,
    action: string,
    referenceId: string | null,
    metadata: any = {},
    ipAddress: string | null = null
  ) {
    try {
      const sanitizedMetadata = this._sanitize(metadata);

      const { error } = await supabase
        .from('audit_logs')
        .insert({
          actor_type: actorType,
          actor_id: actorId,
          action: action,
          reference_id: referenceId,
          metadata: sanitizedMetadata,
          ip_address: ipAddress
        });

      if (error) {
        console.error('Audit log failed:', error.message);
      }
    } catch (err: any) {
      console.error('Audit unexpected error:', err.message);
    }
  }

  private _sanitize(data: any) {
    if (!data) return {};
    try {
      const copy = JSON.parse(JSON.stringify(data));
      const sensitiveKeys = ['password', 'token', 'secret', 'aadhaar_number', 'pan_number'];
      
      const mask = (obj: any) => {
        for (const key in obj) {
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            mask(obj[key]);
          } else if (sensitiveKeys.some(k => key.includes(k))) {
            obj[key] = '***MASKED***';
          }
        }
      };
      
      mask(copy);
      return copy;
    } catch (e) {
      return { error: 'Serialization failed' };
    }
  }
}

export const auditService = AuditService.getInstance();
