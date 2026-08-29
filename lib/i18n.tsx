'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type Language = 'pt-BR' | 'en';

type Dictionary = Record<string, string>;

const dictionaries: Record<Language, Dictionary> = {
  'pt-BR': {
    'app.name': 'LOGÍSTICAS BILL',
    'menu.dashboard': 'Dashboard',
    'menu.schedule': 'Agendamento',
    'menu.commercial': 'Comercial',
    'menu.vehicles': 'Veículos',
    'menu.drivers': 'Motoristas',
    'menu.maintenance': 'Manutenção',
    'menu.fuel': 'Combustível',
    'menu.stock': 'Estoque',
    'menu.entry': 'Entradas',
    'menu.output': 'Saídas',
    'menu.movements': 'Movimentações',
    'menu.reports': 'Relatórios',
    'menu.users': 'Usuários',
    'menu.settings': 'Configurações',
    'menu.criticalSettings': 'Configurações críticas',
    'common.open': 'Abrir',
    'common.close': 'Fechar',
    'common.save': 'Salvar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Excluir',
    'common.edit': 'Editar',
    'common.loading': 'Carregando…',
    'common.error': 'Erro',
    'settings.title': 'Configurações',
    'settings.tab.backup': 'Backup e dados',
    'settings.tab.audit': 'Auditoria',
    'settings.tab.company': 'Dados da empresa',
    'settings.tab.prefs': 'Preferências',
    'settings.tab.system': 'Sistema / Atualizações',
    'settings.tab.license': 'Licença',
    'settings.tab.support': 'Suporte',
    'settings.language': 'Idioma',
    'settings.portuguese': 'Português (Brasil)',
    'settings.english': 'English',
    'login.title': 'Acesso ao sistema',
    'login.username': 'Usuário',
    'login.password': 'Senha',
    'login.submit': 'Entrar',
  },
  en: {
    'app.name': 'LOGÍSTICAS BILL',
    'menu.dashboard': 'Dashboard',
    'menu.schedule': 'Scheduling',
    'menu.commercial': 'Commercial',
    'menu.vehicles': 'Vehicles',
    'menu.drivers': 'Drivers',
    'menu.maintenance': 'Maintenance',
    'menu.fuel': 'Fuel',
    'menu.stock': 'Inventory',
    'menu.entry': 'Stock entries',
    'menu.output': 'Stock exits',
    'menu.movements': 'Movements',
    'menu.reports': 'Reports',
    'menu.users': 'Users',
    'menu.settings': 'Settings',
    'menu.criticalSettings': 'Critical settings',
    'common.open': 'Open',
    'common.close': 'Close',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.loading': 'Loading…',
    'common.error': 'Error',
    'settings.title': 'Settings',
    'settings.tab.backup': 'Backup and data',
    'settings.tab.audit': 'Audit',
    'settings.tab.company': 'Company data',
    'settings.tab.prefs': 'Preferences',
    'settings.tab.system': 'System / Updates',
    'settings.tab.license': 'License',
    'settings.tab.support': 'Support',
    'settings.language': 'Language',
    'settings.portuguese': 'Portuguese (Brazil)',
    'settings.english': 'English',
    'login.title': 'System access',
    'login.username': 'Username',
    'login.password': 'Password',
    'login.submit': 'Sign in',
  },
};

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, fallback?: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('pt-BR');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('app-language');
      if (stored === 'en' || stored === 'pt-BR') setLanguageState(stored);
    } catch {
      // Mantém Português como fallback.
    }
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem('app-language', next);
      window.dispatchEvent(new CustomEvent('app-language-change', { detail: next }));
    } catch {
      // A preferência continua ativa durante a sessão.
    }
  }, []);

  useEffect(() => {
    const onLanguageChange = (event: Event) => {
      const next = (event as CustomEvent<Language>).detail;
      if (next === 'en' || next === 'pt-BR') setLanguageState(next);
    };
    window.addEventListener('app-language-change', onLanguageChange);
    return () => window.removeEventListener('app-language-change', onLanguageChange);
  }, []);

  const t = useCallback(
    (key: string, fallback = key) => dictionaries[language][key] || fallback,
    [language]
  );

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n deve ser usado dentro de I18nProvider');
  return context;
}
