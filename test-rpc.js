
import supabase from './src/utils/supabase.js';
import { v4 as uuidv4 } from 'uuid';

async function testCreditDeposit() {
  const userId = '00000000-0000-0000-0000-000000000001'; // Mock user
  const amount = 10;
  const txHash = `DEP_TEST_${Date.now()}`;
  const description = 'Test Deposit';

  console.log(`Testing credit_deposit with tx_hash: ${txHash}`);
  
  const { data, error } = await supabase.rpc('credit_deposit', {
    p_user_id: userId,
    p_amount: amount,
    p_tx_hash: txHash,
    p_description: description
  });

  if (error) {
    console.error('❌ RPC Error:', error);
  } else {
    console.log('✅ RPC Success:', data);
  }
}

testCreditDeposit();
