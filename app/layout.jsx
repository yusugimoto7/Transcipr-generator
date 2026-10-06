import "./globals.css";

export const metadata = {
  title: "Sugimoto · Topic Engine",
  description:
    "Swipe this week's live Canada & Europe immigration news and generate bilingual (Farsi + English) Reel scripts.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0b1a20" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Vazirmatn:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
