import { todayISO } from '../dates';
import type { AdminEntry, AdminRequest, Board, Manager, OrganizerPrivate, Signup, SignupInput } from '../types';
import { ApiError, type Api, type SignupEdit } from './types';
import { normalizeBoard, normalizeSignup, normalizeSignupEdit } from './validate';

/**
 * Demo mode: the same rules as the Supabase functions, kept in this browser.
 * Lets the app run and be tried out before a database is connected.
 */

interface ManagerRow extends Manager {
  token: string;
  seenAt: string;
}
interface SignupRow extends Signup {
  editToken: string;
}
interface BoardRow {
  board: Board;
  private: OrganizerPrivate;
  managers: ManagerRow[];
  signups: SignupRow[];
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string;
}
interface Db {
  boards: BoardRow[];
  admins?: AdminEntry[];
}

/** In demo mode the visitor is treated as a signed-in admin, so the approval flow can be tried. */
const DEMO_ADMIN = 'demo-admin@example.com';

const KEY = 'nmc.demoDb';
let memory: Db = { boards: [] };

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw);
  } catch {
    /* fall back to memory */
  }
  return memory;
}

function save(db: Db) {
  memory = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* memory only */
  }
}

export function randomToken(bytes = 18): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomSlug(): string {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const now = () => new Date().toISOString();
const strip = <T extends object, K extends keyof T>(o: T, ...keys: K[]): Omit<T, K> => {
  const copy = { ...o };
  for (const k of keys) delete copy[k];
  return copy;
};

function byManager(db: Db, token: string) {
  for (const row of db.boards) {
    const me = row.managers.find((m) => m.token === token);
    if (me) return { row, me };
  }
  throw new ApiError('not_found');
}

function bySignup(db: Db, editToken: string) {
  for (const row of db.boards) {
    const s = row.signups.find((x) => x.editToken === editToken);
    if (s) return { row, s };
  }
  throw new ApiError('not_found');
}

function checkSlot(row: BoardRow, input: Pick<SignupInput, 'date' | 'slot'>, ignoreId?: string) {
  const b = row.board;
  if (input.date < b.startDate || input.date > b.endDate || input.date < todayISO()) throw new ApiError('day_closed');
  if (b.blockedDates.includes(input.date) || !b.slots.includes(input.slot)) throw new ApiError('day_closed');
  const taken = row.signups.filter((s) => s.date === input.date && s.slot === input.slot && s.id !== ignoreId).length;
  if (taken >= b.perSlot) throw new ApiError('slot_full');
}

export const localApi: Api = {
  mode: 'local',
  emailEnabled: false,
  googleEnabled: false,

  async createBoard(input) {
    const db = load();
    const clean = normalizeBoard(input);
    const slug = randomSlug();
    const manageToken = randomToken();
    db.boards.push({
      createdAt: now(),
      reviewedAt: null,
      reviewedBy: '',
      board: {
        slug,
        status: 'pending',
        reviewNote: '',
        familyName: clean.familyName,
        startDate: clean.startDate,
        endDate: clean.endDate,
        slots: clean.slots,
        perSlot: clean.perSlot,
        blockedDates: clean.blockedDates,
        details: clean.details,
      },
      private: clean.private,
      managers: [{ id: randomSlug(), token: manageToken, name: clean.details.organizerName, role: 'owner', createdAt: now(), seenAt: now() }],
      signups: [],
    });
    save(db);
    return { slug, manageToken };
  },

  async getPublicBoard(slug) {
    const row = load().boards.find((r) => r.board.slug === slug && r.board.status === 'approved');
    if (!row) throw new ApiError('not_found');
    return {
      board: row.board,
      // first name only on the public board
      signups: row.signups.map((s) => ({ id: s.id, date: s.date, slot: s.slot, name: s.name.trim().split(' ')[0], dish: s.dish })),
    };
  },

  async signUp(slug, input) {
    const db = load();
    const row = db.boards.find((r) => r.board.slug === slug && r.board.status === 'approved');
    if (!row) throw new ApiError('not_found');
    const clean = normalizeSignup(input);
    checkSlot(row, clean);
    const editToken = randomToken();
    const id = randomSlug();
    row.signups.push({ ...clean, id, editToken, createdAt: now() });
    save(db);
    return { editToken, signupId: id, private: strip(row.private, 'organizerEmail') };
  },

  async getMySignup(editToken) {
    const { row, s } = bySignup(load(), editToken);
    return { board: row.board, private: strip(row.private, 'organizerEmail'), signup: strip(s, 'editToken') };
  },

  async updateMySignup(editToken, edit: SignupEdit) {
    const db = load();
    const { s } = bySignup(db, editToken);
    Object.assign(s, normalizeSignupEdit(edit));
    save(db);
  },

  async cancelMySignup(editToken) {
    const db = load();
    const { row, s } = bySignup(db, editToken);
    row.signups = row.signups.filter((x) => x.id !== s.id);
    save(db);
  },

  async getManage(token) {
    const { row, me } = byManager(load(), token);
    return {
      board: row.board,
      private: row.private,
      signups: row.signups.map((s) => strip(s, 'editToken')).sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot)),
      managers: row.managers.map((m) => strip(m, 'token', 'seenAt')),
      me: strip(me, 'token'),
    };
  },

  async updateBoard(token, input) {
    const db = load();
    const { row } = byManager(db, token);
    const clean = normalizeBoard(input);
    row.board = {
      slug: row.board.slug,
      // Editing a declined request sends it back for review.
      status: row.board.status === 'declined' ? 'pending' : row.board.status,
      reviewNote: row.board.reviewNote,
      familyName: clean.familyName,
      startDate: clean.startDate,
      endDate: clean.endDate,
      slots: clean.slots,
      perSlot: clean.perSlot,
      blockedDates: clean.blockedDates,
      details: clean.details,
    };
    row.private = clean.private;
    save(db);
  },

  async removeSignup(token, signupId) {
    const db = load();
    const { row } = byManager(db, token);
    row.signups = row.signups.filter((s) => s.id !== signupId);
    save(db);
  },

  async deleteBoard(token) {
    const db = load();
    const { row, me } = byManager(db, token);
    if (me.role !== 'owner') throw new ApiError('forbidden');
    db.boards = db.boards.filter((r) => r !== row);
    save(db);
  },

  async addManager(token, name) {
    const db = load();
    const { row, me } = byManager(db, token);
    if (me.role !== 'owner') throw new ApiError('forbidden');
    const newToken = randomToken();
    row.managers.push({ id: randomSlug(), token: newToken, name: name.trim().slice(0, 80), role: 'co', createdAt: now(), seenAt: now() });
    save(db);
    return { token: newToken };
  },

  async removeManager(token, managerId) {
    const db = load();
    const { row, me } = byManager(db, token);
    if (me.role !== 'owner') throw new ApiError('forbidden');
    row.managers = row.managers.filter((m) => m.id !== managerId || m.role === 'owner');
    save(db);
  },

  async markSeen(token) {
    const db = load();
    const { me } = byManager(db, token);
    me.seenAt = now();
    save(db);
  },

  async recoverLinks() {
    throw new ApiError('unavailable');
  },

  async notifySignup() {
    /* no email in demo mode */
  },
  async notifyRequest() {
    /* no email in demo mode */
  },
  async notifyDecision() {
    /* no email in demo mode */
  },

  // Demo mode acts as an already signed-in neighbor, so the whole flow can be tried.
  account: {
    async user() {
      return { email: 'demo-neighbor@example.com', name: 'Demo', avatarUrl: '' };
    },
    async requestEmailLink() {},
    onChange() {
      return () => {};
    },
    async signInWithGoogle() {
      throw new ApiError('unavailable');
    },
    async signOut() {},
    async activity() {
      return { boards: [], signups: [] };
    },
    async linkDeviceItems() {},
  },

  admin: {
    async session() {
      return DEMO_ADMIN;
    },
    onChange() {
      return () => {};
    },
    async requestLink() {
      /* already signed in */
    },
    async signOut() {
      /* demo admin can't sign out */
    },
    async me() {
      return { email: DEMO_ADMIN, isAdmin: true };
    },
    async listRequests(status) {
      return load()
        .boards.filter((r) => r.board.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(
          (r): AdminRequest => ({
            ...r.board,
            createdAt: r.createdAt,
            reviewedAt: r.reviewedAt,
            reviewedBy: r.reviewedBy,
            private: r.private,
            manageToken: r.managers.find((m) => m.role === 'owner')?.token ?? '',
            signupCount: r.signups.length,
          }),
        );
    },
    async review(slug, status, note) {
      const db = load();
      const row = db.boards.find((r) => r.board.slug === slug);
      if (!row) throw new ApiError('not_found');
      row.board.status = status;
      row.board.reviewNote = note.trim().slice(0, 500);
      row.reviewedAt = now();
      row.reviewedBy = DEMO_ADMIN;
      save(db);
    },
    async deleteBoard(slug) {
      const db = load();
      const before = db.boards.length;
      db.boards = db.boards.filter((r) => r.board.slug !== slug);
      if (db.boards.length === before) throw new ApiError('not_found');
      save(db);
    },
    async listAdmins() {
      const db = load();
      return db.admins?.length ? db.admins : [{ email: DEMO_ADMIN, addedBy: '', createdAt: now() }];
    },
    async addAdmin(email) {
      const db = load();
      const clean = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new ApiError('invalid');
      const list = db.admins?.length ? db.admins : [{ email: DEMO_ADMIN, addedBy: '', createdAt: now() }];
      if (!list.some((a) => a.email === clean)) list.push({ email: clean, addedBy: DEMO_ADMIN, createdAt: now() });
      db.admins = list;
      save(db);
    },
    async removeAdmin(email) {
      const db = load();
      const clean = email.trim().toLowerCase();
      if (clean === DEMO_ADMIN) throw new ApiError('forbidden');
      db.admins = (db.admins ?? []).filter((a) => a.email !== clean);
      save(db);
    },
  },
};

/** Test helper. */
export function resetLocalDb() {
  save({ boards: [] });
}
