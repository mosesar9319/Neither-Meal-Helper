// Emails the organizer when an admin approves or declines their request.
// Only a signed-in admin can trigger it: the caller's session token is checked
// against Supabase Auth and the meal_admins list.
import { SITE_URL, admin, button, cors, esc, json, layout, sendEmail } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { slug } = await req.json().catch(() => ({}));
  if (!jwt || typeof slug !== 'string') return json({ error: 'unauthorized' }, 401);

  const db = admin();
  const { data: userData } = await db.auth.getUser(jwt);
  const user = userData?.user;
  if (!user?.email || !user.email_confirmed_at) return json({ error: 'unauthorized' }, 401);
  const { data: isAdmin } = await db.from('meal_admins').select('email').eq('email', user.email.toLowerCase()).maybeSingle();
  if (!isAdmin) return json({ error: 'forbidden' }, 403);

  const { data: board } = await db.from('meal_boards').select('id, slug, family_name, status, review_note').eq('slug', slug).maybeSingle();
  if (!board || board.status === 'pending') return json({ ok: true });
  const [{ data: priv }, { data: owner }] = await Promise.all([
    db.from('meal_board_private').select('organizer_email').eq('board_id', board.id).single(),
    db.from('meal_managers').select('token').eq('board_id', board.id).eq('role', 'owner').maybeSingle(),
  ]);
  if (!priv?.organizer_email || !owner) return json({ ok: true });

  const manageUrl = `${SITE_URL}/m/${owner.token}`;
  if (board.status === 'approved') {
    await sendEmail(
      priv.organizer_email,
      `הבקשה אושרה: משפחת ${board.family_name} · Your meal board was approved`,
      layout(`
        <h2>הבקשה אושרה! · Your request was approved</h2>
        <p>אפשר לשתף עכשיו את הקישור עם השכנים. · You can now share the link with neighbors.</p>
        <p dir="ltr">${esc(`${SITE_URL}/b/${board.slug}`)}</p>
        ${button(manageUrl, 'לדף המארגנים · Organizer page')}`),
    );
  } else {
    await sendEmail(
      priv.organizer_email,
      `לגבי הבקשה למשפחת ${board.family_name} · About your meal request`,
      layout(`
        <h2>הבקשה לא אושרה · Your request wasn't approved</h2>
        ${board.review_note ? `<p><b>הערה מהמנהלים · Note:</b> ${esc(board.review_note)}</p>` : ''}
        <p>אפשר לעדכן את הפרטים ולשמור כדי לשלוח שוב. · You can update the details and save to send it again.</p>
        ${button(manageUrl, 'לדף המארגנים · Organizer page')}`),
    );
  }
  return json({ ok: true });
});
