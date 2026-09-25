"""Testes da recorrência de tarefas.

Duas camadas, de propósito: o cálculo da próxima data é testado sozinho,
sem banco (`SimpleTestCase`), porque é aritmética de calendário e é onde
os erros moram — fim de mês, virada de ano, semana que termina. A criação
da tarefa seguinte é testada com banco, porque o que importa ali é o que
foi copiado e o que NÃO foi.
"""

from datetime import date, datetime, timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from organization.models import Category, Folder

from . import recorrencia
from .models import ChecklistItem, Task

User = get_user_model()


class ProximaOcorrenciaTests(SimpleTestCase):
    def test_diaria(self):
        self.assertEqual(
            recorrencia.proxima(date(2026, 9, 20), "FREQ=DAILY"),
            date(2026, 9, 21),
        )

    def test_intervalo_conta_dias(self):
        self.assertEqual(
            recorrencia.proxima(date(2026, 9, 20), "FREQ=DAILY;INTERVAL=3"),
            date(2026, 9, 23),
        )

    def test_semanal_cai_no_mesmo_dia_da_semana(self):
        origem = date(2026, 9, 21)  # segunda
        seguinte = recorrencia.proxima(origem, "FREQ=WEEKLY")
        self.assertEqual(seguinte, date(2026, 9, 28))
        self.assertEqual(seguinte.weekday(), origem.weekday())

    def test_dias_uteis_pula_de_sexta_para_segunda(self):
        # Sexta, 25/09/2026 -> segunda, 28/09. O fim de semana é
        # justamente o caso que um `+1 dia` erraria.
        sexta = date(2026, 9, 25)
        self.assertEqual(sexta.weekday(), 4)
        self.assertEqual(recorrencia.proxima(sexta, "uteis"), date(2026, 9, 28))

    def test_byday_anda_dentro_da_mesma_semana(self):
        # Segunda -> quarta, sem esperar a semana virar.
        self.assertEqual(
            recorrencia.proxima(date(2026, 9, 21), "FREQ=WEEKLY;BYDAY=MO,WE"),
            date(2026, 9, 23),
        )

    def test_byday_com_intervalo_salta_as_semanas_certas(self):
        # Quarta, BYDAY=MO,WE a cada 2 semanas: acabaram os dias desta
        # semana, então vai para a segunda de DUAS semanas à frente.
        self.assertEqual(
            recorrencia.proxima(date(2026, 9, 23), "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE"),
            date(2026, 10, 5),
        )

    def test_mensal_gruda_no_fim_do_mes_curto(self):
        # 31 de janeiro + 1 mês é 28 de fevereiro, não 3 de março: quem
        # marcou o último dia do mês quer o último dia do mês.
        self.assertEqual(
            recorrencia.proxima(date(2026, 1, 31), "FREQ=MONTHLY"),
            date(2026, 2, 28),
        )

    def test_mensal_vira_o_ano(self):
        self.assertEqual(
            recorrencia.proxima(date(2026, 12, 10), "FREQ=MONTHLY"),
            date(2027, 1, 10),
        )

    def test_anual_em_29_de_fevereiro_nao_estoura(self):
        self.assertEqual(
            recorrencia.proxima(date(2024, 2, 29), "FREQ=YEARLY"),
            date(2025, 2, 28),
        )

    def test_a_hora_do_dia_e_preservada(self):
        seguinte = recorrencia.proxima(datetime(2026, 9, 21, 19, 30), "FREQ=WEEKLY")
        self.assertEqual((seguinte.hour, seguinte.minute), (19, 30))

    def test_until_encerra_a_serie(self):
        self.assertIsNone(
            recorrencia.proxima(date(2026, 9, 28), "FREQ=WEEKLY;UNTIL=20261001")
        )

    def test_until_ainda_no_futuro_deixa_passar(self):
        self.assertEqual(
            recorrencia.proxima(date(2026, 9, 21), "FREQ=WEEKLY;UNTIL=20261231"),
            date(2026, 9, 28),
        )

    def test_regra_vazia_nao_gera_nada(self):
        self.assertIsNone(recorrencia.proxima(date(2026, 9, 20), ""))


