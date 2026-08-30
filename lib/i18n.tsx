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
    'commercial.title': 'Comercial — Produtos / Serviços',
    'commercial.code': 'Código',
    'commercial.name': 'Nome',
    'commercial.price': 'Preço',
    'commercial.unit': 'Unidade',
    'commercial.observation': 'Observação',
    'commercial.status': 'Status',
    'commercial.actions': 'Ações',
    'commercial.list': 'Lista (por código)',
    'critical.title': 'Configurações críticas',
    'critical.adminPassword': 'Senha do Administrador Principal',
    'critical.confirm': 'Confirmar',
    'critical.cancel': 'Cancelar',
    'common.search': 'Pesquisar',
    'common.filter': 'Filtrar',
    'common.refresh': 'Atualizar',
    'common.active': 'Ativo',
    'common.inactive': 'Inativo',
    'common.saving': 'Salvando…',
    'common.register': 'Cadastrar',
    'common.soon': 'Em breve',
    'common.execute': 'Executar…',
    'common.executing': 'Executando…',
    'critical.action.wipe-operational.title': 'Excluir dados operacionais',
    'critical.action.wipe-operational.description': 'Apaga agenda, movimentações de estoque, manutenções e combustível. Mantém usuários e cadastros principais.',
    'critical.action.reset-settings.title': 'Redefinir configurações',
    'critical.action.reset-settings.description': 'Apaga preferências do sistema (moeda, fuso, paginação, etc.).',
    'critical.action.purge-users.title': 'Remover todos os usuários',
    'critical.action.purge-users.description': 'Mantém somente o Administrador Principal. Irreversível.',
    'critical.action.revoke-sessions.title': 'Encerrar todas as sessões',
    'critical.action.revoke-sessions.description': 'Todos os usuários precisarão entrar de novo.',
    'critical.action.restore-backup.title': 'Restaurar backup',
    'critical.action.restore-backup.description': 'Restaura dados a partir de um arquivo de backup (em breve).',
    'critical.action.delete-company.title': 'Excluir empresa',
    'critical.action.delete-company.description': 'Remove dados da empresa de forma definitiva (em breve).',
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
    'commercial.title': 'Commercial — Products / Services',
    'commercial.code': 'Code',
    'commercial.name': 'Name',
    'commercial.price': 'Price',
    'commercial.unit': 'Unit',
    'commercial.observation': 'Notes',
    'commercial.status': 'Status',
    'commercial.actions': 'Actions',
    'commercial.list': 'List (by code)',
    'critical.title': 'Critical settings',
    'critical.adminPassword': 'Main administrator password',
    'critical.confirm': 'Confirm',
    'critical.cancel': 'Cancel',
    'common.search': 'Search',
    'common.filter': 'Filter',
    'common.refresh': 'Refresh',
    'common.active': 'Active',
    'common.inactive': 'Inactive',
    'common.saving': 'Saving…',
    'common.register': 'Register',
    'common.soon': 'Coming soon',
    'common.execute': 'Run…',
    'common.executing': 'Running…',
    'critical.action.wipe-operational.title': 'Delete operational data',
    'critical.action.wipe-operational.description': 'Deletes scheduling, stock movements, maintenance and fuel data. Keeps users and main records.',
    'critical.action.reset-settings.title': 'Reset settings',
    'critical.action.reset-settings.description': 'Deletes system preferences (currency, timezone, pagination, etc.).',
    'critical.action.purge-users.title': 'Remove all users',
    'critical.action.purge-users.description': 'Keeps only the Main Administrator. Irreversible.',
    'critical.action.revoke-sessions.title': 'End all sessions',
    'critical.action.revoke-sessions.description': 'All users will need to sign in again.',
    'critical.action.restore-backup.title': 'Restore backup',
    'critical.action.restore-backup.description': 'Restores data from a backup file (coming soon).',
    'critical.action.delete-company.title': 'Delete company',
    'critical.action.delete-company.description': 'Permanently removes company data (coming soon).',
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
