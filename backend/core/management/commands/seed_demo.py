"""Popula o banco com um usuário e conteúdo de demonstração.

    python manage.py seed_demo

Só para desenvolvimento: dá o que olhar em todas as telas (categorias,
pastas, os quatro tipos de item, quadro com tarefas, lixeira) sem depender
de alguém ter usado o app por uma semana. Rodar de novo não duplica nada —
apaga o usuário demo e refaz.
"""

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from content.models import Document
from organization.models import Category, Folder
from planner.models import Board, ChecklistItem, Task
from users.models import User

USERNAME = "demo"
SENHA = "demo-senha-123"


class Command(BaseCommand):
    help = "Cria o usuário 'demo' com conteúdo de exemplo (só em DEBUG)."

    def handle(self, *args, **options):
        # Semear em produção sobrescreveria dados reais e criaria um login
        # com senha publicada no código-fonte.
        if not settings.DEBUG:
            raise CommandError("seed_demo só roda com DEBUG=True.")

        User.objects.filter(username=USERNAME).delete()
        user = User.objects.create_user(
            username=USERNAME, password=SENHA, full_name="Ana Demo"
        )

        agora = timezone.now()

        cats = {}
        for nome, cor, desc in [
            ("Faculdade", "#4F46E5", "Disciplinas do semestre"),
            ("Pesquisa", "#10B981", "Leituras e fichamentos"),
            ("Pessoal", "#F59E0B", ""),
        ]:
            cats[nome] = Category.objects.create(
                owner=user, name=nome, color=cor, description=desc
            )

        estruturas = {
            "Faculdade": ["Cálculo III", "Algoritmos", "Banco de Dados"],
            "Pesquisa": ["Artigos lidos", "Ideias"],
            "Pessoal": ["Receitas"],
        }
        pastas = {}
        for cat_nome, nomes in estruturas.items():
            for nome in nomes:
                pastas[nome] = Folder.objects.create(
                    owner=user, category=cats[cat_nome], name=nome
                )

        # Uma subpasta: a árvore da sidebar precisa de um nível a mais para
        # mostrar que expande.
        pastas["Listas"] = Folder.objects.create(
            owner=user,
            category=cats["Faculdade"],
            name="Listas de exercícios",
            parent=pastas["Cálculo III"],
        )

        notas = [
            (
                "Cálculo III",
                "Integrais de linha",
                "<p>Parametrizar a curva antes de tudo. Campo conservativo mata o "
                "trabalho da integral: basta avaliar o potencial nas pontas.</p>",
            ),
            (
                "Cálculo III",
                "Teorema de Green",
                "<p>Vale só para curva fechada, simples e positivamente orientada.</p>",
            ),
            (
                "Algoritmos",
                "Dijkstra vs Bellman-Ford",
                "<p>Bellman-Ford aceita peso negativo e custa O(VE). Dijkstra é "
                "O(E log V) mas quebra com aresta negativa.</p>",
            ),
            (
                "Algoritmos",
                "Complexidade amortizada",
                "<p>Array dinâmico dobra de tamanho: cada push sai O(1) amortizado.</p>",
            ),
            (
                "Banco de Dados",
                "Formas normais",
                "<p>1FN tira repetição, 2FN tira dependência parcial, 3FN tira "
                "transitiva.</p>",
            ),
            (
                "Artigos lidos",
                "Attention Is All You Need",
                "<p>Self-attention substitui recorrência. O custo é quadrático no "
                "comprimento da sequência.</p>",
            ),
            (
                "Ideias",
                "Projeto de fim de curso",
                "<p>Comparar índices B-tree e LSM sob carga de escrita pesada.</p>",
            ),
            (
                "Receitas",
                "Pão de fermentação natural",
                "<p>Autólise de 40 minutos, 70% de hidratação.</p>",
            ),
        ]
        for pasta, titulo, html in notas:
            Document.objects.create(
                owner=user,
                folder=pastas[pasta],
                kind=Document.Kind.NOTE,
                title=titulo,
                content=html,
                content_format="html",
                data={"sections": [{"id": "s1", "type": "text", "html": html}]},
            )

        Document.objects.create(
            owner=user,
            folder=pastas["Listas"],
            kind=Document.Kind.SPREADSHEET,
            title="Notas do semestre",
            data={
                "columns": [
                    {"id": "c1", "name": "Disciplina", "type": "text", "width": 220},
                    {"id": "c2", "name": "P1", "type": "number", "width": 120,
                     "aggregate": "avg"},
                    {"id": "c3", "name": "P2", "type": "number", "width": 120,
                     "aggregate": "avg"},
                ],
                "sort": None,
                "filters": [],
                "frozen_columns": 1,
                "rows": [
                    {"id": "r1", "cells": {"c1": "Cálculo III", "c2": 7.5, "c3": 8.0}},
                    {"id": "r2", "cells": {"c1": "Algoritmos", "c2": 9.0, "c3": 8.5}},
                    {"id": "r3", "cells": {"c1": "Banco de Dados", "c2": 6.0, "c3": 7.0}},
                ],
            },
        )

        Document.objects.create(
            owner=user,
            folder=pastas["Algoritmos"],
            kind=Document.Kind.DIAGRAM,
            title="Fluxo de uma query",
            data={
                "nodes": [
                    {"id": "n1", "type": "terminator", "x": 60, "y": 40,
                     "width": 150, "height": 60, "text": "SQL de entrada"},
                    {"id": "n2", "type": "process", "x": 60, "y": 160,
                     "width": 150, "height": 60, "text": "Parser"},
                    {"id": "n3", "type": "process", "x": 60, "y": 280,
                     "width": 150, "height": 60, "text": "Planner"},
                    {"id": "n4", "type": "decision", "x": 60, "y": 400,
                     "width": 150, "height": 80, "text": "Tem índice?"},
                    {"id": "n5", "type": "process", "x": 280, "y": 410,
                     "width": 150, "height": 60, "text": "Index scan"},
                    {"id": "n6", "type": "process", "x": 60, "y": 540,
                     "width": 150, "height": 60, "text": "Seq scan"},
                    {"id": "n7", "type": "database", "x": 280, "y": 540,
                     "width": 150, "height": 60, "text": "Resultado"},
                ],
                "edges": [
                    {"id": "e1", "type": "flow", "from": "n1", "to": "n2"},
                    {"id": "e2", "type": "flow", "from": "n2", "to": "n3"},
                    {"id": "e3", "type": "flow", "from": "n3", "to": "n4"},
                    {"id": "e4", "type": "flow", "from": "n4", "to": "n5"},
                    {"id": "e5", "type": "flow", "from": "n4", "to": "n6"},
                    {"id": "e6", "type": "flow", "from": "n5", "to": "n7"},
                    {"id": "e7", "type": "flow", "from": "n6", "to": "n7"},
                ],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
                "theme": "system",
            },
        )

        Document.objects.create(
            owner=user,
            folder=pastas["Ideias"],
            kind=Document.Kind.CANVAS,
            title="Mapa mental do TCC",
            data={
                "nodes": [
                    {"id": "c1", "type": "heading", "x": 240, "y": 40,
                     "width": 260, "height": 50, "text": "TCC: B-tree vs LSM"},
                    {"id": "c2", "type": "sticky", "x": 60, "y": 160,
                     "width": 180, "height": 140,
                     "text": "Carga de escrita pesada é onde LSM ganha"},
                    {"id": "c3", "type": "sticky", "x": 300, "y": 160,
                     "width": 180, "height": 140,
                     "text": "Medir amplificação de escrita, não só throughput"},
                    {"id": "c4", "type": "card", "x": 540, "y": 160,
                     "width": 200, "height": 120,
                     "text": "Bancada: RocksDB x SQLite"},
                ],
                "edges": [
                    {"id": "ce1", "type": "arrow", "from": "c1", "to": "c2"},
                    {"id": "ce2", "type": "arrow", "from": "c1", "to": "c3"},
                    {"id": "ce3", "type": "curve", "from": "c3", "to": "c4"},
                ],
                "strokes": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
                "background": "grid",
                "theme": "system",
            },
        )

        favorita = Document.objects.filter(
            owner=user, title="Dijkstra vs Bellman-Ford"
        ).first()
        if favorita:
            favorita.is_favorite = True
            favorita.save(update_fields=["is_favorite"])

        quadro = Board.objects.create(
            owner=user, name="Semestre", color="#4F46E5", is_default=True
        )
        tarefas = [
            ("Entregar lista 4 de Cálculo", Task.Status.TODO, 3, 1),
            ("Revisar Dijkstra para a prova", Task.Status.TODO, 2, 3),
            ("Fichar o artigo de Transformers", Task.Status.IN_PROGRESS, 2, 2),
            ("Montar slides do seminário", Task.Status.IN_PROGRESS, 1, 5),
            ("Normalizar o schema do projeto", Task.Status.DONE, 1, -2),
            ("Ler capítulo 3 de Cormen", Task.Status.DONE, 0, -4),
        ]
        for pos, (titulo, status, prio, dias) in enumerate(tarefas):
            tarefa = Task.objects.create(
                owner=user,
                board=quadro,
                title=titulo,
                status=status,
                priority=prio,
                position=pos,
                starts_at=agora + timedelta(days=dias),
                ends_at=agora + timedelta(days=dias, hours=2),
                completed_at=agora if status == Task.Status.DONE else None,
            )
            if titulo.startswith("Montar slides"):
                for i, item in enumerate(["Escolher o tema", "Rascunhar", "Revisar"]):
                    ChecklistItem.objects.create(
                        task=tarefa, text=item, is_done=i == 0, position=i
                    )

        # Dois itens na lixeira: a tela de lixeira vazia não mostra nada do
        # que ela faz.
        lixo = Document.objects.create(
            owner=user,
            folder=pastas["Receitas"],
            kind=Document.Kind.NOTE,
            title="Rascunho abandonado",
            content="<p>...</p>",
        )
        lixo.delete()
        Folder.objects.create(
            owner=user, category=cats["Pessoal"], name="Pasta velha"
        ).delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"Pronto. Login: {USERNAME} / {SENHA} — "
                f"{Category.objects.filter(owner=user).count()} categorias, "
                f"{Folder.objects.filter(owner=user).alive().count()} pastas, "
                f"{Document.objects.filter(owner=user).alive().count()} itens, "
                f"{Task.objects.filter(owner=user).count()} tarefas."
            )
        )
