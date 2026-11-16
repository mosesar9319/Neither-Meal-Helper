// Daily job: emails every neighbor who is cooking tomorrow (Israel time).
// Run it on a schedule with the header `Authorization: Bearer <CRON_SECRET>`.
import { SITE_URL, admin, button, cors, dateLabel, deliveryWindow, esc, json, layout, sendEmail, slotLabel } from '../_shared/common.ts';

function tomorrowInIsrael(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(Date.now() + 86_400_000),
  );
  return parts; // en-CA formats as YYYY-MM-DD
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);

  const db = admin();
  const day = tomorrowInIsrael();
  const { data: rows, error } = await db
    .from('meal_signups')
    .select('id, board_id, meal_date, slot, name, email, dish, edit_token')
    .eq('meal_date', day)
    .is('reminder_sent_at', null)
    .neq('email', '')
    .limit(500);
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  for (const s of rows ?? []) {
    const [{ data: board }, { data: priv }] = await Promise.all([
      db.from('meal_boards').select('family_name, details').eq('id', s.board_id).single(),
      db.from('meal_board_private').select('address, instructions, phone').eq('board_id', s.board_id).single(),
    ]);
    if (!board || !priv) continue;
    const ok = await sendEmail(
      s.email,
      `תזכורת: מחר מבשלים למשפחת ${board.family_name} · Reminder: you're cooking tomorrow`,
      layout(`
        <h2>תזכורת קטנה, ${esc(s.name)} 🍲 · A friendly reminder</h2>
        <p><b>${esc(dateLabel(s.meal_date))} · ${esc(slotLabel(s.slot))}</b></p>
        ${s.dish ? `<p>${esc(s.dish)}</p>` : ''}
        <p>🕔 ${esc(deliveryWindow(s.meal_date, board.details ?? {}))}</p>
        <p>📍 ${esc(priv.address)}</p>
        ${priv.instructions ? `<p>📝 ${esc(priv.instructions)}</p>` : ''}
        ${priv.phone ? `<p dir="ltr">📞 ${esc(priv.phone)}</p>` : ''}
        ${button(`${SITE_URL}/s/${s.edit_token}`, 'עריכה או ביטול · Edit or cancel')}`),
    );
    if (ok) {
      await db.from('meal_signups').update({ reminder_sent_at: new Date().toISOString() }).eq('id', s.id);
      sent++;
    }
  }
  return json({ ok: true, day, sent });
});
