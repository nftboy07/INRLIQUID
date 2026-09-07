import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'INRLIQUID',
  description: 'Fast Indian-market trading interface'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en-IN"><body>{children}</body></html>;
}
