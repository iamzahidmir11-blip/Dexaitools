import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hurmat Darbar | Uri',
  description: 'Explore the menu and connect with Hurmat Darbar in Uri, Jammu & Kashmir.',
  metadataBase: new URL('https://hurmat-darbar.onrender.com'),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
