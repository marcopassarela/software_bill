"""
Hub de eventos em tempo real (SSE) por empresa.

Fica em arquivo próprio (nem em models.py, nem em main.py) por um motivo
simples: models.py precisa *disparar* notificações a partir de um listener
de evento do SQLAlchemy (antes/depois do commit) e main.py precisa
*consumir* essas notificações no endpoint GET /events/stream. Se o hub
vivesse em main.py, importar main de dentro de models.py criaria import
circular.

IMPORTANTE — limite conhecido deste design:
Este hub guarda as filas de assinantes (asyncio.Queue) em memória do
processo Python. Isso só funciona de forma 100% confiável enquanto o
backend roda como um único processo/worker uvicorn de vida longa (ex.:
um serviço always-on no Render/Fly/Railway, ou um container próprio).

Se o backend estiver publicado como função serverless (é o caso atual do
projeto no Vercel, via api/index.py), cada requisição pode ser atendida
por uma instância diferente da função, cada uma com sua própria memória.
Nesse cenário, um usuário com a aba de SSE aberta pode estar "escutando"
numa instância enquanto a escrita de outro usuário acontece em outra
instância — e a notificação nunca chega. Sintoma típico: às vezes
atualiza sozinho, às vezes só depois de recarregar a página manualmente.

Isso não afeta a economia de CU (nenhuma consulta é feita ao Postgres
enquanto ninguém escreve nada), mas afeta a confiabilidade do "atualiza
para todos em tempo real". Se isso for observado em produção, a correção
correta é trocar este hub em memória por um backplane externo compartilhado
entre instâncias (ex.: Redis Pub/Sub via Upstash, que tem camada grátis e
funciona bem com Vercel) — não por voltar a fazer polling no Neon.
"""

from __future__ import annotations

import asyncio


class CompanyHub:
    """SSE in-memory por empresa. Zero consulta ao banco enquanto ninguém
    escreve nada — o keepalive do SSE não toca o Postgres."""

    def __init__(self) -> None:
        self._subs: dict[int, list[asyncio.Queue]] = {}

    def subscribe(self, company_id: int) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=64)
        self._subs.setdefault(int(company_id), []).append(q)
        return q

    def unsubscribe(self, company_id: int, q: asyncio.Queue) -> None:
        lst = self._subs.get(int(company_id)) or []
        if q in lst:
            lst.remove(q)
        if not lst:
            self._subs.pop(int(company_id), None)

    def notify(self, company_id: int, module: str = "*", reason: str = "changed") -> None:
        dead: list[asyncio.Queue] = []
        payload = {
            "type": "company_changed",
            "module": module or "*",
            "reason": reason,
        }
        for q in list(self._subs.get(int(company_id)) or []):
            try:
                q.put_nowait(payload)
            except Exception:
                dead.append(q)
        for q in dead:
            self.unsubscribe(company_id, q)


# Instância única do processo. Compartilhada entre main.py (assina/serve
# o SSE) e models.py (dispara a notificação a partir do listener de commit).
company_hub = CompanyHub()


def notify_company_changed(
    company_id: int | None,
    module: str = "*",
    reason: str = "changed",
) -> None:
    """Avisa (melhor esforço, nunca levanta exceção) todos os clientes
    conectados dessa empresa de que algo mudou em `module`."""
    if not company_id:
        return
    try:
        company_hub.notify(int(company_id), module, reason)
    except Exception:
        pass