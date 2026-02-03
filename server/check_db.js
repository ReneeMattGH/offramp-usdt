
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable(tableName) {
    const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

    if (error) {
        if (error.code === '42P01' || (error.message && error.message.includes('relation "public.' + tableName + '" does not exist'))) {
             console.log(`[MISSING] Table '${tableName}' DOES NOT exist.`);
             return false;
        }
        // Some other error, maybe permission or other code for missing table
        console.log(`[ERROR] Checking '${tableName}': ${error.message} (${error.code})`);
        return false;
    }
    console.log(`[OK] Table '${tableName}' exists.`);
    return true;
}

async function run() {
    console.log('Checking database tables...');
    const tables = [
        'users',
        'wallets',
        'deposit_addresses',
        'ledger_accounts',
        'ledger_entries',
        'blockchain_transactions',
        'usdt_withdrawals',
        'payout_orders'
    ];

    for (const t of tables) {
        await checkTable(t);
    }
}

run();
