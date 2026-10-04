"""Entrega os arquivos enviados sem deixar nenhum deles virar página.

Um `.html` ou `.svg` enviado como arquivo era servido com o próprio tipo
(`text/html`, `image/svg+xml`) e `Content-Disposition: inline`: aberto pelo
link, o navegador EXECUTAVA o que houvesse dentro. Em desenvolvimento o Vite
serve `/media` na mesma origem do app, e ali o script lia o token de sessão
do `localStorage`. Bastava alguém mandar um SVG "de logo" para a pessoa
subir no Notefy.

Aqui, todo tipo que o navegador executa sai como download, e com
`Content-Security-Policy: sandbox`, que tira do documento a origem e os
scripts mesmo que algum navegador ignore o `attachment`.

O preview do app não sente a diferença: ele baixa o arquivo como blob
(`useBlobUrl`) e desenha a partir dali, e `<img>` ignora esses cabeçalhos.
"""

from django.conf import settings
from django.views.static import serve

#: Tipos que o navegador executa, e não só exibe, quando abertos direto.
TIPOS_ATIVOS = {
    "text/html",
    "application/xhtml+xml",
    "image/svg+xml",
    "text/xml",
    "application/xml",
    "text/javascript",
    "application/javascript",
    "application/x-javascript",
}


def e_tipo_ativo(content_type):
    tipo = (content_type or "").split(";", 1)[0].strip().lower()
    return tipo in TIPOS_ATIVOS or tipo.endswith("+xml")


def servir_midia(request, path):
    resposta = serve(request, path, document_root=settings.MEDIA_ROOT)
    resposta["X-Content-Type-Options"] = "nosniff"
    if e_tipo_ativo(resposta.get("Content-Type")):
        atual = resposta.get("Content-Disposition", "")
        resposta["Content-Disposition"] = (
            atual.replace("inline", "attachment", 1) if atual.startswith("inline") else "attachment"
        )
        resposta["Content-Security-Policy"] = "sandbox; default-src 'none'"
    return resposta
