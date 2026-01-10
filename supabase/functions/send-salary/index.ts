import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SalaryRequest {
  user_id: string;
  amount_usdt: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const companyWalletAddress = Deno.env.get("COMPANY_WALLET_ADDRESS");
    const companyPrivateKey = Deno.env.get("COMPANY_WALLET_PRIVATE_KEY");
    const trongridApiKey = Deno.env.get("TRONGRID_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, amount_usdt }: SalaryRequest = await req.json();

    // Validation
    if (!user_id || !amount_usdt || amount_usdt <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid user_id or amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user wallet address
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("tron_wallet_address")
      .eq("id", user_id)
      .single();

    if (userError || !user?.tron_wallet_address) {
      return new Response(
        JSON.stringify({ error: "User wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if secrets are configured
    if (!companyWalletAddress || !companyPrivateKey || !trongridApiKey) {
      return new Response(
        JSON.stringify({ 
          error: "Blockchain integration not configured. Please add COMPANY_WALLET_ADDRESS, COMPANY_WALLET_PRIVATE_KEY, and TRONGRID_API_KEY secrets." 
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Create INITIATED record BEFORE sending
    const { data: salaryTx, error: insertError } = await supabase
      .from("salary_transactions")
      .insert({
        user_id,
        from_address: companyWalletAddress,
        to_address: user.tron_wallet_address,
        amount_usdt,
        status: "initiated",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to create salary record:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to initiate salary transaction" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Send USDT on TRON (TRC20 transfer)
    const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    const amount6Decimals = Math.floor(amount_usdt * 1_000_000);

    try {
      // Build TRC20 transfer transaction
      const triggerResponse = await fetch(
        "https://api.trongrid.io/wallet/triggersmartcontract",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "TRON-PRO-API-KEY": trongridApiKey,
          },
          body: JSON.stringify({
            owner_address: companyWalletAddress,
            contract_address: USDT_CONTRACT,
            function_selector: "transfer(address,uint256)",
            parameter: encodeTransferParams(user.tron_wallet_address, amount6Decimals),
            fee_limit: 100_000_000, // 100 TRX max fee
            call_value: 0,
          }),
        }
      );

      const triggerData = await triggerResponse.json();

      if (!triggerData.result?.result) {
        throw new Error(triggerData.result?.message || "Failed to create transaction");
      }

      // Sign transaction
      const signResponse = await fetch(
        "https://api.trongrid.io/wallet/gettransactionsign",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "TRON-PRO-API-KEY": trongridApiKey,
          },
          body: JSON.stringify({
            transaction: triggerData.transaction,
            privateKey: companyPrivateKey,
          }),
        }
      );

      const signedTx = await signResponse.json();

      // Broadcast transaction
      const broadcastResponse = await fetch(
        "https://api.trongrid.io/wallet/broadcasttransaction",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "TRON-PRO-API-KEY": trongridApiKey,
          },
          body: JSON.stringify(signedTx),
        }
      );

      const broadcastData = await broadcastResponse.json();

      if (!broadcastData.result) {
        throw new Error(broadcastData.message || "Failed to broadcast transaction");
      }

      const txHash = signedTx.txID;

      // Step 4: Update with tx_hash and BROADCASTED status
      await supabase
        .from("salary_transactions")
        .update({
          tx_hash: txHash,
          status: "broadcasted",
          broadcasted_at: new Date().toISOString(),
        })
        .eq("id", salaryTx.id);

      return new Response(
        JSON.stringify({
          success: true,
          transaction_id: salaryTx.id,
          tx_hash: txHash,
          status: "broadcasted",
          tronscan_url: `https://tronscan.org/#/transaction/${txHash}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (txError: any) {
      // Mark as failed
      await supabase
        .from("salary_transactions")
        .update({
          status: "failed",
          error_message: txError.message,
        })
        .eq("id", salaryTx.id);

      console.error("Transaction failed:", txError);
      return new Response(
        JSON.stringify({ error: "Transaction failed", details: txError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper: Encode TRC20 transfer parameters
function encodeTransferParams(toAddress: string, amount: number): string {
  // Remove T prefix and decode base58 to hex
  const addressHex = base58ToHex(toAddress).padStart(64, "0");
  const amountHex = amount.toString(16).padStart(64, "0");
  return addressHex + amountHex;
}

// Base58 to Hex conversion for TRON addresses
function base58ToHex(base58: string): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt(0);
  for (const char of base58) {
    num = num * BigInt(58) + BigInt(ALPHABET.indexOf(char));
  }
  let hex = num.toString(16);
  // Remove version byte (41) and checksum (last 8 chars)
  if (hex.startsWith("41")) {
    hex = hex.slice(2, -8);
  }
  return hex;
}
