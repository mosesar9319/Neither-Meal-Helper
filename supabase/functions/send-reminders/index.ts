// Daily job: emails every neighbor who is cooking tomorrow (Israel time).
// Deployed with verify_jwt = false. Callers must send CRON_SECRET
// (Authorization: Bearer <CRON_SECRET>, or the x-cron-secret / apikey header).
// Schedule: 06:00 UTC daily (`0 6 * * *`), which is 08:00 or 09:00 in Israel.
import { admin, appUrl, cors, json, sendEmail } from '../_shared/common.ts';
import {
  button,
  cronAuthorized,
  dateLabel,
  deliveryWindow,
  esc,
  idempotencyKey,
  isEmail,
  layout,
  pageUrl,
  slotLabel,
  tomorrowInIsrael,
  type DeliveryDetails,
} from '../_shared/logic.ts';

interface ReminderRow {
  id: string;
  board_id: string;
  meal_date: string;
  slot: string;
  name: string;
  email: string;
  dish: string;
  edit_token: string;
}

const PAGE = 100;
const MAX = 2000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!cronAuthorized(
    {
      authorization: req.headers.get('authorization'),
      cronSecret: req.headers.get('x-cron-secret'),
      apiKey: req.headers.get('apikey'),
    },
    Deno.env.get('CRON_SECRET'),
  )) {
    return json({ error: 'unauthorized' }, 401);
  }

  let db: ReturnType<typeof admin>;
  try {
    db = admin();
  } catch (err) {
    console.error('send-reminders', err);
    return json({ error: 'config' }, 500);
  }

  const day = tomorrowInIsrael();
  const base = appUrl();
  if (!base) console.error('send-reminders: APP_URL is empty, so the email has no links');
  const failed = new Set<string>();
  let sent = 0;

  // The cap stops a row that fails and is released from being selected forever.
  for (let page = 0; page < 30 && sent + failed.size < MAX; page++) {
    let query = db
      .from('meal_signups')
      .select('id, board_id, meal_date, slot, name, email, dish, edit_token')
      .eq('meal_date', day)
      .is('reminder_sent_at', null)
      .neq('email', '')
      .order('id')
      .limit(PAGE);
    if (failed.size) query = query.not('id', 'in', `(${[...failed].join(',')})`);
    const { data: rows, error } = await query;
    if (error) return json({ error: error.message }, 500);
    if (!rows?.length) break;

    for (const row of rows as ReminderRow[]) {
      if (!isEmail(row.email)) {
        // Leave reminder_sent_at empty so a corrected address can still be mailed.
        // Remember the id so this invocation does not select the row again.
        console.error('send-reminders skipped invalid email', row.id);
        failed.add(row.id);
        continue;
      }

      const claimedAt = new Date().toISOString();
      const { data: claimed, error: claimError } = await db
        .from('meal_signups')
        .update({ reminder_sent_at: claimedAt })
        .eq('id', row.id)
        .is('reminder_sent_at', null)
        .select('id')
        .maybeSingle();
      if (claimError) {
        console.error('send-reminders claim failed', claimError.message);
        return json({ error: claimError.message }, 500);
      }
      if (!claimed) continue;

      try {
        const [{ data: board }, { data: priv }] = await Promise.all([
          db.from('meal_boards').select('family_name, details').eq('id', row.board_id).single(),
          db.from('meal_board_private').select('address, instructions, phone').eq('board_id', row.board_id).single(),
        ]);
        if (!board || !priv) {
          failed.add(row.id);
          await db.from('meal_signups').update({ reminder_sent_at: null }).eq('id', row.id).eq('reminder_sent_at', claimedAt);
          continue;
        }

        const details = (board.details && typeof board.details === 'object' ? board.details : {}) as DeliveryDetails;
        const window = deliveryWindow(row.meal_date, details);
        const ok = await sendEmail(
          row.email,
          `תזכורת: מחר מבשלים למשפחת ${board.family_name} · Reminder: you're cooking tomorrow`,
          layout(`
        <h2>תזכורת קטנה, ${esc(row.name)} 🍲 · A friendly reminder</h2>
        <p><b>${esc(dateLabel(row.meal_date))} · ${esc(slotLabel(row.slot))}</b></p>
        ${row.dish ? `<p>${esc(row.dish)}</p>` : ''}
        ${window ? `<p>🕔 ${esc(window)}</p>` : ''}
        <p>📍 ${esc(priv.address)}</p>
        ${priv.instructions ? `<p>📝 ${esc(priv.instructions)}</p>` : ''}
        ${priv.phone ? `<p dir="ltr">📞 ${esc(priv.phone)}</p>` : ''}
        ${button(pageUrl(base, `/s/${row.edit_token}`), 'עריכה או ביטול · Edit or cancel')}`),
          idempotencyKey(['reminder', row.id, row.meal_date]),
        );
        if (!ok) {
          failed.add(row.id);
          await db.from('meal_signups').update({ reminder_sent_at: null }).eq('id', row.id).eq('reminder_sent_at', claimedAt);
        } else {
          sent++;
        }
      } catch (err) {
        console.error('send-reminders row failed', row.id, err);
        failed.add(row.id);
        await db.from('meal_signups').update({ reminder_sent_at: null }).eq('id', row.id).eq('reminder_sent_at', claimedAt);
      }
    }

    if (rows.length < PAGE) break;
  }

  return json({ ok: true, day, sent, failed: failed.size });
});
