import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Logísticas Bill',
  description:
    'Sistema interno de gestão logística — rotas, frota, manutenção, combustível e estoque.',
  applicationName: 'Logísticas Bill',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Logísticas Bill',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon3.png', sizes: '512x512', type: 'image/png' }, // 512
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}