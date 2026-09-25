"""O que o usuário digita na caixa de busca.

O FTS5 tem sintaxe própria: hífen é operador, aspas abrem frase,
parêntese agrupa. Termo cru vai para o índice e a consulta estoura em
vez de não achar nada — e o usuário digita `bellman-ford` e `O(VE)` sem
saber que existe sintaxe.
"""

from content.models import Document
from core.testutils import make_category, make_document, make_folder, make_user
from rest_framework.test import APITestCase


class TermosDeBuscaTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.categoria = make_category(self.user, name="Faculdade")
        self.pasta = make_folder(self.user, category=self.categoria, name="Calculo")
        self.client.force_authenticate(self.user)
        for titulo in ("Integrais definidas", "Derivada de função composta"):
            make_document(
                self.user, folder=self.pasta, kind=Document.Kind.NOTE, title=titulo
            )

    def buscar(self, termo):
        resposta = self.client.get("/api/search/", {"q": termo})
        self.assertEqual(resposta.status_code, 200, f"{termo!r} -> {resposta.status_code}")
        return [r["title"] for r in resposta.json()["results"]]

    def test_termo_so_de_pontuacao_nao_derruba_a_busca(self):
        """`***` não tem nenhuma palavra dentro.

        A camada FTS devolve `None` para dizer isso, e o `None` ia direto
        para um `filter(id__in=None)` — 500 para quem digitou três
        asteriscos, ou colou um marcador de lista, ou só apertou `?`.
        """
        for termo in ("***", "?", "---", "()", "•"):
            self.assertEqual(self.buscar(termo), [], termo)

    def test_caixa_vazia_continua_listando_tudo(self):
        """Só espaço NÃO é o mesmo caso: é caixa vazia, e caixa vazia
        mostra a biblioteca. A view já faz `strip()`."""
        self.assertEqual(len(self.buscar("   ")), 3)

    def test_sintaxe_do_fts_e_tratada_como_texto(self):
        # Cada uma destas estouraria a consulta se fosse crua ao MATCH.
        for termo in ('"integrais"', "a)", "pre-calculo", "integrais OR x", "NOT a"):
            self.buscar(termo)

    def test_acento_nao_muda_o_resultado(self):
        self.assertEqual(self.buscar("funcao"), self.buscar("função"))
        self.assertEqual(len(self.buscar("funcao")), 1)

    def test_prefixo_acha_enquanto_se_digita(self):
        self.assertEqual(self.buscar("integr"), ["Integrais definidas"])

    def test_caixa_alta_nao_muda_o_resultado(self):
        self.assertEqual(self.buscar("INTEGRAIS"), self.buscar("integrais"))

    def test_pasta_e_achada_pelo_nome(self):
        self.assertIn("Calculo", self.buscar("Calculo"))
