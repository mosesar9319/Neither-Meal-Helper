// Emails the organizer about a new sign-up, and the neighbor a confirmation.
// Called by the app right after a sign-up, with the neighbor's own edit token,
// so only the person who signed up can trigger it, and only once.
import { SITE_URL, admin, button, cors, dateLabel, deliveryWindow, esc, json, layout, sendEmail, slotLabel } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const { editToken } = await req.json().catch(() => ({}));
  if (typeof editToken !== 'string' || editToken.length < 16) return json({ ok: true });

  const db = admin();
  // Claim the sign-up atomically so repeated calls send nothing.
  const { data: s } = await db
    .from('signups')
    .update({ notified_at: new Date().toISOString() })
    .eq('edit_token', editToken)
    .is('notified_at', null)
    .select('id, board_id, meal_date, slot, name, phone, email, dish, note')
    .maybeSingle();
  if (!s) return json({ ok: true });

  const [{ data: board }, { data: priv }, { data: owner }] = await Promise.all([
    db.from('boards').select('slug, family_name, details').eq('id', s.board_id).single(),
    db.from('board_private').select('address, instructions, phone, organizer_email').eq('board_id', s.board_id).single(),
    db.from('managers').select('token').eq('board_id', s.board_id).eq('role', 'owner').maybeSingle(),
  ]);
  if (!board || !priv) return json({ ok: true });

  const when = `${dateLabel(s.meal_date)} · ${slotLabel(s.slot)}`;

  if (priv.organizer_email && owner) {
    await sendEmail(
      priv.organizer_email,
      `הרשמה חדשה: ${s.name} · New sign-up for the ${board.family_name} family`,
      layout(`
        <h2>${esc(s.name)} נרשם/ה לבשל · signed up to cook</h2>
        <p><b>${esc(when)}</b></p>
        ${s.dish ? `<p>🍲 ${esc(s.dish)}</p>` : ''}
        ${s.note ? `<p>💬 ${esc(s.note)}</p>` : ''}
        <p dir="ltr">📞 ${esc(s.phone)}</p>
        ${button(`${SITE_URL}/m/${owner.token}`, 'ניהול הלוח · Manage board')}`),
    );
  }

  if (s.email) {
    await sendEmail(
      s.email,
      `תודה! ${when} · Thank you for cooking for the ${board.family_name} family`,
      layout(`
        <h2>תודה רבה, ${esc(s.name)}! · Thank you!</h2>
        <p><b>${esc(when)}</b></p>
        <p>🕔 ${esc(deliveryWindow(s.meal_date, board.details ?? {}))}</p>
        <p>📍 ${esc(priv.address)}</p>
        ${priv.instructions ? `<p>📝 ${esc(priv.instructions)}</p>` : ''}
        ${priv.phone ? `<p dir="ltr">📞 ${esc(priv.phone)}</p>` : ''}
        <p>נשלח לך תזכורת יום לפני. · We'll remind you the day before.</p>
        ${button(`${SITE_URL}/s/${editToken}`, 'עריכה או ביטול · Edit or cancel')}`),
    );
  }

  return json({ ok: true });
});
