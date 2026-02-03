
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser() {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('account_number', 'DEMO_USER_001')
        .maybeSingle();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('User found:', !!data);
        if (data) console.log(data);
    }
}

checkUser();
