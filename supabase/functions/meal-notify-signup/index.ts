// Emails the organizer about a new sign-up, and the neighbor a confirmation.
// Called by the app right after a sign-up, with the neighbor's own edit token,
// so only the person who signed up can trigger it. The sign-up is claimed
// (notified_at) before sending and released if every send fails.
import {
  admin,
  button,
  cors,
  dateLabel,
  deliveryWindow,
  esc,
  idempotencyKey,
  isEmail,
  json,
  layout,
  pageUrl,
  sendEmail,
  siteUrl,
  slotLabel,
  type DeliveryDetails,
} from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const { editToken } = await req.json().catch(() => ({}));
  if (typeof editToken !== 'string' || editToken.length < 16 || editToken.length > 200) return json({ ok: true });

  let db: ReturnType<typeof admin>;
  try {
    db = admin();
  } catch (err) {
    console.error('meal-notify-signup', err);
    return json({ error: 'config' }, 500);
  }

  const claimedAt = new Date().toISOString();
  const { data: s, error } = await db
    .from('meal_signups')
    .update({ notified_at: claimedAt })
    .eq('edit_token', editToken)
    .is('notified_at', null)
    .select('id, board_id, meal_date, slot, name, phone, email, dish, note')
    .maybeSingle();
  if (error) {
    console.error('meal-notify-signup claim failed', error.message);
    return json({ error: 'claim' }, 500);
  }
  if (!s) return json({ ok: true });
  const release = () => db.from('meal_signups').update({ notified_at: null }).eq('id', s.id).eq('notified_at', claimedAt);

  const [{ data: board }, { data: priv }, { data: owner }] = await Promise.all([
    db.from('meal_boards').select('slug, family_name, details').eq('id', s.board_id).maybeSingle(),
    db.from('meal_board_private').select('address, instructions, phone, organizer_email').eq('board_id', s.board_id).maybeSingle(),
    db.from('meal_managers').select('token').eq('board_id', s.board_id).eq('role', 'owner').maybeSingle(),
  ]);
  if (!board || !priv) {
    await release();
    return json({ ok: true });
  }

  const base = siteUrl();
  const when = `${dateLabel(s.meal_date)} · ${slotLabel(s.slot)}`;
  const window = deliveryWindow(s.meal_date, (board.details ?? {}) as DeliveryDetails);
  const jobs: Promise<boolean>[] = [];

  if (isEmail(priv.organizer_email ?? '') && owner) {
    jobs.push(
      sendEmail(
        priv.organizer_email,
        `הרשמה חדשה: ${s.name} · New sign-up for the ${board.family_name} family`,
        layout(`
        <h2>${esc(s.name)} נרשם/ה לבשל · signed up to cook</h2>
        <p><b>${esc(when)}</b></p>
        ${s.dish ? `<p>🍲 ${esc(s.dish)}</p>` : ''}
        ${s.note ? `<p>💬 ${esc(s.note)}</p>` : ''}
        <p dir="ltr">📞 ${esc(s.phone)}</p>
        ${button(pageUrl(base, `/m/${owner.token}`), 'ניהול הלוח · Manage board')}`),
        idempotencyKey(['meal-signup-organizer', s.id]),
      ),
    );
  }

  if (isEmail(s.email ?? '')) {
    jobs.push(
      sendEmail(
        s.email,
        `תודה! ${when} · Thank you for cooking for the ${board.family_name} family`,
        layout(`
        <h2>תודה רבה, ${esc(s.name)}! · Thank you!</h2>
        <p><b>${esc(when)}</b></p>
        ${window ? `<p>🕔 ${esc(window)}</p>` : ''}
        <p>📍 ${esc(priv.address)}</p>
        ${priv.instructions ? `<p>📝 ${esc(priv.instructions)}</p>` : ''}
        ${priv.phone ? `<p dir="ltr">📞 ${esc(priv.phone)}</p>` : ''}
        <p>נשלח לך תזכורת בערב שלפני. · We'll remind you the evening before.</p>
        ${button(pageUrl(base, `/s/${editToken}`), 'עריכה או ביטול · Edit or cancel')}`),
        idempotencyKey(['meal-signup-neighbor', s.id]),
      ),
    );
  }

  const results = await Promise.all(jobs);
  // If nothing went out, release the claim so a retry can try again.
  if (jobs.length && !results.some(Boolean)) await release();
  return json({ ok: true });
});
