"""O prazo de uma tarefa, e a janela que a central de notificações consulta.

Prazo é o fim da tarefa, ou o início quando ela não tem fim. Essa regra
vivia escrita à mão dentro do filtro de atrasadas; as notificações
precisaram da mesma pergunta ("vence entre quando e quando?") e a regra
foi para `TaskQuerySet.filtrar_prazo`. Estes testes seguram as duas
portas juntas: se uma mudar de ideia sobre o que é prazo, a outra quebra.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Task

User = get_user_model()


class JanelaDePrazoTests(APITestCase):
    def setUp(self):
        self.usuario = User.objects.create_user(username="tester", password="senha123!")
        self.client.force_authenticate(self.usuario)
        self.agora = timezone.now()

    def criar(self, titulo, **campos):
        return Task.objects.create(owner=self.usuario, title=titulo, **campos)

    def titulos(self, **params):
        resposta = self.client.get("/api/tasks/", params)
        self.assertEqual(resposta.status_code, 200)
        return sorted(t["title"] for t in resposta.json()["results"])

    def janela(self, antes, depois):
        return {
            "due_after": (self.agora - antes).isoformat(),
            "due_before": (self.agora + depois).isoformat(),
        }

    def test_o_fim_manda_quando_existe(self):
        # Começa daqui a 3 dias mas termina daqui a 2 horas? Impossível
        # pelo CHECK. O caso real é o contrário: começou ontem, termina
        # daqui a 2 horas. É o fim que vence, não o começo.
        self.criar(
            "Trabalho em grupo",
            starts_at=self.agora - timedelta(days=1),
            ends_at=self.agora + timedelta(hours=2),
        )
        self.assertEqual(
            self.titulos(**self.janela(timedelta(0), timedelta(hours=3))),
            ["Trabalho em grupo"],
        )

    def test_sem_fim_o_prazo_e_o_inicio(self):
        self.criar("Prova", starts_at=self.agora + timedelta(hours=1))
        self.assertEqual(
            self.titulos(**self.janela(timedelta(0), timedelta(hours=2))),
            ["Prova"],
        )

    def test_comeco_dentro_da_janela_nao_basta_se_o_fim_esta_fora(self):
        # Pela coluna `starts_at` ela entraria na janela. Pelo prazo, não:
        # só termina daqui a uma semana, e avisar "vence em 1 hora" seria
        # mentira.
        self.criar(
            "Projeto longo",
            starts_at=self.agora + timedelta(hours=1),
            ends_at=self.agora + timedelta(days=7),
        )
        self.assertEqual(self.titulos(**self.janela(timedelta(0), timedelta(hours=2))), [])

    def test_sem_data_nenhuma_nunca_entra(self):
        self.criar("Algum dia")
        self.assertEqual(self.titulos(**self.janela(timedelta(days=30), timedelta(days=30))), [])

    def test_os_dois_limites_juntos(self):
        self.criar("Ontem", starts_at=self.agora - timedelta(days=1, hours=2))
        self.criar("Daqui a pouco", starts_at=self.agora + timedelta(minutes=30))
        self.criar("Semana que vem", starts_at=self.agora + timedelta(days=7))

        self.assertEqual(
            self.titulos(**self.janela(timedelta(days=1), timedelta(days=2))),
            ["Daqui a pouco"],
        )

    def test_janela_mais_open_esconde_as_concluidas(self):
        self.criar("Feita", starts_at=self.agora + timedelta(hours=1), status=Task.Status.DONE)
        self.criar("Pendente", starts_at=self.agora + timedelta(hours=1))

        self.assertEqual(
            self.titulos(open="true", **self.janela(timedelta(0), timedelta(hours=2))),
            ["Pendente"],
        )

    def test_atrasada_usa_a_mesma_regra(self):
        # O filtro antigo tinha a regra escrita à mão. Agora é o mesmo
        # `filtrar_prazo`: começou ontem mas só termina amanhã não está
        # atrasada, por mais que o início já tenha passado.
        self.criar(
            "Em andamento",
            starts_at=self.agora - timedelta(days=1),
            ends_at=self.agora + timedelta(days=1),
        )
        self.criar("Esquecida", starts_at=self.agora - timedelta(hours=3))

        self.assertEqual(self.titulos(overdue="true"), ["Esquecida"])
