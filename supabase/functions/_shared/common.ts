// Deno-only helpers for the email functions: environment, Supabase client, sending.
// Secrets are prefixed MEAL_ because this Supabase project is shared with another app.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isEmail, isFromAddress, normalizeSiteUrl, resendRequest } from './logic.ts';

export * from './logic.ts';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** The legacy service-role key, or the default secret key in the newer key format. */
function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const named = (JSON.parse(raw) as Record<string, unknown>).default;
      if (typeof named === 'string' && named) return named;
    } catch {
      console.error('SUPABASE_SECRET_KEYS is not valid JSON');
    }
  }
  throw new Error('Missing service role key');
}

/** Service-role client: bypasses row security, so it must stay on the server. */
export function admin(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('Missing SUPABASE_URL');
  return createClient(url, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The public site address, e.g. https://neighborly-meal-circle.netlify.app */
export function siteUrl(): string {
  return normalizeSiteUrl(Deno.env.get('MEAL_SITE_URL'));
}

/**
 * Sends one email through Resend. The Idempotency-Key makes a retry of the same
 * message a no-op on Resend's side, so a released-and-retried claim can't
 * deliver two copies.
 */
export async function sendEmail(to: string, subject: string, html: string, key?: string): Promise<boolean> {
  const apiKey = Deno.env.get('MEAL_RESEND_API_KEY');
  const from = Deno.env.get('MEAL_EMAIL_FROM')?.trim() ?? '';
  if (!apiKey || !from) {
    console.error('email skipped: set MEAL_RESEND_API_KEY and MEAL_EMAIL_FROM');
    return false;
  }
  if (!isFromAddress(from)) {
    console.error('email skipped: MEAL_EMAIL_FROM must be an address or "Name <address>"');
    return false;
  }
  if (!isEmail(to)) {
    console.error('email skipped: recipient is not an email address');
    return false;
  }
  const req = resendRequest({ apiKey, from, to: to.trim(), subject, html, idempotencyKey: key });
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
    if (res.ok) return true;
    const detail = await res.text();
    if (res.status === 409 && !detail.includes('concurrent_idempotent_requests')) {
      // This key already completed. Don't send a second copy.
      console.error('email idempotency conflict', res.status, detail);
      return true;
    }
    console.error('email failed', res.status, detail);
    return false;
  } catch (err) {
    console.error('email request failed', err);
    return false;
  }
}
