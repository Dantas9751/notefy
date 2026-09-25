"""Chamadas aos provedores de IA em streaming (SSE).

A chave do usuário mora nas preferências (banco local) e só é usada aqui,
dentro do backend — nunca vai para o navegador. O formato de saída é
sempre o mesmo (chunks de texto), independente do provedor.
"""

import json

import httpx

#: Modelo padrão por provedor quando o usuário não escolhe um.
#:
#: `custom` não aparece aqui de propósito — cada gateway usa seus próprios
#: nomes. Hoje ele cai no mesmo fallback dos outros (`gpt-4o-mini`), o que
#: só funciona em gateway que aceita nomes da OpenAI; nos demais o pedido
#: volta 400 vindo do provedor. Exigir o modelo no formulário de
#: preferências é o conserto certo, e é mudança de comportamento.
MODELO_PADRAO = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-latest",
    "ollama": "llama3.2",
}

#: URL base por provedor quando o usuário não informa uma.
BASE_PADRAO = {
    "openai": "https://api.openai.com/v1",
    "ollama": "http://localhost:11434/v1",
}

#: Conexão curta, leitura longa: a resposta em stream demora minutos.
TIMEOUT = httpx.Timeout(connect=15, read=300, write=30, pool=15)

#: Quantas mensagens do histórico entram na chamada (as mais recentes).
MAX_MESSAGES = 12

#: Teto de caracteres do documento que entram no contexto do sistema.
MAX_CONTEXTO = 12000


class ErroProvedor(Exception):
    """Provedor respondeu com erro (HTTP != 200)."""

    def __init__(self, status, detail):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def modelo_do(prefs):
    return (prefs.ai_model or "").strip() or MODELO_PADRAO.get(
        prefs.ai_provider, "gpt-4o-mini"
    )


def base_do(prefs):
    """URL base da API, sem barra final e já terminando em /v1.

    Gateways compatíveis com OpenAI (9router, OpenRouter, LM Studio...)
    são configurados colando a URL do serviço; aceitar tanto
    `https://host` quanto `https://host/v1` evita o erro mais comum.
    """
    base = (prefs.ai_base_url or "").strip().rstrip("/")
    if not base:
        base = BASE_PADRAO.get(prefs.ai_provider, BASE_PADRAO["openai"])
    if not base.endswith("/v1"):
        base = f"{base}/v1"
    return base


def _mapear_erro(status, corpo):
    """Traduz o erro do provedor para (status HTTP, mensagem amigável)."""
    if status in (401, 403):
        return 401, "Chave de IA inválida ou sem permissão para este modelo."
    if status == 429:
        return 429, "O provedor de IA está com limite de uso. Tente de novo em instantes."
    if status == 400:
        try:
            dados = json.loads(corpo or b"{}")
            mensagem = (
                (dados.get("error") or {}).get("message") or dados.get("message")
            )
        except ValueError:
            mensagem = None
        return 400, mensagem or "O provedor recusou o pedido."
    return 502, "O provedor de IA falhou ao responder."


def _extrair_pedaco(evento, provider):
    """Texto de um evento SSE, no dialeto do provedor.

    Aceita tanto o formato de stream (`delta`) quanto o de resposta
    inteira (`message`): há gateway que devolve um único evento SSE já
    com a mensagem completa.
    """
    if provider == "anthropic":
        if evento.get("type") == "content_block_delta":
            return (evento.get("delta") or {}).get("text") or ""
        return ""
    escolha = (evento.get("choices") or [{}])[0]
    delta = escolha.get("delta") or {}
    mensagem = escolha.get("message") or {}
    return delta.get("content") or mensagem.get("content") or escolha.get("text") or ""


def _juntar_sse(corpo, provider):
    """Remonta o texto de um corpo SSE recebido de uma vez.

    Devolve "" quando o corpo não é SSE reconhecível — aí quem chamou
    decide o erro.
    """
    partes = []
    for linha in corpo.splitlines():
        linha = linha.strip()
        if not linha.startswith("data:"):
            continue
        dado = linha[5:].strip()
        if dado == "[DONE]":
            break
        try:
            evento = json.loads(dado)
        except ValueError:
            continue
        partes.append(_extrair_pedaco(evento, provider))
    return "".join(partes)


