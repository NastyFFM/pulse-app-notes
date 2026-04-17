import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Meine Notizen',
  description: 'Notizen erstellen und verwalten',
  themeColor: '#fffde7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
