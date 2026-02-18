import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const REQUIRED_CONFIRMATIONS = 19; // ~1 minute on TRON

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const trongridApiKey = Deno.env.get("TRONGRID_API_KEY");

    if (!trongridApiKey) {
      return new Response(
        JSON.stringify({ error: "TRONGRID_API_KEY not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all broadcasted transactions pending confirmation
    const { data: pendingTxs, error } = await supabase
      .from("salary_transactions")
      .select("*")
      .eq("status", "broadcasted")
      .not("tx_hash", "is", null);

    if (error) {
      throw error;
    }

    const results = [];

    for (const tx of pendingTxs || []) {
      try {
        // Check transaction info on TRON
        const txInfoResponse = await fetch(
          `https://api.trongrid.io/wallet/gettransactioninfobyid`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "TRON-PRO-API-KEY": trongridApiKey,
            },
            body: JSON.stringify({ value: tx.tx_hash }),
          }
        );

        const txInfo = await txInfoResponse.json();

        if (!txInfo.blockNumber) {
          // Transaction not yet in a block
          results.push({ tx_hash: tx.tx_hash, status: "pending_block" });
          continue;
        }

        // Get current block number
        const blockResponse = await fetch(
          "https://api.trongrid.io/wallet/getnowblock",
          {
            headers: { "TRON-PRO-API-KEY": trongridApiKey },
          }
        );
        const currentBlock = await blockResponse.json();
        const currentBlockNum = currentBlock.block_header?.raw_data?.number || 0;

        const confirmations = currentBlockNum - txInfo.blockNumber;

        if (confirmations >= REQUIRED_CONFIRMATIONS) {
          // Check if transaction was successful
          if (txInfo.receipt?.result === "SUCCESS") {
            // Check for duplicate processing
            const { data: existing } = await supabase
              .from("processed_transactions")
              .select("tx_hash")
              .eq("tx_hash", tx.tx_hash)
              .single();

            if (existing) {
              results.push({ tx_hash: tx.tx_hash, status: "already_processed" });
              continue;
            }

            // Mark as processed (idempotency)
            await supabase.from("processed_transactions").insert({
              tx_hash: tx.tx_hash,
              from_address: tx.from_address,
              to_address: tx.to_address,
              amount_usdt: tx.amount_usdt,
              transaction_type: "salary",
              block_number: txInfo.blockNumber,
            });

            // Update salary transaction status
            await supabase
              .from("salary_transactions")
              .update({
                status: "confirmed",
                block_number: txInfo.blockNumber,
                confirmed_at: new Date().toISOString(), 
              })
              .eq("id", tx.id);

            // Get current balance from ledger
            const { data: balanceData } = await supabase.rpc("get_user_balance", {
              p_user_id: tx.user_id,
            });

            const currentBalance = balanceData || 0;
            const newBalance = currentBalance + tx.amount_usdt;

            // Credit user ledger
            await supabase.from("ledger").insert({
              user_id: tx.user_id,
              tx_hash: tx.tx_hash,
              credit_usdt: tx.amount_usdt,
              debit_usdt: 0,
              balance_after: newBalance,
              description: "Salary credit",
            });

            // Also record in transactions table for UI
            await supabase.from("transactions").insert({
              user_id: tx.user_id,
              type: "salary",
              amount: tx.amount_usdt,
              status: "completed",
              tx_hash: tx.tx_hash,
            });

            results.push({ 
              tx_hash: tx.tx_hash, 
              status: "confirmed",
              new_balance: newBalance 
            });

          } else {
            // Transaction failed on-chain
            await supabase
              .from("salary_transactions")
              .update({
                status: "failed",
                error_message: `On-chain failure: ${txInfo.receipt?.result || "UNKNOWN"}`,
              })
              .eq("id", tx.id);

            results.push({ tx_hash: tx.tx_hash, status: "failed_onchain" });
          }
        } else {
          results.push({ 
            tx_hash: tx.tx_hash, 
            status: "pending_confirmations",
            confirmations,
            required: REQUIRED_CONFIRMATIONS 
          });
        }

      } catch (txError: any) {
        console.error(`Error processing tx ${tx.tx_hash}:`, txError);
        results.push({ tx_hash: tx.tx_hash, status: "error", error: txError.message });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
