import './globals.css';

export const metadata = {
  title: 'Logísticas Bill',
  description: 'Sistema interno de gestão logística — rotas, frota, manutenção, combustível e estoque.',
  icons: {
    icon: '/icon2.png',
  },
};

export default function Layout({children}:{children:React.ReactNode}){
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}