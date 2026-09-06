-- ============================================================
-- RECRIAÇÃO DO BANCO (multi-tenant / planos por empresa)
-- ============================================================
-- ATENÇÃO: este script APAGA TODOS OS DADOS do schema public.
-- Use apenas em banco novo / de teste, conforme combinado.
--
-- Depois de rodar este script, basta iniciar o backend (uvicorn).
-- No startup, o SQLAlchemy (Base.metadata.create_all) recria TODAS as
-- tabelas já no novo formato:
--   - nova tabela "companies" (empresa assinante + plano)
--   - coluna "company_id" em todas as tabelas de dados (isolamento total)
--   - coluna "is_owner" em "users"
--   - "settings" com PK própria e chave única por empresa
--
-- Como aplicar (psql):
--   psql "$DATABASE_URL" -f backend/reset_db.sql
--
-- Em seguida, inicie o backend e crie a primeira empresa pela tela
-- "Criar conta da empresa".
-- ============================================================

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Restaura permissões padrão do schema.
GRANT ALL ON SCHEMA public TO public;
