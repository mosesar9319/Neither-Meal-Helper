// Emails the organizer about a new sign-up, and the neighbor a confirmation.
// Called by the app right after a sign-up, with the neighbor's own edit token,
// so only the person who signed up can trigger it, and only once.
import { admin, appUrl, cors, json, sendEmail } from '../_shared/common.ts';
import { button, dateLabel, deliveryWindow, esc, idempotencyKey, isEmail, layout, pageUrl, slotLabel, type DeliveryDetails } from '../_shared/logic.ts';

interface SignupRow {
  id: string;
  board_id: string;
  meal_date: string;
  slot: string;
  name: string;
  phone: string;
  email: string;
  dish: string;
  note: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let editToken: unknown;
  try {
    ({ editToken } = await req.json());
  } catch {
    return json({ ok: true });
  }
  if (typeof editToken !== 'string' || editToken.length < 16 || editToken.length > 200) return json({ ok: true });

  let db: ReturnType<typeof admin>;
  try {
    db = admin();
  } catch (err) {
    console.error('notify-signup', err);
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
    console.error('notify-signup claim failed', error.message);
    return json({ error: 'claim' }, 500);
  }
  if (!s) return json({ ok: true });
  const signup = s as SignupRow;

  const release = async () => {
    const { error: releaseError } = await db
      .from('meal_signups')
      .update({ notified_at: null })
      .eq('id', signup.id)
      .eq('notified_at', claimedAt);
    if (releaseError) console.error('notify-signup release failed', releaseError.message);
  };

  try {
    const [{ data: board }, { data: priv }, { data: owner }] = await Promise.all([
      db.from('meal_boards').select('slug, family_name, details').eq('id', signup.board_id).single(),
      db.from('meal_board_private').select('address, instructions, phone, organizer_email').eq('board_id', signup.board_id).single(),
      db.from('meal_managers').select('token').eq('board_id', signup.board_id).eq('role', 'owner').maybeSingle(),
    ]);
    if (!board || !priv) {
      await release();
      return json({ ok: true });
    }

    const details = (board.details && typeof board.details === 'object' ? board.details : {}) as DeliveryDetails;
    const when = `${dateLabel(signup.meal_date)} · ${slotLabel(signup.slot)}`;
    const base = appUrl();
    if (!base) console.error('notify-signup: APP_URL is empty, so the email has no links');
    const jobs: Promise<boolean>[] = [];

    if (isEmail(priv.organizer_email ?? '') && owner?.token) {
      jobs.push(
        sendEmail(
          priv.organizer_email,
          `הרשמה חדשה: ${signup.name} · New sign-up for the ${board.family_name} family`,
          layout(`
        <h2>${esc(signup.name)} נרשם/ה לבשל · signed up to cook</h2>
        <p><b>${esc(when)}</b></p>
        ${signup.dish ? `<p>🍲 ${esc(signup.dish)}</p>` : ''}
        ${signup.note ? `<p>💬 ${esc(signup.note)}</p>` : ''}
        <p dir="ltr">📞 ${esc(signup.phone)}</p>
        ${button(pageUrl(base, `/m/${owner.token}`), 'ניהול הלוח · Manage board')}`),
          idempotencyKey(['notify-organizer', signup.id]),
        ),
      );
    }

    if (isEmail(signup.email)) {
      const window = deliveryWindow(signup.meal_date, details);
      jobs.push(
        sendEmail(
          signup.email,
          `תודה! ${when} · Thank you for cooking for the ${board.family_name} family`,
          layout(`
        <h2>תודה רבה, ${esc(signup.name)}! · Thank you!</h2>
        <p><b>${esc(when)}</b></p>
        ${window ? `<p>🕔 ${esc(window)}</p>` : ''}
        <p>📍 ${esc(priv.address)}</p>
        ${priv.instructions ? `<p>📝 ${esc(priv.instructions)}</p>` : ''}
        ${priv.phone ? `<p dir="ltr">📞 ${esc(priv.phone)}</p>` : ''}
        <p>נשלח לך תזכורת יום לפני. · We'll remind you the day before.</p>
        ${button(pageUrl(base, `/s/${editToken}`), 'עריכה או ביטול · Edit or cancel')}`),
          idempotencyKey(['notify-neighbor', signup.id]),
        ),
      );
    }

    if (jobs.length === 0) return json({ ok: true });
    const results = await Promise.all(jobs);
    if (results.some((ok) => !ok)) {
      await release();
      return json({ ok: false }, 502);
    }
    return json({ ok: true });
  } catch (err) {
    console.error('notify-signup failed', err);
    await release();
    return json({ ok: false }, 500);
  }
});
