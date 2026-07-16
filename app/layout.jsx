export const metadata = {
  title: "Sugimoto · Topic Engine",
  description:
    "Swipe this week's live Canada & Europe immigration news and generate bilingual (Farsi + English) Reel scripts.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Vazirmatn:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
