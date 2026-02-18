import supabase from '../utils/supabase.js';
import { RazorpayProvider } from './payoutProvider.js';
import ledgerService from './ledgerService.js';

export class PayoutService {
  private static instance: PayoutService;
  private provider: RazorpayProvider;

  private constructor() {
    this.provider = new RazorpayProvider();
  }

  public static getInstance(): PayoutService {
    if (!PayoutService.instance) {
      PayoutService.instance = new PayoutService();
    }
    return PayoutService.instance;
  }

  async getOrders(userId: string) {
    const { data, error } = await supabase
      .from('payout_orders')
      .select('*, bank_accounts(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async handleWebhook(payload: any) {
    const { event, payload: eventData } = payload;
    const payout = eventData?.payout?.entity;
    
    if (!payout || !payout.reference_id) return;

    const orderId = payout.reference_id;
    const { data: order } = await supabase.from('payout_orders').select('*').eq('id', orderId).maybeSingle();
    
    if (!order || order.status === 'COMPLETED' || order.status === 'FAILED') return;

    if (event === 'payout.processed') {
      const res = await ledgerService.finalizePayout(order.user_id, order.usdt_amount, order.id);
      if (res.success) {
        await supabase.from('payout_orders').update({ 
          status: 'COMPLETED', 
          gateway_ref_id: payout.utr || payout.id,
          updated_at: new Date().toISOString() 
        }).eq('id', orderId);
      }
    } else if (['payout.reversed', 'payout.rejected', 'payout.failed'].includes(event)) {
      await ledgerService.failPayout(order.user_id, order.usdt_amount, order.id);
      await supabase.from('payout_orders').update({ 
        status: 'FAILED', 
        failure_reason: payout.failure_reason || event,
        updated_at: new Date().toISOString() 
      }).eq('id', orderId);
    }
  }

  async createPayout(userId: string, inrAmount: number, bankAccountId: string) {
    // Logic for direct INR payout if applicable
  }
}

export default PayoutService.getInstance();
