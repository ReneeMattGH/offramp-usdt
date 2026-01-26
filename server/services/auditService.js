
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

class AuditService {
    /**
     * Log an action to the audit_logs table
     * @param {string} actorType - 'user', 'admin', 'system'
     * @param {string} actorId - UUID of the actor (optional for system)
     * @param {string} action - Action name (e.g. 'KYC_SUBMIT', 'EXCHANGE_ORDER')
     * @param {string} referenceId - Related ID (e.g. order_id, user_id)
     * @param {object} metadata - Additional details
     * @param {string} ipAddress - IP address of the request
     */
    async log(actorType, actorId, action, referenceId, metadata = {}, ipAddress = null) {
        try {
            // Mask sensitive data in metadata if exists
            const sanitizedMetadata = this._sanitize(metadata);

            const { error } = await supabase
                .from('audit_logs')
                .insert({
                    actor_type: actorType,
                    actor_id: actorId,
                    action: action,
                    reference_id: referenceId,
                    metadata: sanitizedMetadata,
                    ip_address: ipAddress,
                    created_at: new Date().toISOString()
                });

            if (error) {
                // If table doesn't exist yet (migration pending), just log to console
                if (error.code === 'PGRST205' || error.message?.includes('relation')) {
                    console.log(`[AUDIT] (Table Missing) ${action}:`, sanitizedMetadata);
                } else {
                    console.error('[AUDIT] Failed to log:', error);
                }
            } else {
                console.log(`[AUDIT] ${action} logged.`);
            }
        } catch (err) {
            console.error('[AUDIT] Unexpected error:', err.message);
        }
    }

    _sanitize(data) {
        if (!data) return {};
        const copy = JSON.parse(JSON.stringify(data));
        const sensitiveKeys = ['password', 'token', 'secret', 'aadhaar_number', 'pan_number'];
        
        const mask = (obj) => {
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
    }
}

module.exports = new AuditService();
