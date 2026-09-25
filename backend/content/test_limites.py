"""Os tetos de seção precisam bater entre o backend e o editor.

O backend RECUSA o que passa do limite; o editor IMPEDE que se chegue
lá. Se os números divergirem, o editor deixa a pessoa passar e o
autosave começa a levar 400 — o documento para de ser gravado enquanto
ela continua digitando, que é a pior forma de falhar que existe aqui.

Ler o arquivo do frontend é feio, e é de propósito: é mais barato do que
servir dois inteiros por uma rota nova, e prende os dois lados sem
nenhuma máquina em tempo de execução.
"""

import re
from pathlib import Path

from django.test import SimpleTestCase

from .schemas import MAX_COLUNAS_TABELA, MAX_ITENS_SECAO

ESPELHO = (
    Path(__file__).resolve().parent.parent.parent / "frontend" / "src" / "lib" / "limites.js"
)


def _constante(fonte, nome):
    achado = re.search(rf"export const {nome} = (\d+)", fonte)
    return int(achado.group(1)) if achado else None


class LimitesEspelhadosTests(SimpleTestCase):
    def setUp(self):
        if not ESPELHO.exists():
            self.skipTest(f"{ESPELHO} não existe — backend empacotado sem o frontend.")
        self.fonte = ESPELHO.read_text(encoding="utf-8")

    def test_max_itens_bate(self):
        self.assertEqual(_constante(self.fonte, "MAX_ITENS_SECAO"), MAX_ITENS_SECAO)

    def test_max_colunas_bate(self):
        self.assertEqual(
            _constante(self.fonte, "MAX_COLUNAS_TABELA"), MAX_COLUNAS_TABELA
        )
