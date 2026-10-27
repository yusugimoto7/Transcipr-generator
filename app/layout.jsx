import "./globals.css";
import { cookies } from "next/headers";
import LangProvider from "./LangProvider";
import { LANG_COOKIE, normLang } from "../lib/i18n";
import VoiceDictation from "./VoiceDictation";
import CopyCorners from "./CopyCorners";
import PasteImages from "./PasteImages";

export const metadata = {
  title: "Sugimoto · Topic Engine",
  description:
    "Swipe this week's live Canada & Europe immigration news and generate bilingual (Farsi + English) Reel scripts.",
  // added to an iPhone's home screen it opens full screen, which is also what lets it get notifications
  appleWebApp: { capable: true, title: "Sugimoto", statusBarStyle: "black-translucent" },
};

export default function RootLayout({ children }) {
  const lang = normLang(cookies().get(LANG_COOKIE)?.value);
  return (
    <html lang={lang}>
      <head>
        <meta name="theme-color" content="#243b44" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>
        <LangProvider lang={lang}>
          {children}
          <VoiceDictation />
          <CopyCorners />
          <PasteImages />
        </LangProvider>
      </body>
    </html>
  );
}
