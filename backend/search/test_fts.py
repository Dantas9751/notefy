"""Índice de texto completo: escape, ranking e sincronia.

A parte que mais quebra não é a consulta, são os gatilhos: um índice que
deixa de acompanhar o UPDATE some com o documento da busca sem erro
nenhum, e ninguém percebe até procurar por algo que existe.
"""

from django.test import TestCase

from content.models import Document
from core.testutils import make_category, make_document, make_folder, make_user

from .fts import ids_por_relevancia, para_match


class EscapeTests(TestCase):
    """O que o usuário digita é texto, não sintaxe do FTS5."""

    def test_palavra_simples_vira_prefixo(self):
        # `*` na última palavra: o resultado aparece enquanto se digita.
        self.assertEqual(para_match("dijkstra"), '"dijkstra"*')

    def test_hifen_nao_vira_operador(self):
        # Sem as aspas, `-ford` seria exclusão no FTS5.
        self.assertEqual(para_match("bellman-ford"), '"bellman" "ford"*')

    def test_aspas_e_parenteses_nao_estouram(self):
        # Estes três estouravam a consulta com erro de sintaxe.
        for entrada in ('a"b', "O(VE)", "x AND y", "NOT z"):
            with self.subTest(entrada=entrada):
                self.assertIsNotNone(para_match(entrada))

    def test_termo_vazio_devolve_none(self):
        # `None` é "sem termo" (lista tudo); lista vazia seria "nada achado".
        for vazio in ("", "   ", "!!!", None):
            with self.subTest(vazio=vazio):
                self.assertIsNone(para_match(vazio))


class IndiceTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.category = make_category(self.user)
        self.folder = make_folder(self.user, category=self.category)

    def _nota(self, titulo, corpo=""):
        return make_document(
            self.user,
            folder=self.folder,
            kind=Document.Kind.NOTE,
            title=titulo,
            content=f"<p>{corpo}</p>",
        )

    def test_acha_sem_acento_o_que_foi_escrito_com_acento(self):
        """`remove_diacritics 2`. Num app em português isto é a busca."""
        doc = self._nota("Cálculo III")
        self.assertIn(str(doc.id).replace("-", ""), _ids("calculo"))

    def test_titulo_ganha_do_corpo(self):
        """O peso do bm25 conta a coluna UNINDEXED — medido, não deduzido.

        Com o peso na posição errada o ranking saía invertido: a nota que
        só mencionava o termo vinha antes da nota com aquele nome.
        """
        no_titulo = self._nota("Prova de Cálculo", "conteudo qualquer")
        no_corpo = self._nota("Integrais de linha", "a prova prova prova sera terca")

        ids = _ids("prova")
        self.assertLess(
            ids.index(_hex(no_titulo)),
            ids.index(_hex(no_corpo)),
            "documento com o termo no título deveria vir primeiro",
        )

    def test_gatilho_de_insert(self):
        doc = self._nota("Bellman-Ford")
        self.assertIn(_hex(doc), _ids("bellman"))

    def test_gatilho_de_update(self):
        doc = self._nota("Nome velho")
        doc.title = "Nome novo"
        doc.save()
        self.assertIn(_hex(doc), _ids("novo"))
        self.assertNotIn(_hex(doc), _ids("velho"))

    def test_gatilho_de_delete(self):
        doc = self._nota("Some daqui")
        doc.hard_delete()
        self.assertNotIn(_hex(doc), _ids("some"))

    def test_acha_pelo_corpo_e_nao_so_pelo_titulo(self):
        """É o que faz planilha e diagrama serem achados pelo conteúdo."""
        doc = self._nota("Titulo neutro", "mencao a fermentacao natural")
        self.assertIn(_hex(doc), _ids("fermentacao"))

    def test_sem_termo_devolve_none(self):
        self.assertIsNone(ids_por_relevancia("   "))


def _hex(doc):
    """Como o SQLite guarda o UUID do Django: 32 hex, sem hífen."""
    return str(doc.id).replace("-", "")


def _ids(termo):
    return ids_por_relevancia(termo) or []
