// Sends invitation email using Supabase Auth only (your project SMTP + email templates).
// Request body: email, inviteUrl, spaceName, inviterName, isExistingUser.
// - New user: Auth inviteUserByEmail (uses Dashboard → Auth → SMTP and Auth email templates).
// - Existing user: no email sent; invitation is in DB; app shows in-app invite. Optional: use magic link (see README).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { email, inviteUrl, spaceName, inviterName, isExistingUser } = await req.json();
    const space = spaceName || 'a space';
    const inviter = inviterName || 'Someone';

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Supabase service role not available.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Existing user: no email from this function; invitation is already in DB; app handles in-app notify.
    if (isExistingUser) {
      return new Response(
        JSON.stringify({ success: true, emailSent: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const redirectTo = inviteUrl?.trim() || undefined;
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { space_name: space, inviter_name: inviter },
    });

    if (error) {
      console.error('inviteUserByEmail failed:', error.message);
      // User already registered: invitation stays in DB; app handles in-app. No email sent.
      if (error.message?.toLowerCase().includes('already') || error.message?.toLowerCase().includes('registered')) {
        return new Response(JSON.stringify({ success: true, emailSent: false }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('inviteUserByEmail ok, email=', email);
    return new Response(JSON.stringify({ success: true, emailSent: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
