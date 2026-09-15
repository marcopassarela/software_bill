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
import os
from typing import Any, AsyncIterator, Optional

REDIS_URL = os.environ.get("REDIS_URL") or os.environ.get("UPSTASH_REDIS_URL")


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

if REDIS_URL:
    try:
        import redis as _redis_sync

        _redis_sync_client = _redis_sync.from_url(
            REDIS_URL,
            socket_timeout=2,
            socket_connect_timeout=2,
        )
    except Exception:
        # Se a lib "redis" não estiver instalada ou a URL for inválida,
        # cai para o hub em memória em vez de quebrar o app inteiro.
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
    except Exception:
        pass


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
        socket_timeout=30,
        socket_connect_timeout=5,
    )
    pubsub = client.pubsub()
    await pubsub.subscribe(_channel(company_id))
    try:
        while True:
            msg = await pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=25.0,
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