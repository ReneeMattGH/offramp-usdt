export declare class AuditService {
    private static instance;
    private constructor();
    static getInstance(): AuditService;
    log(actorType: 'user' | 'admin' | 'system', actorId: string, action: string, referenceId: string | null, metadata?: any, ipAddress?: string | null): Promise<void>;
    private _sanitize;
}
export declare const auditService: AuditService;
