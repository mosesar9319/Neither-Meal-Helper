import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError, type Api, type ApiErrorCode } from './types';
import { normalizeBoard, normalizeSignup, normalizeSignupEdit } from './validate';

/**
 * Talks to the database only through the SQL functions in
 * supabase/migrations. Tables are closed to the browser; each function checks
 * the slug or secret token it is given.
 */

const KNOWN: ApiErrorCode[] = ['not_found', 'slot_full', 'day_closed', 'invalid', 'forbidden'];

export function createSupabaseApi(url: string, anonKey: string): Api {
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: false } });

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
      const code = KNOWN.find((k) => error.message?.includes(k));
      throw new ApiError(code ?? 'unknown', error.message);
    }
    return data as T;
  }

  return {
    mode: 'supabase',
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
      const { error } = await sb.functions.invoke('recover-links', { body: { email } });
      if (error) throw new ApiError('unknown', error.message);
    },
    async notifySignup(editToken) {
      try {
        await sb.functions.invoke('notify-signup', { body: { editToken } });
      } catch {
        /* email is a bonus; never block the sign-up on it */
      }
    },
  };
}
