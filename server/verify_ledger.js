/**
 * verify_ledger.js
 * 
 * This script verifies the Ledger Logic (Deposit, Lock, Settle, Refund).
 * PREREQUISITE: You must apply the migration 'supabase/migrations/20260124000000_add_ledger_tables.sql'
 * to your Supabase project before running this script.
 * 
 * Usage: node server/verify_ledger.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const ledgerService = require('./services/ledgerService');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runTests() {
    console.log("Starting Ledger Tests...");

    // 1. Create Test User
    const userId = uuidv4();
    const accountNum = Math.floor(Math.random() * 1000000000).toString();
    console.log(`Creating test user: ${userId}`);
    
    const { error: userError } = await supabase.from('users').insert({
        id: userId,
        account_holder_name: "Ledger Test User",
        account_number: accountNum,
        ifsc_code: "TEST0000001"
    });

    if (userError) {
        console.error("Failed to create user:", userError);
        return;
    }

    try {
        // 2. Test Deposit
        console.log("\n--- Test 1: Deposit 100 USDT ---");
        const txHash1 = uuidv4();
        const success1 = await ledgerService.creditDeposit(userId, 100, txHash1, "Test Deposit");
        console.log(`Deposit Result: ${success1}`);
        if (!success1) throw new Error("Deposit failed");

        await checkBalance(userId, 100, 0, 0);

        // 3. Test Double Deposit (Idempotency)
        console.log("\n--- Test 2: Double Deposit (Should Fail) ---");
        const success2 = await ledgerService.creditDeposit(userId, 100, txHash1, "Test Deposit Again");
        console.log(`Double Deposit Result: ${success2} (Expected: false)`);
        if (success2) throw new Error("Double deposit succeeded!");

        await checkBalance(userId, 100, 0, 0);

        // 4. Test Lock Funds
        console.log("\n--- Test 3: Lock 50 USDT ---");
        const exchangeId1 = uuidv4();
        const success3 = await ledgerService.lockFundsForExchange(userId, 50, exchangeId1);
        console.log(`Lock Result: ${success3}`);
        if (!success3) throw new Error("Lock failed");

        await checkBalance(userId, 50, 50, 0);

        // 5. Test Negative Balance (Lock more than available)
        console.log("\n--- Test 4: Lock 60 USDT (Should Fail) ---");
        const exchangeId2 = uuidv4();
        try {
            const success4 = await ledgerService.lockFundsForExchange(userId, 60, exchangeId2);
            console.log(`Overdraft Lock Result: ${success4} (Expected: false or error)`);
            if (success4) throw new Error("Overdraft lock succeeded!");
        } catch (e) {
            console.log(`Overdraft Lock Error (Expected): ${e.message}`);
        }

        await checkBalance(userId, 50, 50, 0);

        // 6. Test Refund
        console.log("\n--- Test 5: Refund 50 USDT ---");
        const success5 = await ledgerService.refundExchange(userId, 50, exchangeId1);
        console.log(`Refund Result: ${success5}`);
        if (!success5) throw new Error("Refund failed");

        await checkBalance(userId, 100, 0, 0);

        // 7. Test Settle
        console.log("\n--- Test 6: Settle (Lock 30, then Settle) ---");
        const exchangeId3 = uuidv4();
        await ledgerService.lockFundsForExchange(userId, 30, exchangeId3);
        await checkBalance(userId, 70, 30, 0);

        const success6 = await ledgerService.settleExchange(userId, 30, exchangeId3);
        console.log(`Settle Result: ${success6}`);
        if (!success6) throw new Error("Settle failed");

        await checkBalance(userId, 70, 0, 30); // Assuming settle moves locked -> settled

        console.log("\nALL TESTS PASSED ✅");

    } catch (err) {
        console.error("\nTEST FAILED ❌:", err);
    } finally {
        // Cleanup
        console.log("\nCleaning up...");
        await supabase.from('ledger_entries').delete().eq('user_id', userId);
        await supabase.from('ledger_accounts').delete().eq('user_id', userId);
        await supabase.from('users').delete().eq('id', userId);
    }
}

async function checkBalance(userId, expectedAvail, expectedLocked, expectedSettled) {
    const { data } = await supabase
        .from('ledger_accounts')
        .select('*')
        .eq('user_id', userId)
        .single();
    
    console.log(`Balance Check: Avail=${data.available_balance}, Locked=${data.locked_balance}, Settled=${data.settled_balance}`);
    
    if (parseFloat(data.available_balance) !== expectedAvail) throw new Error(`Available balance mismatch: ${data.available_balance} != ${expectedAvail}`);
    if (parseFloat(data.locked_balance) !== expectedLocked) throw new Error(`Locked balance mismatch: ${data.locked_balance} != ${expectedLocked}`);
    if (parseFloat(data.settled_balance) !== expectedSettled) throw new Error(`Settled balance mismatch: ${data.settled_balance} != ${expectedSettled}`);
}

runTests();
