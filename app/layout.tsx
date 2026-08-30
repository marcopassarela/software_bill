import './globals.css';
import { I18nProvider } from '@/lib/i18n';
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
    icon: [{ url: '/icon2.png', type: 'image/png' }],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}