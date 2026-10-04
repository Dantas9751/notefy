"""Arquivos que um documento cita por dentro do próprio conteúdo.

Imagem colada numa nota vira um `<img src=".../media/files/...png">` no
HTML da seção; imagem colada no canvas vira `node.url`. Nos dois casos o
documento guarda o CAMINHO do arquivo, e o arquivo mora noutro registro
(um anexo). Sempre que o arquivo ganha caminho novo, quem o cita precisa
ser reescrito junto, ou a imagem some:

- restaurar um backup recria cada arquivo com nome novo;
- duplicar um documento copia os anexos para arquivos novos (senão a
  cópia dependeria dos arquivos do original, e apagar o original
  quebrava a cópia).
"""

import json


def trocar_caminhos(data, trocas):
    """`data` com cada caminho antigo de `trocas` trocado pelo novo.

    Troca no JSON inteiro, e não em campos conhecidos: a nota guarda o
    caminho dentro de HTML, o canvas num atributo de nó, e o próximo
    editor pode guardar em outro lugar. Os caminhos terminam num nome
    aleatório de 32 caracteres hexadecimais, então não há como um trecho
    de texto do usuário coincidir com um deles por acaso.
    """
    if not data or not trocas:
        return data
    original = json.dumps(data, ensure_ascii=False)
    texto = original
    for antigo, novo in trocas.items():
        texto = texto.replace(antigo, novo)
    return data if texto == original else json.loads(texto)
