import type {
  AccountUser,
  AdminEntry,
  AdminRequest,
  BoardInput,
  BoardStatus,
  MyActivity,
  ManageData,
  MySignupData,
  PublicBoardData,
  SignUpResult,
  SignupInput,
} from '../types';

export type ApiErrorCode =
  | 'not_found'
  | 'slot_full'
  | 'day_closed'
  | 'invalid'
  | 'forbidden'
  | 'unavailable'
  | 'rate_limited'
  | 'signup_disabled'
  | 'unknown';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type SignupEdit = Pick<SignupInput, 'name' | 'phone' | 'email' | 'dish' | 'note'>;

/** Optional sign-in for anyone (Continue with Google). */
export interface AccountApi {
  user(): Promise<AccountUser | null>;
  onChange(cb: () => void): () => void;
  /** Leaves the page for Google and comes back to `returnTo`. */
  signInWithGoogle(returnTo: string): Promise<void>;
  signOut(): Promise<void>;
  activity(): Promise<MyActivity>;
  /** Links requests and meals whose links are saved on this device to the account. */
  linkDeviceItems(manageTokens: string[], editTokens: string[]): Promise<void>;
}

export interface AdminApi {
  /** Email of the signed-in user, or null. */
  session(): Promise<string | null>;
  /** Calls back whenever the sign-in state changes; returns an unsubscribe function. */
  onChange(cb: () => void): () => void;
  /** Sends a sign-in link if the email is an admin. Says nothing either way. */
  requestLink(email: string, redirectTo: string): Promise<void>;
  signOut(): Promise<void>;
  me(): Promise<{ email: string; isAdmin: boolean }>;
  listRequests(status: BoardStatus): Promise<AdminRequest[]>;
  review(slug: string, status: BoardStatus, note: string): Promise<void>;
  deleteBoard(slug: string): Promise<void>;
  listAdmins(): Promise<AdminEntry[]>;
  addAdmin(email: string): Promise<void>;
  removeAdmin(email: string): Promise<void>;
}

export interface Api {
  mode: 'local' | 'supabase';
  /** True when the email Edge Functions are deployed (VITE_EMAIL_ENABLED=true). */
  emailEnabled: boolean;
  /** True when Google sign-in is configured (VITE_GOOGLE_AUTH_ENABLED=true). */
  googleEnabled: boolean;
  createBoard(input: BoardInput): Promise<{ slug: string; manageToken: string }>;
  getPublicBoard(slug: string): Promise<PublicBoardData>;
  signUp(slug: string, input: SignupInput): Promise<SignUpResult>;
  getMySignup(editToken: string): Promise<MySignupData>;
  updateMySignup(editToken: string, edit: SignupEdit): Promise<void>;
  cancelMySignup(editToken: string): Promise<void>;
  getManage(token: string): Promise<ManageData>;
  updateBoard(token: string, input: BoardInput): Promise<void>;
  removeSignup(token: string, signupId: string): Promise<void>;
  deleteBoard(token: string): Promise<void>;
  addManager(token: string, name: string): Promise<{ token: string }>;
  removeManager(token: string, managerId: string): Promise<void>;
  markSeen(token: string): Promise<void>;
  /** Sends the organizer's management links to their email (Supabase only). */
  recoverLinks(email: string): Promise<void>;
  /** Fire-and-forget email to the organizer about a new sign-up (Supabase only). */
  notifySignup(editToken: string): Promise<void>;
  /** Fire-and-forget email to the admins about a new request (Supabase only). */
  notifyRequest(manageToken: string): Promise<void>;
  /** Fire-and-forget email to the organizer about an admin's decision (Supabase only). */
  notifyDecision(slug: string): Promise<void>;
  admin: AdminApi;
  account: AccountApi;
}
