import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { ApiError, type Api, type ApiErrorCode } from './types';
import { normalizeBoard, normalizeSignup, normalizeSignupEdit } from './validate';

/**
 * Talks to the database only through the SQL functions in supabase/migrations
 * (all named meal_*). Tables are closed to the browser; each function checks the
 * slug or secret token it is given, and the meal_admin_* functions check that
 * the signed-in user is a listed admin.
 */

const KNOWN: ApiErrorCode[] = ['signin_required', 'not_found', 'slot_full', 'day_closed', 'invalid', 'forbidden'];

export function createSupabaseApi(url: string, anonKey: string, emailEnabled = false, googleEnabled = false): Api {
  // Admins, and anyone who chooses Continue with Google, stay signed in.
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'nmc.auth' },
  });

  const toUser = (u: User | undefined | null) => {
    if (!u?.email) return null;
    const m = (u.user_metadata ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    return { email: u.email.toLowerCase(), name: str(m.full_name) || str(m.name), avatarUrl: str(m.avatar_url) || str(m.picture) };
  };

  async function signInWithGoogle(returnTo: string) {
    if (!googleEnabled) throw new ApiError('unavailable');
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnTo } });
    if (error) throw new ApiError('unknown', error.message);
  }

  async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await sb.rpc(`meal_${fn}`, args);
    if (error) {
      const code = KNOWN.find((k) => error.message?.includes(k));
      throw new ApiError(code ?? 'unknown', error.message);
    }
    return data as T;
  }

  /** Email functions are a bonus: never block the main action on them. */
  async function fireAndForget(fn: string, body: Record<string, unknown>) {
    if (!emailEnabled) return;
    try {
      await sb.functions.invoke(fn, { body });
    } catch {
      /* ignore */
    }
  }

  return {
    mode: 'supabase',
    emailEnabled,
    googleEnabled,
    createBoard: (input) => rpc('create_board', { p: normalizeBoard(input) }),
    getPublicBoard: (slug) => rpc('get_public_board', { p_slug: slug }),
    signUp: (slug, input) => rpc('sign_up', { p_slug: slug, p: normalizeSignup(input) }),
    getMySignup: (editToken) => rpc('get_my_signup', { p_token: editToken }),
    updateMySignup: (editToken, edit) => rpc('update_my_signup', { p_token: editToken, p: normalizeSignupEdit(edit) }),
    cancelMySignup: (editToken) => rpc('cancel_my_signup', { p_token: editToken }),
    getManage: (token) => rpc('get_manage', { p_token: token }),
    updateBoard: (token, input) => rpc('update_board', { p_token: token, p: normalizeBoard(input) }),
    removeSignup: (token, id) => rpc('remove_signup', { p_token: token, p_id: id }),
    deleteBoard: (token) => rpc('delete_board', { p_token: token }),
    addManager: (token, name) => rpc('add_manager', { p_token: token, p_name: name }),
    removeManager: (token, id) => rpc('remove_manager', { p_token: token, p_id: id }),
    markSeen: (token) => rpc('mark_seen', { p_token: token }),
    async recoverLinks(email) {
      if (!emailEnabled) throw new ApiError('unavailable');
      const { error } = await sb.functions.invoke('meal-recover-links', { body: { email } });
      if (error) throw new ApiError('unknown', error.message);
    },
    notifySignup: (editToken) => fireAndForget('meal-notify-signup', { editToken }),
    notifyRequest: (manageToken) => fireAndForget('meal-notify-request', { manageToken }),
    notifyDecision: (slug) => fireAndForget('meal-notify-decision', { slug }),

    account: {
      async user() {
        const { data } = await sb.auth.getSession();
        return toUser(data.session?.user);
      },
      onChange(cb) {
        const { data } = sb.auth.onAuthStateChange(() => cb());
        return () => data.subscription.unsubscribe();
      },
      signInWithGoogle,
      async requestEmailLink(email, returnTo) {
        const { error } = await sb.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: { emailRedirectTo: returnTo, shouldCreateUser: true },
        });
        if (error) {
          const msg = error.message ?? '';
          if (error.status === 429 || /rate limit|too many/i.test(msg)) throw new ApiError('rate_limited', msg);
          if (/signups? not allowed|signup.*disabled/i.test(msg)) throw new ApiError('signup_disabled', msg);
          throw new ApiError('unknown', msg);
        }
      },
      async signOut() {
        await sb.auth.signOut();
      },
      activity: () => rpc('my_activity'),
      async linkDeviceItems(manageTokens, editTokens) {
        if (!manageTokens.length && !editTokens.length) return;
        await rpc('link_my_items', { p_manage_tokens: manageTokens.slice(0, 50), p_edit_tokens: editTokens.slice(0, 50) });
      },
    },

    admin: {
      async session() {
        const { data } = await sb.auth.getSession();
        return data.session?.user.email ?? null;
      },
      onChange(cb) {
        const { data } = sb.auth.onAuthStateChange(() => cb());
        return () => data.subscription.unsubscribe();
      },
      async requestLink(email, redirectTo) {
        const clean = email.trim().toLowerCase();
        // Only listed admins get a link, so random visitors can't create accounts here.
        const allowed = await rpc<boolean>('admin_login_allowed', { p_email: clean });
        if (!allowed) return;
        const { error } = await sb.auth.signInWithOtp({ email: clean, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
        if (error) {
          const msg = error.message ?? '';
          if (error.status === 429 || /rate limit|too many/i.test(msg)) throw new ApiError('rate_limited', msg);
          if (/signups? not allowed|signup.*disabled/i.test(msg)) throw new ApiError('signup_disabled', msg);
          throw new ApiError('unknown', msg);
        }
      },
      async signOut() {
        await sb.auth.signOut();
      },
      me: () => rpc('admin_me'),
      listRequests: (status) => rpc('admin_list_requests', { p_status: status }),
      review: (slug, status, note) => rpc('admin_review', { p_slug: slug, p_status: status, p_note: note }),
      deleteBoard: (slug) => rpc('admin_delete_board', { p_slug: slug }),
      listSignups: (slug) => rpc('admin_list_signups', { p_slug: slug }),
      moveSignup: (id, date, slot, force) => rpc('admin_move_signup', { p_id: id, p_date: date, p_slot: slot, p_force: force }),
      removeSignup: (id) => rpc('admin_remove_signup', { p_id: id }),
      listAdmins: () => rpc('admin_list_admins'),
      addAdmin: (email) => rpc('admin_add', { p_email: email }),
      removeAdmin: (email) => rpc('admin_remove', { p_email: email }),
    },
  };
}
