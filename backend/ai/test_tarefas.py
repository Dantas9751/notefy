"""O catálogo de tarefas e o que o frontend pede dele.

Os dois bugs que motivaram este arquivo:

1. `nota.texto` era disparada pelo `acoes.js` em três padrões de fala e
   NÃO existia no catálogo. O serializer valida contra `sorted(TAREFAS)`,
   então cada uma dessas frases voltava 400 e caía no chat comum: o
   usuário lia a resposta e ela não era gravada em nada.

2. A PERSONA mandava "prefira títulos curtos a blocos de texto corridos".
   Ela prefixa TODA tarefa, então pedir um texto devolvia o esqueleto de
   tópicos em vez do texto.
"""

from django.test import SimpleTestCase

from .tarefas import PERSONA, TAREFAS

#: Toda tarefa que o `frontend/src/components/ai/acoes.js` sabe disparar.
#: Uma que não exista aqui é um 400 na cara do usuário.
TAREFAS_DO_FRONTEND = (
    "chat",
    "nota.texto",
    "nota.continuar",
    "nota.resumir",
    "nota.corrigir",
    "nota.traduzir",
    "canvas.gerar",
    "diagrama.gerar",
    "planilha.preencher",
)


class CatalogoTests(SimpleTestCase):
    def test_toda_tarefa_do_frontend_existe_no_catalogo(self):
        faltando = [t for t in TAREFAS_DO_FRONTEND if t not in TAREFAS]
        self.assertEqual(faltando, [], f"tarefas disparadas e inexistentes: {faltando}")

    def test_toda_tarefa_declara_sistema_e_formato(self):
        for nome, tarefa in TAREFAS.items():
            with self.subTest(tarefa=nome):
                self.assertTrue(tarefa.get("sistema"), f"{nome} sem instrução")
                self.assertIn(tarefa.get("formato"), ("texto", "documento"))


class PersonaTests(SimpleTestCase):
    def test_persona_nao_manda_preferir_titulo_a_texto(self):
        """A regra que causava o bug, em qualquer redação parecida.

        Não basta ter tirado a frase: o que não pode voltar é a
        INSTRUÇÃO de escolher título no lugar de parágrafo.
        """
        self.assertNotIn("curtos a blocos de texto corridos", PERSONA)
        self.assertNotIn("prefira tópicos", PERSONA.lower())

    def test_persona_exige_texto_embaixo_do_titulo(self):
        self.assertIn("título é índice", PERSONA.lower())


class NotaTextoTests(SimpleTestCase):
    def test_proibe_entregar_so_o_esqueleto(self):
        instrucao = TAREFAS["nota.texto"]["sistema"].lower()
        self.assertIn("nunca entregue uma lista de títulos", instrucao)
        self.assertIn("parágrafos", instrucao)

    def test_e_texto_e_nao_documento(self):
        # Texto vai em streaming; documento é JSON validado. Trocar isso
        # faria a resposta ser recusada pelo validador de schema.
        self.assertEqual(TAREFAS["nota.texto"]["formato"], "texto")
