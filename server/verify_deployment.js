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

        console.log("2. Generating Deposit Address...");
        const res1 = await fetch(`${SERVER_URL}/api/generate-address`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id })
        });
        const data1 = await res1.json();
        console.log("Address Generated:", data1.success ? data1.address.tron_address : data1.error);

        console.log("3. Simulating Deposit (100 USDT)...");
        const res2 = await fetch(`${SERVER_URL}/api/simulate-deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id, amount: 100 })
        });
        const data2 = await res2.json();
        console.log("Deposit Status:", data2.success ? "Success" : data2.error);

        console.log("4. Requesting Withdrawal (50 USDT)...");
        const res3 = await fetch(`${SERVER_URL}/api/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                user_id: user.id, 
                amount: 50, 
                bank_account_number: randomAcc,
                ifsc_code: "SBIN0001234" 
            })
        });
        const data3 = await res3.json();
        console.log("Withdrawal Request:", data3.success ? "Success" : data3.error);

        console.log("5. Admin: List Withdrawals...");
        const res4 = await fetch(`${SERVER_URL}/api/admin/withdrawals`);
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
            console.log("6. Admin: Approve Withdrawal...");
            const res5 = await fetch(`${SERVER_URL}/api/admin/withdrawal-action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ withdrawal_id: withdrawalId, action: 'approve' })
            });
            const data5 = await res5.json();
            console.log("Approval Status:", data5.success ? "Approved" : data5.error);
        }

        console.log("7. Testing KYC Request...");
        // Update user to submit KYC
        // Since we don't have an endpoint to "submit kyc" (client updates DB directly), 
        // we'll update DB directly using anon key (assuming RLS allows)
        const { error: kError } = await supabase
            .from('users')
            .update({ kyc_status: 'pending' })
            .eq('id', user.id);
            
        if (kError) console.error("KYC Submit Error:", kError.message);
        else console.log("KYC Submitted (DB update)");

        console.log("8. Admin: List KYC Requests...");
        const res6 = await fetch(`${SERVER_URL}/api/admin/kyc-requests`);
        const data6 = await res6.json();
        console.log("KYC Requests Count:", Array.isArray(data6) ? data6.length : data6.error);
        
        if (Array.isArray(data6)) {
             const req = data6.find(r => r.id === user.id);
             if (req) {
                 console.log("Found KYC Request for User");
                 console.log("9. Admin: Approve KYC...");
                 const res7 = await fetch(`${SERVER_URL}/api/admin/kyc-action`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: user.id, action: 'approve' })
                });
                const data7 = await res7.json();
                console.log("KYC Approval:", data7.success ? "Verified" : data7.error);
             }
        }

        console.log("Verification Complete.");

    } catch (e) {
        console.error("Verification Failed:", e);
    }
}

run();