class ValidacaoDaRegraTests(SimpleTestCase):
    def test_atalho_vira_rrule(self):
        self.assertEqual(recorrencia.validar("quinzenal"), "FREQ=WEEKLY;INTERVAL=2")

    def test_frequencia_desconhecida_e_recusada(self):
        with self.assertRaises(ValidationError):
            recorrencia.validar("FREQ=HOURLY")

    def test_parte_que_nao_executamos_e_recusada(self):
        """Aceitar `COUNT` e ignorá-lo repetiria para sempre.

        É exatamente o modo de falhar que este módulo existe para acabar:
        um campo aceito que não faz o que promete.
        """
        with self.assertRaises(ValidationError):
            recorrencia.validar("FREQ=DAILY;COUNT=10")

    def test_byday_fora_do_semanal_e_recusado(self):
        with self.assertRaises(ValidationError):
            recorrencia.validar("FREQ=MONTHLY;BYDAY=MO")

    def test_intervalo_absurdo_e_recusado(self):
        with self.assertRaises(ValidationError):
            recorrencia.validar("FREQ=DAILY;INTERVAL=0")

    def test_descricao_legivel(self):
        self.assertEqual(recorrencia.descrever("uteis"), "Dias úteis")
        self.assertEqual(recorrencia.descrever("FREQ=WEEKLY"), "Toda semana")
        self.assertEqual(recorrencia.descrever("FREQ=DAILY;INTERVAL=3"), "A cada 3 dias")
        self.assertEqual(recorrencia.descrever(""), "")


class GerarProximaTests(TestCase):
    def setUp(self):
        self.usuario = User.objects.create_user(username="tester", password="senha123!")
        self.categoria = Category.objects.create(name="Estudo", owner=self.usuario)
        self.pasta = Folder.objects.create(
            name="Cálculo", category=self.categoria, owner=self.usuario
        )

    def criar(self, **extras):
        base = {
            "owner": self.usuario,
            "title": "Revisar integrais",
            "starts_at": timezone.now(),
            "recurrence_rule": "FREQ=WEEKLY",
        }
        return Task.objects.create(**{**base, **extras})

    def test_concluir_cria_a_proxima(self):
        tarefa = self.criar()
        tarefa.status = Task.Status.DONE
        tarefa.save()

        nova = Task.objects.exclude(pk=tarefa.pk).get()
        self.assertEqual(nova.title, tarefa.title)
        self.assertEqual(nova.status, Task.Status.TODO)
        self.assertIsNone(nova.completed_at)
        self.assertEqual(nova.starts_at, tarefa.starts_at + timedelta(weeks=1))

    def test_a_proxima_tambem_se_repete(self):
        """Senão a recorrência duraria exatamente uma rodada."""
        tarefa = self.criar()
        tarefa.status = Task.Status.DONE
        tarefa.save()
        nova = Task.objects.exclude(pk=tarefa.pk).get()
        self.assertEqual(nova.recurrence_rule, "FREQ=WEEKLY")

    def test_salvar_de_novo_nao_duplica(self):
        """Concluída já concluída não gera outra.

        A tarefa é salva várias vezes depois de pronta — ao mudar de cor,
        ao ser arrastada, ao receber uma etiqueta. Cada salvamento criando
        uma cópia encheria o quadro sozinho.
        """
        tarefa = self.criar()
        tarefa.status = Task.Status.DONE
        tarefa.save()
        tarefa.priority = Task.Priority.HIGH
        tarefa.save()
        tarefa.save()
        self.assertEqual(Task.objects.count(), 2)

    def test_tarefa_sem_recorrencia_nao_gera_nada(self):
        tarefa = self.criar(recurrence_rule="")
        tarefa.status = Task.Status.DONE
        tarefa.save()
        self.assertEqual(Task.objects.count(), 1)

    def test_sem_data_nao_gera_nada(self):
        """Sem `starts_at` a regra não tem de onde partir."""
        tarefa = self.criar(starts_at=None)
        tarefa.status = Task.Status.DONE
        tarefa.save()
        self.assertEqual(Task.objects.count(), 1)

    def test_serie_encerrada_por_until_para(self):
        tarefa = self.criar(
            starts_at=timezone.now(),
            recurrence_rule="FREQ=WEEKLY;UNTIL=20200101",
        )
        tarefa.status = Task.Status.DONE
        tarefa.save()
        self.assertEqual(Task.objects.count(), 1)

    def test_fim_e_lembrete_andam_junto(self):
        inicio = timezone.now()
        tarefa = self.criar(
            starts_at=inicio,
            ends_at=inicio + timedelta(hours=2),
            reminder_at=inicio - timedelta(minutes=30),
        )
        tarefa.status = Task.Status.DONE
        tarefa.save()

        nova = Task.objects.exclude(pk=tarefa.pk).get()
        self.assertEqual(nova.ends_at - nova.starts_at, timedelta(hours=2))
        self.assertEqual(nova.starts_at - nova.reminder_at, timedelta(minutes=30))

    def test_etiquetas_pasta_e_quadro_sao_herdados(self):
        tarefa = self.criar(folder=self.pasta)
        tarefa.categories.add(self.categoria)
        tarefa.status = Task.Status.DONE
        tarefa.save()

        nova = Task.objects.exclude(pk=tarefa.pk).get()
        self.assertEqual(nova.folder_id, self.pasta.id)
        self.assertEqual(nova.board_id, tarefa.board_id)
        self.assertEqual(list(nova.categories.all()), [self.categoria])

    def test_checklist_volta_desmarcado(self):
        tarefa = self.criar()
        ChecklistItem.objects.create(task=tarefa, text="Ler a teoria", is_done=True)
        ChecklistItem.objects.create(task=tarefa, text="Fazer os exercícios", is_done=True)
        tarefa.status = Task.Status.DONE
        tarefa.save()

        nova = Task.objects.exclude(pk=tarefa.pk).get()
        itens = list(nova.checklist.all())
        self.assertEqual([i.text for i in itens], ["Ler a teoria", "Fazer os exercícios"])
        self.assertEqual([i.is_done for i in itens], [False, False])

    def test_reabrir_e_concluir_de_novo_gera_outra(self):
        """Marcar sem querer, desmarcar e marcar de novo é um uso normal."""
        tarefa = self.criar()
        tarefa.status = Task.Status.DONE
        tarefa.save()
        tarefa.status = Task.Status.TODO
        tarefa.save()
        tarefa.status = Task.Status.DONE
        tarefa.save()
        self.assertEqual(Task.objects.count(), 3)


