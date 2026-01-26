
require('dotenv').config(); // Load .env from current dir (server/)
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

w// Fix: Use correct import path or require if it's a module
const payoutService = require('./services/payoutService');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BASE_URL = 'http://localhost:3000/api';

async function runAudit() {
    console.log('--- STARTING AUDIT VERIFICATION ---');

    // 0. Schema Check
    const { data: schemaCheck, error: schemaError } = await supabase
        .from('users')
        .select('kyc_status')
        .limit(1);
    
    if (schemaError && schemaError.message.includes('column "kyc_status" does not exist')) {
        console.error('🚨 CRITICAL: Schema Missing `kyc_status`. Please apply migration 20260125000003_ensure_kyc_status.sql');
    }

    // 1. Create Test User
    const accountNumber = 'TEST_' + Date.now();
    let user;
    
    // Try creating with kyc_status first (Preferred Schema)
    const { data: userWithKyc, error: errorWithKyc } = await supabase
        .from('users')
        .insert({
            account_holder_name: 'Audit Bot',
            account_number: accountNumber,
            ifsc_code: 'TEST0001',
            tron_wallet_address: 'T_MOCK_AUDIT',
            encrypted_private_key: 'mock_key',
            kyc_status: 'approved',
            kyc_verified_at: new Date()
        })
        .select()
        .single();

    if (!errorWithKyc) {
        user = userWithKyc;
    } else {
        console.warn('⚠️ Creation with kyc_status failed, trying fallback schema...', errorWithKyc.message);
        // Fallback: Create without kyc_status (Legacy Schema)
        const { data: userFallback, error: errorFallback } = await supabase
            .from('users')
            .insert({
                account_holder_name: 'Audit Bot',
                account_number: accountNumber,
                ifsc_code: 'TEST0001',
                tron_wallet_address: 'T_MOCK_AUDIT',
                encrypted_private_key: 'mock_key'
            })
            .select()
            .single();
            
        if (errorFallback) {
            console.error('❌ User Creation Failed (Both methods):', errorFallback.message);
            return;
        }
        user = userFallback;
        console.warn('⚠️ User created using LEGACY schema (no kyc_status). Payouts may fail if KYC check is strict.');
    }
    console.log('✅ User Created:', user.id);

    // 2. Create Session (Login)
    const token = crypto.randomUUID();
    const { error: sessionError } = await supabase
        .from('sessions')
        .insert({
            user_id: user.id,
            token: token,
            expires_at: new Date(Date.now() + 3600000)
        });

    if (sessionError) {
        console.error('❌ Session Creation Failed:', sessionError.message);
        return;
    }
    console.log('✅ Session Created');

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    // 3. Check Exchange Rate
    try {
        const rateRes = await fetch(`${BASE_URL}/exchange/rate`);
        const rateData = await rateRes.json();
        if (rateData.rate) {
            console.log('✅ Exchange Rate Fetched:', rateData.rate);
        } else {
            console.error('❌ Exchange Rate Failed:', rateData);
        }
    } catch (e) {
        console.error('❌ Exchange Rate Error:', e.message);
    }

    // 4. Generate Deposit Address
    try {
        const addrRes = await fetch(`${BASE_URL}/generate-address`, { method: 'POST', headers });
        const addrData = await addrRes.json();
        if (addrData.success) {
            console.log('✅ Deposit Address Generated:', addrData.address.tron_address);
        } else {
            console.error('❌ Address Gen Failed:', addrData);
        }
    } catch (e) {
        console.error('❌ Address Gen Error:', e.message);
    }

    // 5. Simulate Deposit (Atomic Ledger Check)
    const depositAmount = 100;
    try {
        const depRes = await fetch(`${BASE_URL}/simulate-deposit`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ user_id: user.id, amount: depositAmount })
        });
        const depData = await depRes.json();
        if (depData.success) {
            console.log('✅ Deposit Simulated:', depositAmount, 'USDT');
        } else {
            console.error('❌ Deposit Failed:', depData);
        }
    } catch (e) {
        console.error('❌ Deposit Error:', e.message);
    }

    // 6. Verify Balance in Ledger
    const { data: ledger } = await supabase
        .from('ledger_accounts')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (ledger && parseFloat(ledger.available_balance) === depositAmount) {
        console.log('✅ Ledger Balance Verified:', ledger.available_balance);
    } else {
        console.error('❌ Ledger Balance Mismatch:', ledger);
    }

    // 7. Create Exchange Order (Atomic Lock Check)
    const exchangeAmount = 50;
    try {
        const exRes = await fetch(`${BASE_URL}/exchange/create`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ usdt_amount: exchangeAmount })
        });
        const exData = await exRes.json();
        if (exData.success) {
            console.log('✅ Exchange Order Created:', exData.order_id);
            console.log('   Status:', exData.status);
        } else {
            console.error('❌ Exchange Create Failed:', exData);
        }
    } catch (e) {
        console.error('❌ Exchange Create Error:', e.message);
    }

    // 8. Verify Balance Locked
    const { data: ledgerAfter } = await supabase
        .from('ledger_accounts')
        .select('*')
        .eq('user_id', user.id)
        .single();

    const expectedAvailable = depositAmount - exchangeAmount;
    const expectedLocked = exchangeAmount;

    if (ledgerAfter && 
        parseFloat(ledgerAfter.available_balance) === expectedAvailable && 
        parseFloat(ledgerAfter.locked_balance) === expectedLocked) {
        console.log('✅ Balance Locking Verified:');
        console.log('   Available:', ledgerAfter.available_balance);
        console.log('   Locked:', ledgerAfter.locked_balance);
    } else {
        console.error('❌ Balance Locking Failed:', ledgerAfter);
    }

    // 9. Trigger Payout Worker
    console.log('--- Triggering Payout Worker ---');
    setTimeout(async () => {
        try {
            const payoutRes = await fetch(`${BASE_URL}/admin/exchange/logs/${user.id}`, { headers });
            const payoutData = await payoutRes.json();
            if (payoutData.length > 0) {
                console.log('✅ Payout Processed:', payoutData[0]);
            } else {
                console.error('❌ Payout Failed or Stuck:', payoutData);
            }
        } catch (e) {
            console.error('❌ Payout Error:', e.message);
        }
        console.log('--- AUDIT COMPLETE ---');
    }, 5000);
}

runAudit();
                    `   `