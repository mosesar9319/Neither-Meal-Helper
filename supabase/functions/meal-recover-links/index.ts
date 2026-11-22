// Emails an organizer the management links for every board opened with their email.
// Always answers "ok", so nobody can use it to learn which emails have boards.
import { SITE_URL, admin, cors, esc, json, layout, sendEmail } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return json({ ok: true });

  const db = admin();
  // Case-insensitive exact match: escape LIKE wildcards so "%" or "_" can't widen it.
  const pattern = email.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: rows } = await db.from('meal_board_private').select('board_id').ilike('organizer_email', pattern).limit(30);
  const ids = (rows ?? []).map((r) => r.board_id);
  if (!ids.length) return json({ ok: true });

  const [{ data: boards }, { data: owners }] = await Promise.all([
    db.from('meal_boards').select('id, family_name, start_date').in('id', ids),
    db.from('meal_managers').select('board_id, token').in('board_id', ids).eq('role', 'owner'),
  ]);
  const tokenFor = new Map((owners ?? []).map((m) => [m.board_id, m.token]));
  const items = (boards ?? [])
    .filter((b) => tokenFor.has(b.id))
    .map((b) => `<li><a href="${esc(`${SITE_URL}/m/${tokenFor.get(b.id)}`)}">${esc(b.family_name)}</a> · ${esc(b.start_date)}</li>`)
    .join('');

  await sendEmail(
    email.trim(),
    'קישורי הניהול שלך · Your meal board links',
    layout(`
      <h2>קישורי הניהול שלך · Your management links</h2>
      <p>שמרו אותם לעצמכם — כל מי שמחזיק קישור יכול לנהל את הלוח.<br>Keep these private — anyone with a link can manage the board.</p>
      <ul>${items}</ul>
      <p style="color:#6D6480">לא ביקשת? אפשר להתעלם. · Didn't ask for this? You can ignore it.</p>`),
  );
  return json({ ok: true });
});