class RecorrenciaPelaApiTests(APITestCase):
    """A API é quem escreve `recurrence_rule` — é onde a regra tem que barrar.

    `Task.save()` não chama `full_clean()` (nenhum modelo deste projeto
    chama, fora `Document`), então o `clean()` do modelo não roda num
    POST. Testar só o modelo daria uma falsa sensação de cobertura.
    """

    def setUp(self):
        self.usuario = User.objects.create_user(username="tester", password="senha123!")
        self.client.force_authenticate(self.usuario)
        self.client.default_format = "json"

    def test_regra_invalida_volta_400(self):
        resposta = self.client.post(
            "/api/tasks/", {"title": "Estudar", "recurrence_rule": "FREQ=SEMPRE"}
        )
        self.assertEqual(resposta.status_code, 400)
        self.assertIn("recurrence_rule", resposta.json())

    def test_atalho_e_gravado_como_rrule(self):
        resposta = self.client.post(
            "/api/tasks/", {"title": "Estudar", "recurrence_rule": "uteis"}
        )
        self.assertEqual(resposta.status_code, 201)
        self.assertEqual(
            resposta.json()["recurrence_rule"], "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
        )

    def test_concluir_pelo_toggle_gera_a_proxima(self):
        """O caminho real: o usuário clica na caixinha, não edita o modelo."""
        criada = self.client.post(
            "/api/tasks/",
            {
                "title": "Revisar",
                "starts_at": timezone.now().isoformat(),
                "recurrence_rule": "FREQ=WEEKLY",
            },
        ).json()

        self.client.post(f"/api/tasks/{criada['id']}/toggle/")
        self.assertEqual(Task.objects.filter(owner=self.usuario).count(), 2)
        self.assertEqual(
            Task.objects.filter(owner=self.usuario, status=Task.Status.TODO).count(), 1
        )

    def test_concluir_arrastando_no_kanban_tambem_gera(self):
        criada = self.client.post(
            "/api/tasks/",
            {
                "title": "Revisar",
                "starts_at": timezone.now().isoformat(),
                "recurrence_rule": "FREQ=DAILY",
            },
        ).json()

        self.client.post(f"/api/tasks/{criada['id']}/move/", {"status": "done"})
        self.assertEqual(Task.objects.filter(owner=self.usuario).count(), 2)

    def test_sem_recorrencia_o_toggle_nao_inventa_tarefa(self):
        criada = self.client.post(
            "/api/tasks/", {"title": "Coisa única", "starts_at": timezone.now().isoformat()}
        ).json()
        self.client.post(f"/api/tasks/{criada['id']}/toggle/")
        self.assertEqual(Task.objects.filter(owner=self.usuario).count(), 1)


