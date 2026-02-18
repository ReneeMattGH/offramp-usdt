import supabase from '../utils/supabase.js';

export interface SystemConfig {
  min_usdt_withdrawal: number;
  usdt_withdrawal_fee: number;
  daily_withdrawal_limit: number;
  exchange_spread_percent: number;
  withdrawals_enabled: boolean;
  deposits_enabled: boolean;
  exchanges_enabled: boolean;
}

export class ConfigService {
  private static instance: ConfigService;
  private config: SystemConfig = {
    min_usdt_withdrawal: 20.0,
    usdt_withdrawal_fee: 5.0,
    daily_withdrawal_limit: 100000.0,
    exchange_spread_percent: 1.0,
    withdrawals_enabled: true,
    deposits_enabled: true,
    exchanges_enabled: true
  };
  private isLoaded: boolean = false;

  private constructor() {}

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  async loadConfig(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        if (error.code === 'PGRST205' || error.message.includes('relation')) {
          return;
        }
        throw error;
      }

      if (data) {
        this.config = { ...this.config, ...data };
        this.isLoaded = true;
      }
    } catch (err) {
      console.error('[CONFIG_SERVICE] Load Error:', err);
    }
  }

  get<K extends keyof SystemConfig>(key: K): SystemConfig[K] {
    return this.config[key];
  }

  getAll(): SystemConfig {
    return { ...this.config };
  }

  async update(updates: Partial<SystemConfig>): Promise<{ success: boolean; config?: SystemConfig; error?: string }> {
    const allowedKeys: (keyof SystemConfig)[] = [
      'min_usdt_withdrawal',
      'usdt_withdrawal_fee',
      'daily_withdrawal_limit',
      'exchange_spread_percent',
      'withdrawals_enabled',
      'deposits_enabled',
      'exchanges_enabled'
    ];

    const cleanUpdates: Partial<SystemConfig> = {};
    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        cleanUpdates[key] = updates[key] as any;
      }
    }

    if (Object.keys(cleanUpdates).length === 0) {
      return { success: false, error: 'No valid fields' };
    }

    const { data, error } = await supabase
      .from('system_settings')
      .update(cleanUpdates)
      .eq('id', 1)
      .select()
      .single();

    if (error) throw error;

    if (data) {
      this.config = { ...this.config, ...data };
      return { success: true, config: this.config };
    }

    return { success: false, error: 'Update failed' };
  }
}

export default ConfigService.getInstance();
