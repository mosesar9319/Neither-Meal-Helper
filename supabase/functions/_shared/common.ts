// Shared Deno helpers for the email Edge Functions.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isEmail, isFromAddress, normalizeAppUrl, resendRequest } from './logic.ts';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Prefer the legacy service-role JWT, then the named secret key Supabase injects. */
export function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const named = parsed.default;
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

/** Public site origin. APP_URL is canonical; SITE_URL is still accepted. */
export function appUrl(): string {
  return normalizeAppUrl(Deno.env.get('APP_URL') ?? Deno.env.get('SITE_URL'));
}

export async function sendEmail(to: string, subject: string, html: string, idempotencyKey?: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM')?.trim() ?? '';
  if (!key || !from) {
    console.error('email skipped: set RESEND_API_KEY and EMAIL_FROM');
    return false;
  }
  if (!isFromAddress(from)) {
    console.error('email skipped: EMAIL_FROM must be an address or "Name <address>"');
    return false;
  }
  if (!isEmail(to)) {
    console.error('email skipped: recipient is not an email address');
    return false;
  }
  const req = resendRequest({ apiKey: key, from, to: to.trim(), subject, html, idempotencyKey });
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
    if (res.ok) return true;
    const detail = await res.text();
    if (res.status === 409 && !detail.includes('concurrent_idempotent_requests')) {
      // This key already completed with a different payload. Don't send a second copy.
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
