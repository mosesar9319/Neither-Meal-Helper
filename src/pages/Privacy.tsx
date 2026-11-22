import type { ReactNode } from 'react';
import { Page, useTitle } from '../components/Layout';
import { Card } from '../components/ui';
import { useI18n } from '../lib/i18n';

const CONTACT = 'meals@meals.dafsync.com';

function MailLink() {
  return (
    <a href={`mailto:${CONTACT}`} dir="ltr" className="underline underline-offset-4">
      {CONTACT}
    </a>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/**
 * One page, Hebrew then English, so the address Google asks for is complete
 * in either language. The interface language does not swap these sections.
 */
export function Privacy() {
  const { t } = useI18n();
  useTitle(t.privacyTitle);

  return (
    <Page width="md">
      <div className="space-y-8">
        <section lang="he" dir="rtl">
          <Card className="space-y-6 p-6 text-[15px] leading-relaxed sm:p-8">
            <header className="space-y-2">
              <h1 className="text-3xl font-bold sm:text-4xl">מדיניות פרטיות</h1>
              <p className="text-sm text-muted">עודכן לאחרונה: 22 בנובמבר 2026</p>
            </header>
            <p>
              שכנות למען שכנות הוא אתר לתיאום ארוחות למשפחה — אחרי לידה, בזמן מחלה או בתקופה קשה. בעמוד הזה כתוב מה האתר שומר, למה, ומי יכול לראות את זה.
            </p>

            <Block title="מה נשמר">
              <p>
                בקשה ללוח ארוחות כוללת את שם המשפחה ואת שם המארגן או המארגנת; כמה מבוגרים וילדים בבית, וגילאי הילדים אם נכתבו; צרכי אוכל כמו כשרות, העדפות, אלרגיות והערות; את התאריכים, הארוחות ושעות המסירה; כתובת למסירה, הוראות מסירה וטלפון, שאפשר להשאיר ריקים; ואת המייל של המארגן או המארגנת, אם בחרו להוסיף אותו.
              </p>
              <p>שכן או שכנה שנרשמים לארוחה נותנים שם, טלפון ומייל, את המנה אם כתבו אותה, והערה אם רצו.</p>
              <p>
                התחברות עם Google אינה חובה. אם בוחרים בה, אנחנו מקבלים מגוגל את כתובת המייל, השם ותמונת הפרופיל, ושום דבר אחר. האתר עובד גם עם קישורים, בלי חשבון. מנהלי האתר נכנסים עם המייל שלהם, בקישור כניסה או עם Google. אנחנו שומרים את כתובות המייל של מנהלי האתר.
              </p>
              <p>הדפדפן זוכר את הקישורים שנפתחו כאן, וגם את השם, הטלפון והמייל שהוקלדו לאחרונה בטופס הרשמה, כדי למלא את הטופס הבא. זה נשאר במכשיר.</p>
            </Block>

            <Block title="למה">
              <p>
                המידע משמש כדי להציג את לוח הארוחות ולאפשר לשכנים להירשם, כדי לתת את הכתובת והטלפון למי שמביאים ארוחה, וכדי לשלוח מייל: אישור הרשמה, תזכורת בערב שלפני, עדכון למארגן כשמישהו נרשם, עדכון למנהלים על בקשה חדשה, ואת הקישורים של המארגן שוב אם ביקשו. אם נכנסים עם Google, אנחנו משתמשים בכניסה הזו רק כדי להציג במכשיר אחר את הבקשות והארוחות שקשורות אליה.
              </p>
            </Block>

            <Block title="מי רואה מה">
              <p>
                אחרי שמנהלי האתר מאשרים בקשה, כל מי שיש לו את קישור הלוח רואה את שם המשפחה, שם המארגן, התאריכים, הארוחות ושעות המסירה, את גודל הבית, הכשרות ושאר צרכי האוכל, ואת השם הפרטי והמנה של כל מי שנרשם. אין שם את הכתובת, מספרי הטלפון, המייל של המארגן, או את השם המלא, הטלפון, המייל וההערה של מי שנרשם.
              </p>
              <p>
                כל מי שיש לו את הקישור האישי של הרשמה רואה את כתובת המסירה, הוראות המסירה והטלפון של המשפחה. אותם פרטים מופיעים גם במייל האישור ובמייל התזכורת. אם מוסיפים את הארוחה ליומן, הפרטים האלה נכנסים לאירוע שנוצר.
              </p>
              <p>
                כל מי שיש לו קישור ניהול — המארגן, ומארגן שותף שהוזמן — רואה את הכתובת, הטלפון, ההוראות והמייל של המארגן, ואת השם, הטלפון, המייל, המנה וההערה של כל מי שנרשם. אם המארגן הוסיף מייל, התיבה הזו מקבלת גם את השם, הטלפון, המנה וההערה כשמישהו נרשם.
              </p>
              <p>
                מנהלי האתר רואים כל בקשה, כולל הכתובת, הטלפון והמייל של המארגן, כדי שיוכלו לבדוק אותה. הם יכולים גם לפתוח את עמוד המארגן, ושם מופיעים השם, הטלפון, המייל וההערה של כל מי שנרשם.
              </p>
              <p>אנחנו לא מוכרים את המידע הזה. באתר אין פרסומות.</p>
            </Block>

            <Block title="שירותים שמטפלים במידע">
              <p>Supabase שומר את לוחות הארוחות ומטפל בכניסה. Netlify מארח את האתר. Resend שולח את המיילים. Google מעורב רק אם מישהו בוחר להיכנס עם Google.</p>
            </Block>

            <Block title="מחיקה">
              <p>
                מי שנרשם יכול לבטל את ההרשמה מהקישור האישי. המארגן שפתח את הלוח יכול למחוק אותו. מנהל יכול למחוק בקשה. הפעולות האלה מוציאות את המידע הזה מהאתר. מיילים שכבר נשלחו נשארים בתיבות שאליהן נשלחו. קישורים שנשמרו בדפדפן נשארים במכשיר עד שמוחקים אותם שם.
              </p>
              <p>
                כדי לבקש מאיתנו למחוק מידע — כולל פרטי כניסה עם Google — כתבו אל <MailLink />.
              </p>
              <p>המידע של לוח נשאר כל עוד הלוח קיים. האתר לא מוחק לוחות לפי לוח זמנים.</p>
            </Block>
          </Card>
        </section>

        <section lang="en" dir="ltr">
          <Card className="space-y-6 p-6 text-[15px] leading-relaxed sm:p-8">
            <header className="space-y-2">
              <h1 className="text-3xl font-bold sm:text-4xl">Privacy policy</h1>
              <p className="text-sm text-muted">Last updated: November 22, 2026</p>
            </header>
            <p>
              Neighbors for Neighbors (שכנות למען שכנות) is a website for organizing meals for a family after a birth, during illness, or in a hard time. This page says what the site stores, why, and who can see it.
            </p>

            <Block title="What we collect">
              <p>
                A meal request includes the family name and the organizer’s name; how many adults and children live there, and the children’s ages if provided; food needs such as kashrut, dietary needs, allergies, and notes; the dates, meals, and drop-off times; a delivery address, delivery instructions, and a phone number, which may be left blank; and the organizer’s email, if they choose to add one.
              </p>
              <p>A neighbor signing up for a meal gives their name, phone number, and email, the dish if they write one, and an optional note.</p>
              <p>
                Signing in with Google is optional. If you choose it, we receive the email address, name, and profile photo from your Google account, and nothing else. The site also works with links, without an account. Administrators sign in with their email, by a sign-in link or with Google. We store the email addresses of the site’s administrators.
              </p>
              <p>This browser remembers the links opened here, and the name, phone, and email last typed on a sign-up form, so the next form can be filled in. That stays on the device.</p>
            </Block>

            <Block title="Why">
              <p>
                We use this information to show the meal board and let neighbors sign up, to give the address and phone to the people bringing a meal, and to send email: a confirmation, a reminder the evening before, a notice to the organizer when someone signs up, a notice to administrators about a new request, and the organizer’s links again if they ask for them. If you sign in with Google, we use that sign-in only to show the requests and meals tied to it on any device.
              </p>
            </Block>

            <Block title="Who can see it">
              <p>
                After an administrator approves a request, anyone with the board link can see the family name, the organizer’s name, the dates, meals, and drop-off times, the household size, kashrut and other food needs, and each neighbor’s first name and dish. They cannot see the address, phone numbers, the organizer’s email, or a neighbor’s full name, phone, email, or note.
              </p>
              <p>
                Anyone with a neighbor’s personal sign-up link can see the delivery address, the delivery instructions, and the family’s phone. The same details are in the confirmation and reminder emails. If that person adds the meal to a calendar, those details are included in the event they create.
              </p>
              <p>
                Anyone with a management link — the organizer, and a co-organizer they invited — can see the address, phone, instructions, and organizer email, and each neighbor’s name, phone, email, dish, and note. If the organizer added an email, that inbox also receives the neighbor’s name, phone, dish, and note when someone signs up.
              </p>
              <p>
                Site administrators can see each request, including the address, phone, and organizer email, so they can review it. They can also open the organizer’s page, which shows each neighbor’s name, phone, email, and note.
              </p>
              <p>We do not sell this information. The site has no advertising.</p>
            </Block>

            <Block title="Services that handle it">
              <p>
                Supabase stores the meal boards and handles sign-in. Netlify hosts the website. Resend sends the emails. Google is involved only if someone chooses to sign in with Google.
              </p>
            </Block>

            <Block title="Deletion">
              <p>
                A neighbor can cancel their sign-up from their personal link. The organizer who opened the board can delete it. An administrator can delete a request. Those actions remove that information from the site. Emails that were already sent stay in the inboxes they were sent to. Links saved in the browser stay on that device until they are removed there.
              </p>
              <p>
                To ask us to delete information — including a Google sign-in — write to <MailLink />.
              </p>
              <p>A board’s information stays while that board exists. The site does not delete boards on a schedule.</p>
            </Block>
          </Card>
        </section>
      </div>
    </Page>
  );
}
