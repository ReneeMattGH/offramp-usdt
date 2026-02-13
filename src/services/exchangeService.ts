import supabase from '../utils/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import configService from './configService.js';
import complianceService from './complianceService.js';

interface CachedRate {
  rate: number;
  lastUpdated: number;
}

export class ExchangeService {
  private static instance: ExchangeService;
  private cachedRate: CachedRate = {
    rate: 92.00,
    lastUpdated: 0
  };

  private constructor() {}

  public static getInstance(): ExchangeService {
    if (!ExchangeService.instance) {
      ExchangeService.instance = new ExchangeService();
    }
    return ExchangeService.instance;
  }

  async getLiveRate(): Promise<number> {
    const now = Date.now();
    const CACHE_DURATION = 10000;
    const spreadPercent = configService.get('exchange_spread_percent') || 0;

    if (now - this.cachedRate.lastUpdated >= CACHE_DURATION) {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr');
        if (response.ok) {
          const data = await response.json() as { tether: { inr: number } };
          if (data.tether?.inr) {
            this.cachedRate = { rate: data.tether.inr, lastUpdated: now };
          }
        }
      } catch (error: any) {
        console.error('[EXCHANGE_SERVICE] Rate fetch error:', error.message);
      }
    }

    const userRate = this.cachedRate.rate * (1 - (spreadPercent / 100));
    return Number(userRate.toFixed(2));
  }

  async createExchangeOrder(userId: string, usdtAmount: number, bankAccountId?: string, bankDetails?: any) {
    try {
      if (!configService.get('exchanges_enabled')) {
        throw new Error('Exchanges are paused');
      }

      const rate = await this.getLiveRate();
      const inrAmount = Number((usdtAmount * rate).toFixed(2));
      
      // Check limits
      await complianceService.checkExchangeLimit(userId, usdtAmount);
      await complianceService.checkWithdrawalLimit(userId, inrAmount);

      const idempotencyKey = uuidv4(); 
      let finalBankAccountId = bankAccountId;
      
      if (!finalBankAccountId && bankDetails) {
        const { data: existingBank } = await supabase
          .from('bank_accounts')
          .select('id')
          .eq('user_id', userId)
          .eq('account_number', bankDetails.account_number)
          .eq('ifsc_code', bankDetails.ifsc)
          .maybeSingle();
            
        if (existingBank) {
          finalBankAccountId = existingBank.id;
        } else {
          const { data: newBank, error: createError } = await supabase
            .from('bank_accounts')
            .insert({
              user_id: userId,
              account_holder_name: bankDetails.account_holder_name,
              account_number: bankDetails.account_number,
              ifsc_code: bankDetails.ifsc,
              bank_name: 'Bank',
              is_verified: true
            })
            .select()
            .single();
                
          if (createError) throw new Error('Failed to save bank');
          finalBankAccountId = newBank.id;
        }
      }

      if (!finalBankAccountId) {
        throw new Error('Bank account required for exchange');
      }

      // Use RPC for atomic operation
      const { data, error } = await supabase.rpc('create_exchange_order', {
        p_user_id: userId,
        p_usdt_amount: usdtAmount,
        p_inr_amount: inrAmount,
        p_rate: rate,
        p_bank_account_id: finalBankAccountId,
        p_idempotency_key: idempotencyKey
      });

      if (error) throw error;

      return {
        success: true,
        orderId: data,
        inrAmount,
        rate
      };
    } catch (error: any) {
      console.error('[EXCHANGE_SERVICE] Order creation failed:', error.message);
      throw error;
    }
  }

  async getOrders(userId: string) {
    const { data, error } = await supabase
      .from('exchange_orders')
      .select('*, bank_accounts(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}

export default ExchangeService.getInstance();
