// Daily job: emails every neighbor who is cooking tomorrow (Israel time).
// Called by pg_cron (supabase/setup/meal_reminder_schedule.sql) with a secret kept
// in Supabase Vault; meal_check_cron_secret verifies it.
//
// Each sign-up is claimed (reminder_sent_at set) before sending and released if the
// send fails, so a rerun retries only what failed. Resend's Idempotency-Key makes
// a retried send a no-op if the first one actually went through.
//
// POST {"dryRun": true} reports who would be reminded without claiming or sending.
import {
  admin,
  bearer,
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
  tomorrowInIsrael,
  type DeliveryDetails,
} from '../_shared/common.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let db: ReturnType<typeof admin>;
  try {
    db = admin();
  } catch (err) {
    console.error('meal-send-reminders', err);
    return json({ error: 'config' }, 500);
  }
  const { data: allowed } = await db.rpc('meal_check_cron_secret', { p_secret: bearer(req.headers.get('authorization')) });
  if (allowed !== true) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;
  const day = tomorrowInIsrael();
  const base = siteUrl();
  if (!base) console.error('meal-send-reminders: MEAL_SITE_URL is empty, so the email has no links');

  const { data: rows, error } = await db
    .from('meal_signups')
    .select('id, board_id, meal_date, slot, name, email, dish, edit_token')
    .eq('meal_date', day)
    .is('reminder_sent_at', null)
    .neq('email', '')
    .order('id')
    .limit(1000);
  if (error) return json({ error: error.message }, 500);

  const boards = new Map<string, { family_name: string; details: DeliveryDetails; status: string; priv: Record<string, string> } | null>();
  async function boardFor(id: string) {
    if (!boards.has(id)) {
      const [{ data: b }, { data: p }] = await Promise.all([
        db.from('meal_boards').select('family_name, details, status').eq('id', id).maybeSingle(),
        db.from('meal_board_private').select('address, instructions, phone').eq('board_id', id).maybeSingle(),
      ]);
      boards.set(id, b && p ? { family_name: b.family_name, details: (b.details ?? {}) as DeliveryDetails, status: b.status, priv: p } : null);
    }
    return boards.get(id) ?? null;
  }

  let sent = 0;
  let failed = 0;
  const wouldSend: string[] = [];

  for (const row of (rows ?? []) as ReminderRow[]) {
    const board = await boardFor(row.board_id);
    // No reminders for a board an admin has taken down.
    if (!board || board.status !== 'approved') continue;
    if (!isEmail(row.email)) {
      // Left unclaimed, so a corrected address can still be reminded on a rerun.
      console.error('meal-send-reminders skipped invalid email', row.id);
      failed++;
      continue;
    }
    if (dryRun) {
      wouldSend.push(row.id);
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
      console.error('meal-send-reminders claim failed', claimError.message);
      return json({ error: claimError.message }, 500);
    }
    if (!claimed) continue; // another run took it

    const window = deliveryWindow(row.meal_date, board.details);
    const ok = await sendEmail(
      row.email,
      `תזכורת: מחר מבשלים למשפחת ${board.family_name} · Reminder: you're cooking tomorrow`,
      layout(`
        <h2>תזכורת קטנה, ${esc(row.name)} 🍲 · A friendly reminder</h2>
        <p><b>${esc(dateLabel(row.meal_date))} · ${esc(slotLabel(row.slot))}</b></p>
        ${row.dish ? `<p>${esc(row.dish)}</p>` : ''}
        ${window ? `<p>🕔 ${esc(window)}</p>` : ''}
        <p>📍 ${esc(board.priv.address)}</p>
        ${board.priv.instructions ? `<p>📝 ${esc(board.priv.instructions)}</p>` : ''}
        ${board.priv.phone ? `<p dir="ltr">📞 ${esc(board.priv.phone)}</p>` : ''}
        ${button(pageUrl(base, `/s/${row.edit_token}`), 'עריכה או ביטול · Edit or cancel')}`),
      idempotencyKey(['meal-reminder', row.id, row.meal_date]),
    );
    if (ok) {
      sent++;
    } else {
      failed++;
      await db.from('meal_signups').update({ reminder_sent_at: null }).eq('id', row.id).eq('reminder_sent_at', claimedAt);
    }
  }

  return json(dryRun ? { ok: true, dryRun: true, day, wouldSend: wouldSend.length, failed } : { ok: true, day, sent, failed });
});
