// Emails an organizer the management links for every board opened with their email.
// Always answers "ok", so nobody can use it to learn which emails have boards.
import { admin, cors, esc, idempotencyKey, isEmail, json, layout, pageUrl, sendEmail, shortHash, siteUrl } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || !isEmail(email)) return json({ ok: true });
  const normalized = email.trim().toLowerCase();

  let db: ReturnType<typeof admin>;
  try {
    db = admin();
  } catch (err) {
    console.error('meal-recover-links', err);
    return json({ ok: true });
  }

  // Exact, case-insensitive match in SQL: "%" or "_" in the address can't widen it.
  const { data: rows, error } = await db.rpc('meal_organizer_board_ids', { p_email: normalized });
  if (error) {
    console.error('meal-recover-links lookup failed', error.message);
    return json({ ok: true });
  }
  const ids = ((rows ?? []) as { board_id: string }[]).map((r) => r.board_id).filter(Boolean);
  if (!ids.length) return json({ ok: true });

  const [{ data: boards }, { data: owners }] = await Promise.all([
    db.from('meal_boards').select('id, family_name, start_date').in('id', ids),
    db.from('meal_managers').select('board_id, token').in('board_id', ids).eq('role', 'owner'),
  ]);
  const tokenFor = new Map((owners ?? []).map((m) => [m.board_id as string, m.token as string]));
  const base = siteUrl();
  const items = (boards ?? [])
    .filter((b) => tokenFor.has(b.id))
    .map((b) => {
      const href = pageUrl(base, `/m/${tokenFor.get(b.id)}`);
      const label = `${esc(b.family_name)} · ${esc(b.start_date)}`;
      return href ? `<li><a href="${esc(href)}">${label}</a></li>` : `<li>${label}</li>`;
    })
    .join('');
  if (!items) return json({ ok: true });

  // The same set of boards collapses to one email per day; a new board changes the key.
  const day = new Date().toISOString().slice(0, 10);
  const listKey = await shortHash([...ids].sort().join(','));
  await sendEmail(
    normalized,
    'קישורי הניהול שלך · Your meal board links',
    layout(`
      <h2>קישורי הניהול שלך · Your management links</h2>
      <p>שמרו אותם לעצמכם — כל מי שמחזיק קישור יכול לנהל את הלוח.<br>Keep these private — anyone with a link can manage the board.</p>
      <ul>${items}</ul>
      <p style="color:#6D6480">לא ביקשת? אפשר להתעלם. · Didn't ask for this? You can ignore it.</p>`),
    idempotencyKey(['meal-recover', normalized, listKey, day]),
  );
  return json({ ok: true });
});
