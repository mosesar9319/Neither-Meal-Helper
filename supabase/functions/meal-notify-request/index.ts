// Emails every admin about a new meal request that waits for approval.
// Called by the app right after a request is sent, with the organizer's own
// management token, so only the requester can trigger it, and only once.
import { SITE_URL, admin, button, cors, esc, json, layout, sendEmail, slotLabel } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const { manageToken } = await req.json().catch(() => ({}));
  if (typeof manageToken !== 'string' || manageToken.length < 16) return json({ ok: true });

  const db = admin();
  const { data: m } = await db.from('meal_managers').select('board_id').eq('token', manageToken).eq('role', 'owner').maybeSingle();
  if (!m) return json({ ok: true });

  // Claim the request atomically so repeated calls send nothing.
  const { data: board } = await db
    .from('meal_boards')
    .update({ admins_notified_at: new Date().toISOString() })
    .eq('id', m.board_id)
    .eq('status', 'pending')
    .is('admins_notified_at', null)
    .select('family_name, start_date, end_date, slots, details')
    .maybeSingle();
  if (!board) return json({ ok: true });

  const { data: admins } = await db.from('meal_admins').select('email');
  const organizer = board.details?.organizerName ? ` · ${board.details.organizerName}` : '';
  const html = layout(`
    <h2>בקשה חדשה ממתינה לאישור · A new meal request is waiting</h2>
    <p><b>משפחת ${esc(board.family_name)} · ${esc(board.family_name)} family</b>${esc(organizer)}</p>
    <p>${esc(board.start_date)} – ${esc(board.end_date)}</p>
    <p>${(board.slots ?? []).map((s: string) => esc(slotLabel(s))).join('<br>')}</p>
    ${button(`${SITE_URL}/admin`, 'לבדיקה ואישור · Review and approve')}`);

  for (const a of admins ?? []) {
    await sendEmail(a.email, `בקשה חדשה: משפחת ${board.family_name} · New meal request`, html);
  }
  return json({ ok: true });
});
