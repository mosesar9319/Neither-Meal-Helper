// The Edge Functions import Hebcal with a Deno npm: specifier. Tell TypeScript
// it is the same package the app already depends on (vite.config.ts aliases it).
declare module 'npm:@hebcal/core@6' {
  export { flags, HebrewCalendar } from '@hebcal/core';
}
