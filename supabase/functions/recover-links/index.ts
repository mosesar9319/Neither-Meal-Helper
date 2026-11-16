// Emails an organizer the management links for every board opened with their email.
// Always answers "ok", so nobody can use it to learn which emails have boards.
import { admin, appUrl, cors, json, sendEmail } from '../_shared/common.ts';
import { esc, idempotencyKey, isEmail, layout, shortHash } from '../_shared/logic.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let email: unknown;
  try {
    ({ email } = await req.json());
  } catch {
    return json({ ok: true });
  }
  if (typeof email !== 'string' || !isEmail(email)) return json({ ok: true });
  const normalized = email.trim();

  let db: ReturnType<typeof admin>;
  try {
    db = admin();
  } catch (err) {
    console.error('recover-links', err);
    return json({ ok: true });
  }

  // Exact case-insensitive match in SQL. A "%" or "_" in the address cannot widen it.
  const { data: rows, error } = await db.rpc('meal_organizer_board_ids', { p_email: normalized });
  if (error) {
    console.error('recover-links lookup failed', error.message);
    return json({ ok: true });
  }
  const ids = ((rows ?? []) as { board_id: string }[]).map((r) => r.board_id).filter(Boolean);
  if (!ids.length) return json({ ok: true });

  const [{ data: boards }, { data: owners }] = await Promise.all([
    db.from('meal_boards').select('id, family_name, start_date').in('id', ids),
    db.from('meal_managers').select('board_id, token').in('board_id', ids).eq('role', 'owner'),
  ]);
  const tokenFor = new Map((owners ?? []).map((m) => [m.board_id as string, m.token as string]));
  const base = appUrl();
  if (!base) console.error('recover-links: APP_URL is empty, so the links are not absolute');
  const items = (boards ?? [])
    .filter((b) => tokenFor.has(b.id))
    .map((b) => {
      const href = base ? `${base}/m/${tokenFor.get(b.id)}` : '';
      const label = `${esc(b.family_name)} · ${esc(b.start_date)}`;
      return href ? `<li><a href="${esc(href)}">${label}</a></li>` : `<li>${label}</li>`;
    })
    .join('');
  if (!items) return json({ ok: true });

  // Same boards within 24 hours collapse to one send. A new board changes the key.
  const listKey = await shortHash([...ids].sort().join(','));
  await sendEmail(
    normalized,
    'קישורי הניהול שלך · Your meal board links',
    layout(`
      <h2>קישורי הניהול שלך · Your management links</h2>
      <p>שמרו אותם לעצמכם — כל מי שמחזיק קישור יכול לנהל את הלוח.<br>Keep these private — anyone with a link can manage the board.</p>
      <ul>${items}</ul>
      <p style="color:#6E6359">לא ביקשת? אפשר להתעלם. · Didn't ask for this? You can ignore it.</p>`),
    idempotencyKey(['recover-links', normalized.toLowerCase(), listKey]),
  );
  return json({ ok: true });
});
