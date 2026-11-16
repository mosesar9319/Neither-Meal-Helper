// Shared helpers for the email Edge Functions (Deno).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { HDate, HebrewCalendar, flags } from 'npm:@hebcal/core@6';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Service-role client: bypasses row security, so it must stay on the server. */
export function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

export const SITE_URL = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!key || !from || !to) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) console.error('email failed', res.status, await res.text());
  return res.ok;
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const SLOT_HE: Record<string, string> = { breakfast: 'ארוחת בוקר', lunch: 'ארוחת צהריים', dinner: 'ארוחת ערב' };
const SLOT_EN: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

export function slotLabel(slot: string) {
  return `${SLOT_HE[slot] ?? slot} · ${SLOT_EN[slot] ?? slot}`;
}

export function dateLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  const he = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
  const en = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
  return `${he} · ${en}`;
}

interface WindowDetails {
  deliveryFrom?: string;
  deliveryTo?: string;
  earlyFrom?: string;
  earlyTo?: string;
  inIsrael?: boolean;
}

/** Same rule as the app: Fridays and holiday eves use the early window. */
export function deliveryWindow(iso: string, details: WindowDetails) {
  const d = new Date(`${iso}T12:00:00Z`);
  const next = new Date(d.getTime() + 86_400_000);
  const nextIsChag = (HebrewCalendar.getHolidaysOnDate(new HDate(next), details.inIsrael ?? true) ?? []).some(
    (e) => e.getFlags() & flags.CHAG,
  );
  const early = d.getUTCDay() === 5 || nextIsChag;
  return early ? `${details.earlyFrom ?? ''}–${details.earlyTo ?? ''}` : `${details.deliveryFrom ?? ''}–${details.deliveryTo ?? ''}`;
}

export function layout(body: string) {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#2A2420;max-width:560px;margin:auto">${body}
<p style="color:#6E6359;font-size:13px;margin-top:32px">שכנים למען שכנים · Neighbors for Neighbors</p></div>`;
}

export function button(href: string, label: string) {
  return `<p><a href="${esc(href)}" style="display:inline-block;background:#B5532F;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">${esc(label)}</a></p>`;
}
