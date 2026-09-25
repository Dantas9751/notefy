"""Onde o banco e os uploads vão parar.

Errar isto não dá erro de configuração: o SQLite abre um arquivo vazio
onde mandarem, e a aplicação inteira passa a responder "no such table:
users_user". O usuário vê 500 no login e nada explica que o problema é
um caminho.

Aconteceu duas vezes, pelos dois motivos testados aqui.
"""

from pathlib import Path
from unittest import mock

from django.conf import settings
from django.test import SimpleTestCase

from .settings import _pasta_de_dados


class PastaDeDadosTests(SimpleTestCase):
    def com_env(self, valor):
        with mock.patch.dict("os.environ", {"NOTEFY_DATA_DIR": valor}):
            return _pasta_de_dados()

    def test_vazio_cai_na_pasta_do_backend(self):
        """`NOTEFY_DATA_DIR=` no `.env` NÃO usa o default do `env()`.

        A chave existe, então o valor é `""` — e `Path("")` é `.`, o
        diretório de onde se rodou o comando, não o do projeto.
        """
        self.assertEqual(self.com_env(""), settings.BASE_DIR)

    def test_so_espaco_tambem_cai_no_padrao(self):
        self.assertEqual(self.com_env("   "), settings.BASE_DIR)

    def test_caminho_relativo_parte_do_projeto_e_nao_do_terminal(self):
        """Senão `manage.py` rodado da raiz e de dentro de `backend/`
        abririam bancos diferentes."""
        self.assertEqual(self.com_env("dados"), settings.BASE_DIR / "dados")

    def test_caminho_absoluto_e_respeitado(self):
        # É assim que o app de desktop aponta para a pasta do usuário.
        absoluto = Path(settings.BASE_DIR).anchor + "dados-notefy"
        self.assertEqual(self.com_env(absoluto), Path(absoluto))

    def test_a_pasta_de_dados_e_absoluta(self):
        """O invariante que impede o bug: caminho absoluto.

        Sendo relativo, `manage.py` rodado da raiz e de dentro de
        `backend/` abriria bancos diferentes — e o segundo nasceria vazio.

        Conferir `DATABASES["default"]["NAME"]` aqui não serviria: o
        runner do Django troca esse valor pelo banco em memória antes dos
        testes, então a asserção passaria ou falharia conforme a suíte
        rodasse sozinha ou inteira.
        """
        self.assertTrue(Path(settings.DATA_DIR).is_absolute(), settings.DATA_DIR)