def _requisicao(prefs, mensagens, sistema, *, stream):
    """(url, cabeçalhos, payload) para o provedor configurado.

    Anthropic tem rota, header de chave e formato próprios; openai, ollama
    e custom falam todos o mesmo dialeto (/chat/completions com SSE) e só
    divergem na URL base e em haver ou não chave.

    Entre stream e chamada inteira muda a criatividade e o teto de saída:
    conversa quer texto solto, gerar documento quer JSON válido e mais
    espaço para terminar a estrutura.
    """
    if prefs.ai_provider == "anthropic":
        return (
            "https://api.anthropic.com/v1/messages",
            {"x-api-key": prefs.ai_key, "anthropic-version": "2023-06-01"},
            {
                "model": modelo_do(prefs),
                "messages": mensagens,
                "system": sistema,
                "max_tokens": 2048 if stream else 4096,
                **({"stream": True} if stream else {}),
            },
        )
    return (
        f"{base_do(prefs)}/chat/completions",
        {"Authorization": f"Bearer {prefs.ai_key}"} if prefs.ai_key else {},
        {
            "model": modelo_do(prefs),
            "messages": [{"role": "system", "content": sistema}, *mensagens],
            # Explícito nos dois casos: alguns gateways assumem stream
            # quando o campo falta, e devolvem SSE numa chamada que
            # espera JSON.
            "stream": stream,
            "temperature": 0.7 if stream else 0.2,
        },
    )


def abrir(prefs, mensagens, sistema):
    """Abre a conexão com o provedor e devolve (cliente, resposta).

    Erros HTTP do provedor viram ErroProvedor (o view responde com status
    próprio). Erros de conexão propagam como exceções httpx — o view os
    transforma em 502. O cliente NUNCA é fechado aqui: quem consome o
    stream o fecha no finally.
    """
    url, cabecalhos, payload = _requisicao(prefs, mensagens, sistema, stream=True)
    cliente = httpx.Client(timeout=TIMEOUT)

    try:
        pedido = cliente.build_request("POST", url, headers=cabecalhos, json=payload)
        resposta = cliente.send(pedido, stream=True)
    except Exception:
        cliente.close()
        raise

    if resposta.status_code != 200:
        corpo = resposta.read()
        cliente.close()
        raise ErroProvedor(*_mapear_erro(resposta.status_code, corpo))
    # Se o provedor devolveu 200 mas retornou HTML (página de erro disfarçada),
    # fechar e avisar em vez de travar o stream.
    ct = resposta.headers.get("content-type", "")
    if "text/html" in ct:
        resposta.read()
        cliente.close()
        raise ErroProvedor(502, "O provedor retornou uma resposta inválida.")

    return cliente, resposta


def completar(prefs, mensagens, sistema):
    """Chamada SEM streaming: devolve o texto inteiro de uma vez.

    JSON pela metade não valida, então tudo que gera documento passa por
    aqui em vez do stream.
    """
    url, cabecalhos, payload = _requisicao(prefs, mensagens, sistema, stream=False)
    with httpx.Client(timeout=TIMEOUT) as cliente:
        resposta = cliente.post(url, headers=cabecalhos, json=payload)
        if resposta.status_code != 200:
            raise ErroProvedor(*_mapear_erro(resposta.status_code, resposta.content))

        bruto = resposta.text
        try:
            dados = resposta.json()
        except ValueError:
            # Vários gateways compatíveis com OpenAI (9router, OpenRouter,
            # LM Studio...) respondem em SSE MESMO com `stream: False`. O
            # corpo então é uma sequência de `data: {...}`, e `.json()`
            # estoura — era isto que derrubava tudo que não é o chat (o
            # chat já lia SSE) com um 502 sem explicação.
            texto = _juntar_sse(bruto, prefs.ai_provider)
            if texto:
                return texto
            raise ErroProvedor(502, "O provedor retornou uma resposta inválida.")

    if prefs.ai_provider == "anthropic":
        return "".join(
            bloco.get("text", "")
            for bloco in dados.get("content") or []
            if isinstance(bloco, dict)
        )
    escolha = (dados.get("choices") or [{}])[0]
    return (escolha.get("message") or {}).get("content") or escolha.get("text") or ""


def iterar(resposta, provider):
    """Gera os pedaços de texto da resposta em stream do provedor."""
    for linha in resposta.iter_lines():
        if not linha or not linha.startswith("data:"):
            continue
        dado = linha[5:].strip()
        if dado == "[DONE]":
            return
        try:
            evento = json.loads(dado)
        except ValueError:
            continue
        texto = _extrair_pedaco(evento, provider)
        if texto:
            yield texto
