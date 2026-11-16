import { localApi } from './local';
import { createSupabaseApi } from './supabase';
import type { Api } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const email = import.meta.env.VITE_EMAIL_ENABLED === 'true';

export const api: Api = url && key ? createSupabaseApi(url, key, email) : localApi;

export { ApiError } from './types';
export type { Api, ApiErrorCode, SignupEdit } from './types';