class ContadorDoQuadroTests(APITestCase):
    def setUp(self):
        self.usuario = User.objects.create_user(username="tester", password="senha123!")
        self.client.force_authenticate(self.usuario)
        self.client.default_format = "json"

    def contagem(self):
        return self.client.get("/api/boards/").json()["results"][0]["task_count"]

    def test_excluir_tarefa_faz_o_contador_descer(self):
        """A exclusão aqui é suave: a linha continua no banco.

        Contando tudo que aponta para o quadro, o número só subia — criar
        e apagar a mesma tarefa deixava o contador um acima para sempre.
        """
        self.assertEqual(self.contagem(), 0)

        criada = self.client.post("/api/tasks/", {"title": "Temporária"}).json()
        self.assertEqual(self.contagem(), 1)

        self.client.delete(f"/api/tasks/{criada['id']}/")
        self.assertEqual(self.contagem(), 0)


class FormaCanonicaTests(SimpleTestCase):
    """A regra gravada descreve o que vai acontecer.

    `validar` remonta a partir das partes aprovadas em vez de devolver o
    texto como veio. Sem isso, duas linhas diferentes no banco podiam
    significar a mesma coisa, e `BYDAY=` vazio ficava gravado prometendo
    dias que a expansão ignora.
    """

    def test_interval_1_some(self):
        self.assertEqual(recorrencia.validar("FREQ=DAILY;INTERVAL=1"), "FREQ=DAILY")

    def test_byday_vazio_some(self):
        self.assertEqual(recorrencia.validar("FREQ=WEEKLY;BYDAY="), "FREQ=WEEKLY")

    def test_byday_sai_na_ordem_da_semana(self):
        self.assertEqual(
            recorrencia.validar("FREQ=WEEKLY;BYDAY=WE,MO"), "FREQ=WEEKLY;BYDAY=MO,WE"
        )

    def test_byday_repetido_conta_uma_vez(self):
        self.assertEqual(
            recorrencia.validar("FREQ=WEEKLY;BYDAY=MO,MO"), "FREQ=WEEKLY;BYDAY=MO"
        )

    def test_regras_equivalentes_viram_a_mesma_linha(self):
        self.assertEqual(
            recorrencia.validar("FREQ=WEEKLY;INTERVAL=1;BYDAY=FR,MO"),
            recorrencia.validar("freq=weekly;byday=mo,fr"),
        )

    def test_until_e_preservado(self):
        self.assertEqual(
            recorrencia.validar("FREQ=WEEKLY;UNTIL=20261231"),
            "FREQ=WEEKLY;UNTIL=20261231",
        )

    def test_o_que_sai_continua_valendo_se_entrar_de_novo(self):
        """Idempotência: validar o resultado devolve o mesmo resultado."""
        for regra in ("uteis", "quinzenal", "FREQ=MONTHLY;INTERVAL=3", "FREQ=WEEKLY;BYDAY=SU"):
            uma = recorrencia.validar(regra)
            self.assertEqual(recorrencia.validar(uma), uma, regra)


class TodaPortaDeEscritaValidaTests(TestCase):
    """`Task.save()` é a única passagem que toda escrita atravessa.

    A validação morava no `clean()`, que `Task.save()` não chama — então
    pela API quem protegia era só o serializer, e o importador de backup,
    um comando de management e o shell entravam sem passar por ninguém.
    Uma regra impossível virava campo morto: gravada, serializada, e a
    repetição nunca acontecia.
    """

    def setUp(self):
        self.usuario = User.objects.create_user(username="tester", password="senha123!")

    def test_objects_create_recusa_regra_impossivel(self):
        with self.assertRaises(ValidationError):
            Task.objects.create(
                owner=self.usuario, title="x", recurrence_rule="FREQ=SEMPRE"
            )

    def test_objects_create_normaliza_o_atalho(self):
        tarefa = Task.objects.create(
            owner=self.usuario, title="x", recurrence_rule="uteis"
        )
        self.assertEqual(tarefa.recurrence_rule, "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")

    def test_importar_backup_com_regra_impossivel_e_barrado(self):
        """O importador usa `objects.create`; agora ele também é coberto."""
        with self.assertRaises(ValidationError):
            Task.objects.create(
                owner=self.usuario, title="Do backup", recurrence_rule="FREQ=DAILY;COUNT=10"
            )
