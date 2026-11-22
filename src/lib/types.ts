export type Lang = 'he' | 'en';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';
export const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

export type KashrutLevel = 'none' | 'kosher' | 'mehadrin';
export type MealType = 'any' | 'meat' | 'dairy' | 'parve';

export const KASHRUT_EXTRAS = ['glatt', 'chalav_yisrael', 'pas_yisrael', 'bishul_yisrael', 'no_kitniyot'] as const;
export type KashrutExtra = (typeof KASHRUT_EXTRAS)[number];

export const DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'gluten_free',
  'dairy_free',
  'nut_free',
  'egg_free',
  'low_salt',
  'not_spicy',
  'kid_friendly',
] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

/** Everything about a board that neighbors are allowed to see. */
export interface BoardDetails {
  organizerName: string;
  adults: number;
  children: number;
  childrenAges: string;
  kashrut: KashrutLevel;
  kashrutExtras: KashrutExtra[];
  mealType: MealType;
  dietary: DietaryTag[];
  allergies: string;
  foodNotes: string;
  deliveryFrom: string; // HH:MM
  deliveryTo: string;
  earlyFrom: string; // Fridays and holiday eves
  earlyTo: string;
  skipShabbat: boolean;
  skipHolidays: boolean;
  inIsrael: boolean;
  /** Days the organizer closed by hand. */
  manualBlocked: string[];
  /** Shabbat / holiday days the organizer re-opened by hand. */
  manualOpen: string[];
}

/** Shown only to a neighbor who signed up, and to organizers. */
export interface PrivateDetails {
  address: string;
  instructions: string;
  phone: string;
}

export interface OrganizerPrivate extends PrivateDetails {
  organizerEmail: string;
}

export type BoardStatus = 'pending' | 'approved' | 'declined' | 'offline';

export interface Board {
  slug: string;
  /** New requests wait for an admin; only approved boards are public. */
  status: BoardStatus;
  /** An admin's note to the organizer, e.g. why a request was declined. */
  reviewNote: string;
  familyName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  slots: MealSlot[];
  perSlot: number;
  /** Effective closed days (auto + manual), computed when saved. */
  blockedDates: string[];
  details: BoardDetails;
}

export interface BoardInput {
  familyName: string;
  startDate: string;
  endDate: string;
  slots: MealSlot[];
  perSlot: number;
  details: BoardDetails;
  private: OrganizerPrivate;
}

/** What everyone sees about a sign-up. */
export interface PublicSignup {
  id: string;
  date: string;
  slot: MealSlot;
  name: string;
  dish: string;
}

export interface Signup extends PublicSignup {
  phone: string;
  email: string;
  note: string;
  createdAt: string;
}

export interface SignupInput {
  date: string;
  slot: MealSlot;
  name: string;
  phone: string;
  email: string;
  dish: string;
  note: string;
}

export interface Manager {
  id: string;
  name: string;
  role: 'owner' | 'co';
  createdAt: string;
}

/** A request as an admin sees it. */
export interface AdminRequest extends Board {
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string;
  private: OrganizerPrivate;
  manageToken: string;
  signupCount: number;
}

/** The signed-in person (Continue with Google). */
export interface AccountUser {
  email: string;
  name: string;
  avatarUrl: string;
}

/** What a signed-in person sent and signed up for, across devices. */
export interface MyActivity {
  boards: { slug: string; familyName: string; status: BoardStatus; startDate: string; endDate: string; createdAt: string; manageToken: string }[];
  signups: { date: string; slot: MealSlot; dish: string; editToken: string; familyName: string; slug: string }[];
}

export interface AdminEntry {
  email: string;
  addedBy: string;
  createdAt: string;
}

export interface ManageData {
  board: Board;
  private: OrganizerPrivate;
  signups: Signup[];
  managers: Manager[];
  me: Manager & { seenAt: string };
}

export interface PublicBoardData {
  board: Board;
  signups: PublicSignup[];
}

export interface MySignupData {
  board: Board;
  private: PrivateDetails;
  signup: Signup;
}

export interface SignUpResult {
  editToken: string;
  signupId: string;
  private: PrivateDetails;
}

export const LIMITS = {
  familyName: 120,
  name: 80,
  phone: 30,
  email: 200,
  dish: 200,
  note: 500,
  shortText: 200,
  longText: 1000,
  maxDays: 120,
  maxPerSlot: 5,
} as const;

export function defaultDetails(): BoardDetails {
  return {
    organizerName: '',
    adults: 2,
    children: 0,
    childrenAges: '',
    kashrut: 'kosher',
    kashrutExtras: [],
    mealType: 'any',
    dietary: [],
    allergies: '',
    foodNotes: '',
    deliveryFrom: '17:00',
    deliveryTo: '19:00',
    earlyFrom: '11:00',
    earlyTo: '13:00',
    skipShabbat: true,
    skipHolidays: true,
    inIsrael: true,
    manualBlocked: [],
    manualOpen: [],
  };
}
