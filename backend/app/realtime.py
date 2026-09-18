"""
Backplane de eventos em tempo real (SSE).

POR QUE ESTE ARQUIVO FOI REESCRITO
-----------------------------------
A versão anterior guardava os assinantes SSE (asyncio.Queue) na memória
do processo Python — um "CompanyHub" local. Isso funciona perfeitamente
quando o backend roda como UM processo único e persistente. Mas este
projeto está publicado na Vercel como função serverless (api/index.py):
cada requisição pode ser atendida por uma instância diferente da função,
cada uma com sua própria memória isolada.

Sintoma observado: usuário A altera um registro, mas o usuário B (com a
tela aberta) só vê a mudança depois de trocar de aba ou dar F5. Isso
acontece porque a escrita de A e a conexão SSE de B, muito provavelmente,
foram atendidas por instâncias diferentes da função — a notificação nunca
chegou a existir na memória de quem estava "escutando".

A CORREÇÃO: usar Redis Pub/Sub (ex.: Upstash Redis, tem camada grátis e
foi feito para funcionar bem com ambientes serverless) como o único
"estado compartilhado" entre instâncias. Continua sem gastar CU do
Postgres/Neon: o Redis é um serviço à parte, e nenhuma consulta ao Neon
acontece por causa disso.

- notify_company_changed(...) PUBLICA no canal `company:{id}` do Redis.
  Não importa em qual instância da função a escrita aconteceu.
- subscribe_events(...) é um gerador assíncrono que ASSINA esse mesmo
  canal. Não importa em qual instância a conexão SSE está sendo servida
  — o Redis entrega a mensagem para todas as assinaturas ativas daquele
  canal, em qualquer instância.

CONFIGURAÇÃO NECESSÁRIA
------------------------
Defina a env var REDIS_URL (ou UPSTASH_REDIS_URL) com a connection string
do Redis, tanto localmente (.env) quanto no projeto da Vercel. Exemplo de
URL do Upstash: rediss://default:<senha>@<host>.upstash.io:6379

SEM REDIS_URL configurada, este módulo cai automaticamente para um hub em
memória (comportamento antigo) — suficiente para rodar localmente com
`uvicorn` num processo só, mas NÃO resolve o problema em produção na
Vercel. Configure REDIS_URL em produção.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, AsyncIterator, Optional

logger = logging.getLogger("realtime")

# A integração do Redis na Vercel (Marketplace/Storage → Upstash) nem
# sempre cria a variável com o nome exato "REDIS_URL" — às vezes vem como
# KV_URL, ou com outro prefixo dependendo de como foi conectado. Checamos
# os nomes mais comuns nessa ordem, e uso o primeiro que existir.
_ENV_CANDIDATES = ("REDIS_URL", "UPSTASH_REDIS_URL", "KV_URL", "STORAGE_URL")
REDIS_URL = next((os.environ.get(name) for name in _ENV_CANDIDATES if os.environ.get(name)), None)
_REDIS_URL_SOURCE = next((name for name in _ENV_CANDIDATES if os.environ.get(name)), None)

if REDIS_URL:
    logger.info("[realtime] usando Redis via env var %s", _REDIS_URL_SOURCE)
else:
    logger.warning(
        "[realtime] nenhuma das env vars %s está configurada — caindo para "
        "o hub em memória (não sincroniza entre instâncias serverless).",
        _ENV_CANDIDATES,
    )


def _channel(company_id: int) -> str:
    return f"company-changed:{int(company_id)}"


# ============================================================
# Fallback em memória (só para desenvolvimento local sem Redis)
# ============================================================


class _InMemoryHub:
    """Hub simples de um processo só. Usado apenas quando REDIS_URL não
    está configurada — típico em desenvolvimento local com um único
    `uvicorn` rodando na máquina do desenvolvedor."""

    def __init__(self) -> None:
        self._subs: dict[int, list[asyncio.Queue]] = {}

    def publish(self, company_id: int, module: str, reason: str) -> None:
        payload = {
            "type": "company_changed",
            "module": module or "*",
            "reason": reason,
        }
        dead: list[asyncio.Queue] = []
        for q in list(self._subs.get(int(company_id)) or []):
            try:
                q.put_nowait(payload)
            except Exception:
                dead.append(q)
        for q in dead:
            self._unsubscribe(company_id, q)

    def _unsubscribe(self, company_id: int, q: asyncio.Queue) -> None:
        lst = self._subs.get(int(company_id)) or []
        if q in lst:
            lst.remove(q)
        if not lst:
            self._subs.pop(int(company_id), None)

    async def listen(self, company_id: int) -> AsyncIterator[Optional[dict]]:
        q: asyncio.Queue = asyncio.Queue(maxsize=64)
        self._subs.setdefault(int(company_id), []).append(q)
        try:
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield msg
                except asyncio.TimeoutError:
                    yield None  # sinal de keepalive
        finally:
            self._unsubscribe(company_id, q)


_memory_hub = _InMemoryHub()


# ============================================================
# Cliente Redis (só criado se REDIS_URL estiver configurada)
# ============================================================

_redis_sync_client = None  # usado para publicar (rápido, síncrono)
_client_creation_error: str | None = None  # guardado pro /debug/realtime

if REDIS_URL:
    try:
        import redis as _redis_sync

        _redis_sync_client = _redis_sync.from_url(
            REDIS_URL,
            socket_timeout=2,
            socket_connect_timeout=2,
        )
        # from_url não conecta na hora (é preguiçoso) — força um PING
        # aqui só pra já aparecer no log do deploy se a URL/senha/host
        # estiverem erradas, em vez de descobrir isso só quando alguém
        # reportar "não atualizou".
        try:
            _redis_sync_client.ping()
            logger.info("[realtime] PING no Redis OK na inicialização")
        except Exception as exc:
            _client_creation_error = f"ping falhou: {exc!r}"
            logger.error("[realtime] PING no Redis FALHOU na inicialização: %r", exc)
    except Exception as exc:
        # Se a lib "redis" não estiver instalada ou a URL for inválida,
        # cai para o hub em memória em vez de quebrar o app inteiro.
        _client_creation_error = f"falha ao criar cliente: {exc!r}"
        logger.error("[realtime] falha ao criar cliente Redis: %r", exc)
        _redis_sync_client = None


def notify_company_changed(
    company_id: int | None,
    module: str = "*",
    reason: str = "changed",
) -> None:
    """Avisa (melhor esforço, nunca levanta exceção) todos os clientes
    conectados dessa empresa de que algo mudou em `module`. Publica no
    Redis quando configurado; senão usa o hub em memória local."""
    if not company_id:
        return
    try:
        if _redis_sync_client is not None:
            payload = json.dumps(
                {
                    "type": "company_changed",
                    "module": module or "*",
                    "reason": reason,
                }
            )
            _redis_sync_client.publish(_channel(company_id), payload)
        else:
            _memory_hub.publish(company_id, module, reason)
    except Exception as exc:
        logger.error(
            "[realtime] falha ao publicar evento (company=%s, module=%s): %r",
            company_id, module, exc,
        )

def debug_publish_company_changed(company_id: int) -> dict[str, Any]:
    payload = json.dumps(
        {
            "type": "company_changed",
            "module": "*",
            "reason": "debug_test",
        }
    )

    if _redis_sync_client is None:
        return {
            "publish_ok": False,
            "subscribers_received": 0,
            "publish_error": "Cliente Redis não disponível.",
        }

    try:
        published = _redis_sync_client.publish(
            _channel(company_id),
            payload,
        )

        return {
            "publish_ok": True,
            "subscribers_received": int(published),
        }

    except Exception as exc:
        logger.error(
            "Falha no teste de publicação Redis: %r",
            exc,
        )
        return {
            "publish_ok": False,
            "subscribers_received": 0,
            "publish_error": repr(exc),
        }


def redis_diagnostics() -> dict[str, Any]:
    """Usado pelo endpoint GET /debug/realtime para você conseguir ver,
    sem precisar caçar nos logs, se o Redis está de fato conectado."""
    info: dict[str, Any] = {
        "env_var_encontrada": _REDIS_URL_SOURCE,
        "redis_url_configurada": bool(REDIS_URL),
        "cliente_criado": _redis_sync_client is not None,
        "ping_ok": False,
        "erro": _client_creation_error,
    }
    if _redis_sync_client is not None:
        try:
            info["ping_ok"] = bool(_redis_sync_client.ping())
        except Exception as exc:
            info["erro"] = repr(exc)
    return info


async def subscribe_events(company_id: int) -> AsyncIterator[Optional[dict[str, Any]]]:
    """
    Gerador assíncrono consumido pelo endpoint GET /events/stream.
    Cede um dict de evento a cada mudança real, ou None periodicamente
    (a cada ~25s) só para o endpoint mandar um comentário de keepalive
    — isso não é uma consulta ao banco, é só manter a conexão HTTP viva.
    """
    if _redis_sync_client is None:
        async for msg in _memory_hub.listen(company_id):
            yield msg
        return

    import redis.asyncio as _redis_async

    client = _redis_async.from_url(
    REDIS_URL,
    socket_timeout=90,
    socket_connect_timeout=5,
    )
    pubsub = client.pubsub()
    await pubsub.subscribe(_channel(company_id))
    try:
        while True:
            msg = await pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=20.0,
            )
            if msg is None:
                yield None  # keepalive
                continue
            try:
                data = msg.get("data")
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                yield json.loads(data)
            except Exception:
                continue
    finally:
        try:
            await pubsub.unsubscribe(_channel(company_id))
            await pubsub.close()
        finally:
            await client.close()