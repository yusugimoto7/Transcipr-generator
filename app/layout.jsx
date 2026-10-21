import "./globals.css";
import VoiceDictation from "./VoiceDictation";
import CopyCorners from "./CopyCorners";
import PasteImages from "./PasteImages";

export const metadata = {
  title: "Sugimoto · Topic Engine",
  description:
    "Swipe this week's live Canada & Europe immigration news and generate bilingual (Farsi + English) Reel scripts.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#243b44" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>
        {children}
        <VoiceDictation />
        <CopyCorners />
        <PasteImages />
      </body>
    </html>
  );
}
