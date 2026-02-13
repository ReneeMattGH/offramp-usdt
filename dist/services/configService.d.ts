export interface SystemConfig {
    min_usdt_withdrawal: number;
    usdt_withdrawal_fee: number;
    daily_withdrawal_limit: number;
    exchange_spread_percent: number;
    withdrawals_enabled: boolean;
    deposits_enabled: boolean;
    exchanges_enabled: boolean;
}
export declare class ConfigService {
    private static instance;
    private config;
    private isLoaded;
    private constructor();
    static getInstance(): ConfigService;
    loadConfig(): Promise<void>;
    get<K extends keyof SystemConfig>(key: K): SystemConfig[K];
    getAll(): SystemConfig;
    update(updates: Partial<SystemConfig>): Promise<{
        success: boolean;
        config?: SystemConfig;
        error?: string;
    }>;
}
declare const _default: ConfigService;
export default _default;
