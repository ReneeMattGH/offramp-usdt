import supabase from '../utils/supabase.js';
import config from '../config/index.js';

export class RazorpayProvider {
  private config = {
    key: config.razorpay.keyId,
    secret: config.razorpay.keySecret,
    account: config.razorpay.bankAccount
  };

  async initiatePayout(order: any, user: any, bank: any) {
    if (!this.config.key || !this.config.secret || !this.config.account) {
      return { status: 'FAILED', reason: 'Configuration missing' };
    }

    try {
      const auth = Buffer.from(`${this.config.key}:${this.config.secret}`).toString('base64');
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      };

      let contactId = user.razorpay_contact_id;
      if (!contactId) {
        const res = await fetch('https://api.razorpay.com/v1/contacts', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: user.account_holder_name || 'Customer',
            type: 'customer',
            reference_id: user.id
          })
        });
        const data = await res.json() as any;
        if (!res.ok) throw new Error(data.error?.description || 'Contact creation failed');
        contactId = data.id;
        await supabase.from('users').update({ razorpay_contact_id: contactId }).eq('id', user.id);
      }

      const faRes = await fetch('https://api.razorpay.com/v1/fund_accounts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contact_id: contactId,
          account_type: 'bank_account',
          bank_account: {
            name: bank.account_holder_name,
            ifsc: bank.ifsc_code,
            account_number: bank.account_number
          }
        })
      });
      const faData = await faRes.json() as any;
      if (!faRes.ok) throw new Error(faData.error?.description || 'Fund account creation failed');
      
      const payoutRes = await fetch('https://api.razorpay.com/v1/payouts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          account_number: this.config.account,
          fund_account_id: faData.id,
          amount: Math.round(order.inr_amount * 100),
          currency: 'INR',
          mode: 'IMPS',
          purpose: 'payout',
          queue_if_low_balance: true,
          reference_id: order.id,
          narration: 'Exchange Payout'
        })
      });

      const data = await payoutRes.json() as any;
      if (!payoutRes.ok) {
        return { 
          status: 'FAILED', 
          reason: data.error?.description || 'Payout API error',
          raw: data
        };
      }

      let status = 'PROCESSING';
      if (data.status === 'processed') status = 'SUCCESS';
      if (['reversed', 'rejected', 'failed'].includes(data.status)) status = 'FAILED';

      return {
        status,
        payout_id: data.id,
        utr: data.utr || null,
        raw: data
      };
    } catch (error: any) {
      console.error('[RAZORPAY_PROVIDER] Error:', error.message);
      return { status: 'FAILED', reason: error.message };
    }
  }
}
