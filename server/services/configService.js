const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

class ConfigService {
    constructor() {
        this.config = {
            min_usdt_withdrawal: 20.0,
            usdt_withdrawal_fee: 5.0,
            daily_withdrawal_limit: 100000.0,
            exchange_spread_percent: 1.0,
            withdrawals_enabled: true,
            deposits_enabled: true,
            exchanges_enabled: true
        };
        this.isLoaded = false;
    }

    async loadConfig() {
        try {
            console.log('Loading System Config...');
            const { data, error } = await supabase
                .from('system_settings')
                .select('*')
                .eq('id', 1)
                .single();

            if (error) {
                // If table doesn't exist yet (before migration), keep defaults
                if (error.code === 'PGRST205' || error.message.includes('relation')) {
                    console.warn('ConfigService: system_settings table missing. Using defaults.');
                    return;
                }
                throw error;
            }

            if (data) {
                this.config = { ...this.config, ...data };
                this.isLoaded = true;
                console.log('System Config Loaded:', this.config);
            }
        } catch (error) {
            console.error('ConfigService Load Error:', error);
        }
    }

    get(key) {
        return this.config[key];
    }

    getAll() {
        return { ...this.config };
    }

    async update(updates) {
        try {
            const allowedKeys = [
                'min_usdt_withdrawal', 
                'usdt_withdrawal_fee', 
                'daily_withdrawal_limit', 
                'exchange_spread_percent',
                'withdrawals_enabled', 
                'deposits_enabled', 
                'exchanges_enabled'
            ];

            const cleanUpdates = {};
            for (const key of Object.keys(updates)) {
                if (allowedKeys.includes(key)) {
                    cleanUpdates[key] = updates[key];
                }
            }

            if (Object.keys(cleanUpdates).length === 0) return { success: false, error: 'No valid fields' };

            const { data, error } = await supabase
                .from('system_settings')
                .update(cleanUpdates)
                .eq('id', 1)
                .select()
                .single();

            if (error) throw error;

            this.config = { ...this.config, ...data };
            return { success: true, config: this.config };

        } catch (error) {
            console.error('ConfigService Update Error:', error);
            throw error;
        }
    }
}

module.exports = new ConfigService();
