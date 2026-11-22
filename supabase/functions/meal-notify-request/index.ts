// Emails every admin about a new meal request that waits for approval.
// Called by the app right after a request is sent, with the organizer's own
// management token, so only the requester can trigger it. The request is claimed
// (admins_notified_at) before sending and released if every send fails.
import { admin, button, cors, esc, idempotencyKey, json, layout, pageUrl, sendEmail, siteUrl, slotLabel } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const { manageToken } = await req.json().catch(() => ({}));
  if (typeof manageToken !== 'string' || manageToken.length < 16 || manageToken.length > 200) return json({ ok: true });

  let db: ReturnType<typeof admin>;
  try {
    db = admin();
  } catch (err) {
    console.error('meal-notify-request', err);
    return json({ error: 'config' }, 500);
  }

  const { data: m } = await db.from('meal_managers').select('board_id').eq('token', manageToken).eq('role', 'owner').maybeSingle();
  if (!m) return json({ ok: true });

  const claimedAt = new Date().toISOString();
  const { data: board } = await db
    .from('meal_boards')
    .update({ admins_notified_at: claimedAt })
    .eq('id', m.board_id)
    .eq('status', 'pending')
    .is('admins_notified_at', null)
    .select('id, family_name, start_date, end_date, slots, details')
    .maybeSingle();
  if (!board) return json({ ok: true });

  const { data: admins } = await db.from('meal_admins').select('email');
  const organizer = board.details?.organizerName ? ` · ${board.details.organizerName}` : '';
  const html = layout(`
    <h2>בקשה חדשה ממתינה לאישור · A new meal request is waiting</h2>
    <p><b>משפחת ${esc(board.family_name)} · ${esc(board.family_name)} family</b>${esc(organizer)}</p>
    <p>${esc(board.start_date)} – ${esc(board.end_date)}</p>
    <p>${(board.slots ?? []).map((s: string) => esc(slotLabel(s))).join('<br>')}</p>
    ${button(pageUrl(siteUrl(), '/admin'), 'לבדיקה ואישור · Review and approve')}`);

  // claimedAt is part of the key, so a request resubmitted after a decline notifies again.
  const results = await Promise.all(
    (admins ?? []).map((a) =>
      sendEmail(a.email, `בקשה חדשה: משפחת ${board.family_name} · New meal request`, html, idempotencyKey(['meal-request', board.id, claimedAt, a.email])),
    ),
  );
  if (!results.some(Boolean)) {
    await db.from('meal_boards').update({ admins_notified_at: null }).eq('id', board.id).eq('admins_notified_at', claimedAt);
  }
  return json({ ok: true });
});
