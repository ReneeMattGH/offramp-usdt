
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const SERVER_URL = 'http://localhost:3000';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    try {
        console.log("1. Creating Test User...");
        // Randomize account number to avoid unique constraint
        const randomAcc = Math.floor(Math.random() * 1000000000).toString();
        const { data: user, error: uError } = await supabase
            .from('users')
            .insert({
                account_holder_name: "Test User",
                account_number: randomAcc,
                ifsc_code: "SBIN0001234"
            })
            .select()
            .single();
        
        if (uError) throw uError;
        console.log("User created:", user.id);

        // Create Session for Auth
        const token = 'test-token-' + Math.random().toString(36).substring(7);
        const { error: sError } = await supabase
            .from('sessions')
            .insert({
                user_id: user.id,
                token: token,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });
            
        if (sError) throw sError;
        console.log("Session created with token:", token);

        const headers = { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        console.log("2. Generating Deposit Address...");
        const res1 = await fetch(`${SERVER_URL}/api/generate-address`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ user_id: user.id })
        });
        const data1 = await res1.json();
        console.log("Address Generated:", data1.success ? data1.address.tron_address : data1.error);

        console.log("3. Simulating Deposit (100 USDT)...");
        // Ensure ledger account exists via direct DB call if needed, but simulate-deposit should handle it via ledgerService
        const res2 = await fetch(`${SERVER_URL}/api/simulate-deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, // Public endpoint (admin tool effectively)
            body: JSON.stringify({ user_id: user.id, amount: 100 })
        });
        const data2 = await res2.json();
        console.log("Deposit Status:", data2.success ? "Success" : data2.error);

        console.log("4. Requesting Withdrawal (50 USDT)...");
        const res3 = await fetch(`${SERVER_URL}/api/withdraw/usdt`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
                destination_address: "T_DEST_ADDRESS_123",
                amount: 50
            })
        });
        const data3 = await res3.json();
        console.log("Withdrawal Request:", data3.success ? "Success" : data3.error);

        console.log("5. Admin: List Withdrawals...");
        const res4 = await fetch(`${SERVER_URL}/api/admin/withdrawals/usdt`);
        const data4 = await res4.json();
        console.log("Withdrawals Count:", Array.isArray(data4) ? data4.length : data4.error);
        
        let withdrawalId = null;
        if (Array.isArray(data4)) {
            const withdrawal = data4.find(w => w.user_id === user.id);
            if (withdrawal) {
                withdrawalId = withdrawal.id;
                console.log("Found Withdrawal ID:", withdrawalId);
            }
        }

        if (withdrawalId) {
            console.log("6. Admin: Cancel Withdrawal (Test Action)...");
            const res5 = await fetch(`${SERVER_URL}/api/admin/withdrawals/usdt/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ withdrawal_id: withdrawalId, action: 'cancel', reason: 'Automated Test' })
            });
            const data5 = await res5.json();
            console.log("Cancel Status:", data5.success ? "Success" : data5.error);
        }

        console.log("7. Testing KYC Request...");
        // Reset KYC to pending to test admin flow
        await supabase.from('users').update({ kyc_status: 'pending' }).eq('id', user.id);
        
        console.log("8. Admin: List KYC Requests...");
        const res6 = await fetch(`${SERVER_URL}/api/admin/kyc-requests`);
        const data6 = await res6.json();
        console.log("KYC Requests Count:", Array.isArray(data6) ? data6.length : data6.error);

        if (Array.isArray(data6)) {
             const req = data6.find(r => r.id === user.id); // users table fallback returns user object
             if (req) {
                 console.log("Found KYC Request for user");
                 const res7 = await fetch(`${SERVER_URL}/api/admin/kyc-action`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ user_id: user.id, action: 'approve' })
                 });
                 const data7 = await res7.json();
                 console.log("KYC Approve Status:", data7.success ? "Success" : data7.error);
             }
        }

    } catch (err) {
        console.error("Verification Failed:", err);
    }
}

run();
