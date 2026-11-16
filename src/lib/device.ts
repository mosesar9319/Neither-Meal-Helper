/**
 * Links remembered on this device, so an organizer or neighbor can find their
 * board again without digging through chats. Browser storage can be missing or
 * blocked, so every access is guarded and the app works without it.
 */

export interface RememberedBoard {
  slug: string;
  familyName: string;
  manageToken: string;
  savedAt: string;
}

export interface RememberedSignup {
  editToken: string;
  slug: string;
  familyName: string;
  date: string;
  savedAt: string;
}

const BOARDS = 'nmc.myBoards';
const SIGNUPS = 'nmc.mySignups';

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export const device = {
  boards: () => read<RememberedBoard>(BOARDS),
  rememberBoard(b: Omit<RememberedBoard, 'savedAt'>) {
    const rest = read<RememberedBoard>(BOARDS).filter((x) => x.manageToken !== b.manageToken);
    write(BOARDS, [{ ...b, savedAt: new Date().toISOString() }, ...rest].slice(0, 30));
  },
  forgetBoard(manageToken: string) {
    write(BOARDS, read<RememberedBoard>(BOARDS).filter((x) => x.manageToken !== manageToken));
  },
  signups: () => read<RememberedSignup>(SIGNUPS),
  rememberSignup(s: Omit<RememberedSignup, 'savedAt'>) {
    const rest = read<RememberedSignup>(SIGNUPS).filter((x) => x.editToken !== s.editToken);
    write(SIGNUPS, [{ ...s, savedAt: new Date().toISOString() }, ...rest].slice(0, 50));
  },
  forgetSignup(editToken: string) {
    write(SIGNUPS, read<RememberedSignup>(SIGNUPS).filter((x) => x.editToken !== editToken));
  },
  /** Remember the last name/phone a neighbor typed, to prefill the next sign-up. */
  getContact(): { name: string; phone: string; email: string } {
    try {
      const raw = localStorage.getItem('nmc.contact');
      const v = raw ? JSON.parse(raw) : {};
      return { name: v.name ?? '', phone: v.phone ?? '', email: v.email ?? '' };
    } catch {
      return { name: '', phone: '', email: '' };
    }
  },
  setContact(c: { name: string; phone: string; email: string }) {
    try {
      localStorage.setItem('nmc.contact', JSON.stringify(c));
    } catch {
      /* storage unavailable */
    }
  },
};
