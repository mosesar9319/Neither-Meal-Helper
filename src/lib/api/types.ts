import type {
  BoardInput,
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

export interface Api {
  mode: 'local' | 'supabase';
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
}
