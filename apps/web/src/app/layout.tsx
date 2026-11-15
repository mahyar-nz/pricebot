import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';
import './refinements.css';

export const metadata: Metadata = { title: 'Pricing Platform | هوشمندی قیمت‌گذاری', description: 'پایش بازار، مقایسه قیمت و پیشنهاد قیمت‌گذاری با کنترل سود و تأیید شما.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="fa" dir="rtl" suppressHydrationWarning><body><Providers>{children}</Providers></body></html>; }
