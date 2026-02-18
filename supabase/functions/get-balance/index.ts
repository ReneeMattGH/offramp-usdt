import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse user_id from request or JWT
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get balance from ledger using database function
    const { data: balance, error } = await supabase.rpc("get_user_balance", {
      p_user_id: user_id,
    });

    if (error) {
      throw error;
    }

    // Get recent transactions for context
    const { data: recentTxs } = await supabase
      .from("ledger")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Get pending salary transactions
    const { data: pendingSalary } = await supabase
      .from("salary_transactions")
      .select("*")
      .eq("user_id", user_id)
      .in("status", ["initiated", "broadcasted"])
      .order("created_at", { ascending: false });

    return new Response(
      JSON.stringify({
        balance: balance || 0,
        pending_salary: pendingSalary || [],
        recent_transactions: recentTxs || [],
      }),
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
