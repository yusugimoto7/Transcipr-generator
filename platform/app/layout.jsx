import './globals.css';

export const metadata = {
  title: 'Canada Visa Platform',
  description:
    'Prepare your Canadian study permit documents and forms — guided intake, AI document review, and generated files.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
