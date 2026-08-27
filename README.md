# Gestão Logística

Sistema interno multiusuário para rotas, frota, manutenção, combustível, estoque, clientes e auditoria. Frontend em Next.js/TypeScript/Tailwind e API FastAPI/SQLAlchemy com PostgreSQL.

## Segurança

Não há cadastro público. Senhas usam Argon2id; sessões usam JWT em cookie HttpOnly/SameSite e `Secure` em produção. Há limite de login por IP, validação Pydantic, RBAC no backend, desativação lógica e auditoria. Apenas o administrador principal gerencia usuários e consulta os logs.

Saídas de estoque usam `SELECT FOR UPDATE` dentro da transação PostgreSQL, impedindo saldo negativo em retiradas concorrentes.

## Desenvolvimento local

1. Copie `.env.example` para `.env` e defina `AUTH_SECRET` aleatório.
2. `docker compose up -d postgres`
3. `python -m venv .venv` e `.\.venv\Scripts\pip install -r backend\requirements.txt`
4. `.\.venv\Scripts\alembic upgrade head`
5. `.\.venv\Scripts\uvicorn backend.app.main:app --reload`
6. Em outro terminal: `npm install` e `npm run dev`

O schema também é criado na inicialização apenas para facilitar desenvolvimento local; em produção aplique sempre Alembic.

## Vercel

Use PostgreSQL gerenciado compatível (Neon ou Supabase). Configure `DATABASE_URL`, `AUTH_SECRET`, `GOOGLE_MAPS_API_KEY` (opcional), `COOKIE_SECURE=true` e `NEXT_PUBLIC_API_URL=/api` no projeto Vercel. Não exponha secrets em variáveis `NEXT_PUBLIC_*`; `/api` é somente o caminho público da API. A função FastAPI está em `api/index.py`; aplique `alembic upgrade head` contra a URL de produção antes do deploy.

## Backup

Habilite backup/PITR no provedor PostgreSQL. Restaure um banco ou branch pelo painel do provedor e aponte `DATABASE_URL` a ele; para operação manual use `pg_dump` e `pg_restore` com as credenciais do provedor. Não há cópia local simulada.

## Verificação

Execute `pytest tests` e `npm run build`. Testes de integração devem usar um PostgreSQL isolado por meio de `DATABASE_URL`.
