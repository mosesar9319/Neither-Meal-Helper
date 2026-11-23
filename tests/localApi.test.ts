import { beforeEach, describe, expect, it } from 'vitest';
import { localApi, resetLocalDb } from '../src/lib/api/local';
import { ApiError } from '../src/lib/api/types';
import { addDays, todayISO } from '../src/lib/dates';
import { defaultDetails, type BoardInput } from '../src/lib/types';

const start = addDays(todayISO(), 1);
const input = (): BoardInput => ({
  familyName: '  Cohen ',
  startDate: start,
  endDate: addDays(start, 6),
  slots: ['dinner', 'lunch'],
  perSlot: 1,
  details: { ...defaultDetails(), skipShabbat: false, skipHolidays: false, manualBlocked: [addDays(start, 2)] },
  private: { address: '12 Oak St', instructions: '', phone: '050', organizerEmail: 'org@example.com' },
});
const contact = { name: 'Rivka Levi', phone: '052', email: 'rivka@example.com', dish: 'Soup', note: '' };

async function code(p: Promise<unknown>) {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof ApiError ? e.code : 'other';
  }
}

describe('local demo API', () => {
  beforeEach(() => resetLocalDb());

  it('runs the whole board lifecycle with the same rules as the database', async () => {
    const { slug, manageToken } = await localApi.createBoard(input());

    // New requests wait for an admin and stay hidden until approved.
    expect((await localApi.getManage(manageToken)).board.status).toBe('pending');
    expect(await code(localApi.getPublicBoard(slug))).toBe('not_found');
    expect(await code(localApi.signUp(slug, { ...contact, date: start, slot: 'dinner' }))).toBe('not_found');
    expect((await localApi.admin.listRequests('pending')).map((r) => r.slug)).toEqual([slug]);
    await localApi.admin.review(slug, 'declined', 'Missing address');
    expect((await localApi.getManage(manageToken)).board.reviewNote).toBe('Missing address');
    await localApi.updateBoard(manageToken, input()); // editing a declined request resubmits it
    expect((await localApi.getManage(manageToken)).board.status).toBe('pending');
    await localApi.admin.review(slug, 'approved', '');

    const pub = await localApi.getPublicBoard(slug);
    expect(pub.board.familyName).toBe('Cohen');
    expect(pub.board.slots).toEqual(['lunch', 'dinner']);
    expect(pub.board.blockedDates).toEqual([addDays(start, 2)]);
    expect(JSON.stringify(pub)).not.toContain('Oak St');

    const r = await localApi.signUp(slug, { ...contact, date: start, slot: 'dinner' });
    expect(r.private.address).toBe('12 Oak St');
    expect(JSON.stringify(r)).not.toContain('org@example.com');

    expect(await code(localApi.signUp(slug, { ...contact, date: start, slot: 'dinner' }))).toBe('slot_full');
    expect(await code(localApi.signUp(slug, { ...contact, date: addDays(start, 2), slot: 'lunch' }))).toBe('day_closed');
    expect(await code(localApi.signUp(slug, { ...contact, date: start, slot: 'breakfast' }))).toBe('day_closed');
    expect(await code(localApi.signUp(slug, { ...contact, phone: ' ', date: start, slot: 'lunch' }))).toBe('invalid');
    expect(await code(localApi.signUp(slug, { ...contact, email: '', date: start, slot: 'lunch' }))).toBe('invalid');
    expect(await code(localApi.signUp(slug, { ...contact, email: 'nope', date: start, slot: 'lunch' }))).toBe('invalid');

    const after = await localApi.getPublicBoard(slug);
    expect(after.signups[0].name).toBe('Rivka');
    expect(JSON.stringify(after)).not.toContain('052');

    await localApi.updateMySignup(r.editToken, { ...contact, dish: 'Lasagna' });
    expect((await localApi.getMySignup(r.editToken)).signup.dish).toBe('Lasagna');

    const m = await localApi.getManage(manageToken);
    expect(m.private.organizerEmail).toBe('org@example.com');
    expect(m.signups[0].phone).toBe('052');

    const { token: co } = await localApi.addManager(manageToken, 'Yossi');
    expect((await localApi.getManage(co)).me.role).toBe('co');
    expect(await code(localApi.deleteBoard(co))).toBe('forbidden');
    expect(await code(localApi.addManager(co, 'X'))).toBe('forbidden');

    await localApi.cancelMySignup(r.editToken);
    expect(await code(localApi.getMySignup(r.editToken))).toBe('not_found');

    await localApi.deleteBoard(manageToken);
    expect(await code(localApi.getPublicBoard(slug))).toBe('not_found');
  });

  it('lets admins move and remove sign-ups', async () => {
    const { slug } = await localApi.createBoard(input());
    await localApi.admin.review(slug, 'approved', '');
    const a = await localApi.signUp(slug, { ...contact, date: start, slot: 'dinner' });
    await localApi.signUp(slug, { ...contact, date: addDays(start, 1), slot: 'dinner' });

    const list = await localApi.admin.listSignups(slug);
    expect(list.map((s) => s.date)).toEqual([start, addDays(start, 1)]);
    expect(list[0].phone).toBe('052');
    expect(JSON.stringify(list)).not.toContain(a.editToken);

    await localApi.admin.moveSignup(a.signupId, addDays(start, 3), 'lunch', false);
    expect((await localApi.admin.listSignups(slug)).find((s) => s.id === a.signupId)).toMatchObject({ date: addDays(start, 3), slot: 'lunch' });
    expect(await code(localApi.admin.moveSignup(a.signupId, addDays(start, 1), 'dinner', false))).toBe('slot_full');
    expect(await code(localApi.admin.moveSignup(a.signupId, addDays(start, 1), 'dinner', true))).toBe('ok');
    expect(await code(localApi.admin.moveSignup(a.signupId, addDays(start, 30), 'dinner', true))).toBe('invalid');
    expect(await code(localApi.admin.moveSignup(a.signupId, start, 'breakfast', true))).toBe('invalid');

    await localApi.admin.removeSignup(a.signupId);
    expect(await localApi.admin.listSignups(slug)).toHaveLength(1);
    expect(await code(localApi.admin.removeSignup(a.signupId))).toBe('not_found');
  });

  it('rejects bad boards', async () => {
    expect(await code(localApi.createBoard({ ...input(), familyName: ' ' }))).toBe('invalid');
    expect(await code(localApi.createBoard({ ...input(), endDate: addDays(start, -1) }))).toBe('invalid');
    expect(await code(localApi.createBoard({ ...input(), endDate: addDays(start, 200) }))).toBe('invalid');
    expect(await code(localApi.createBoard({ ...input(), slots: [] }))).toBe('invalid');
  });
});
