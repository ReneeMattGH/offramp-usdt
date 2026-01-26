const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

class RazorpayProvider {
    constructor() {
        this.key_id = process.env.RAZORPAY_KEY_ID;
        this.key_secret = process.env.RAZORPAY_KEY_SECRET;
        this.account_number = process.env.BANK_ACCOUNT_NUMBER || 'ACC_123';
        this.is_mock = process.env.ENABLE_REAL_PAYOUTS !== 'true';
    }

    async initiatePayout(order, user) {
        if (this.is_mock) {
            console.log('[RazorpayProvider] MOCK Payout initiated');
            return new Promise((resolve) => {
                setTimeout(() => {
                    const rand = Math.random();
                    if (rand < 0.8) {
                        resolve({ 
                            status: 'SUCCESS', 
                            payout_id: 'pout_' + Date.now(), 
                            utr: 'UTR' + Date.now(),
                            raw: { id: 'pout_' + Date.now(), status: 'processed' }
                        });
                    } else if (rand < 0.9) {
                        resolve({ 
                            status: 'FAILED', 
                            reason: 'Invalid Bank Details (Mock)',
                            raw: { error: { description: 'Invalid Bank Details' } }
                        });
                    } else {
                        resolve({ 
                            status: 'PROCESSING', 
                            payout_id: 'pout_' + Date.now(),
                            raw: { id: 'pout_' + Date.now(), status: 'processing' }
                        });
                    }
                }, 1000);
            });
        }

        try {
            const auth = Buffer.from(`${this.key_id}:${this.key_secret}`).toString('base64');
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`
            };

            let fundAccountId = user.razorpay_fund_account_id;

            // 1. Create Fund Account if needed
            if (!fundAccountId) {
                console.log('[RazorpayProvider] Creating Fund Account...');
                
                // A. Create Contact
                let contactId = user.razorpay_contact_id;
                if (!contactId) {
                    const contactRes = await fetch('https://api.razorpay.com/v1/contacts', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            name: user.account_holder_name,
                            type: "customer",
                            reference_id: user.id
                        })
                    });
                    const contactData = await contactRes.json();
                    if (!contactRes.ok) throw new Error(contactData.error?.description || 'Contact Creation Failed');
                    contactId = contactData.id;

                    // Update User
                    await supabase.from('users').update({ razorpay_contact_id: contactId }).eq('id', user.id);
                }

                // B. Create Fund Account
                const faRes = await fetch('https://api.razorpay.com/v1/fund_accounts', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        contact_id: contactId,
                        account_type: "bank_account",
                        bank_account: {
                            name: user.account_holder_name,
                            ifsc: user.ifsc_code,
                            account_number: user.account_number
                        }
                    })
                });
                const faData = await faRes.json();
                if (!faRes.ok) throw new Error(faData.error?.description || 'Fund Account Creation Failed');
                fundAccountId = faData.id;

                // Update User
                await supabase.from('users').update({ razorpay_fund_account_id: fundAccountId }).eq('id', user.id);
            }

            // 2. Initiate Payout
            const requestPayload = {
                account_number: this.account_number,
                fund_account_id: fundAccountId,
                amount: Math.round(order.inr_amount * 100), // Paise
                currency: "INR",
                mode: "IMPS",
                purpose: "payout",
                queue_if_low_balance: true,
                reference_id: order.id,
                narration: "USDT Exchange Payout"
            };

            const response = await fetch('https://api.razorpay.com/v1/payouts', {
                method: 'POST',
                headers,
                body: JSON.stringify(requestPayload)
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('[RazorpayProvider] Error:', data);
                return { 
                    status: 'FAILED', 
                    reason: data.error?.description || 'Bank API Error',
                    raw: data
                };
            }

            // Map Razorpay status
            let status = 'PROCESSING';
            if (data.status === 'processed') status = 'SUCCESS';
            if (data.status === 'reversed' || data.status === 'rejected' || data.status === 'failed') status = 'FAILED';

            return {
                status: status,
                payout_id: data.id,
                utr: data.utr || null,
                raw: data
            };

        } catch (error) {
            console.error('[RazorpayProvider] Network Error:', error);
            return { 
                status: 'FAILED', 
                reason: error.message || 'Network/Connection Error',
                raw: { error: error.message }
            };
        }
    }
}

module.exports = RazorpayProvider;
