"""Faxina da lixeira: apaga de vez o que passou do prazo.

    python manage.py cleanup_trash
    python manage.py cleanup_trash --dias 7
    python manage.py cleanup_trash --dry-run

No aplicativo de desktop não há cron; quem chama isto é o
`desktop_server.py` no arranque, o que na prática dá uma faxina por
abertura do app — frequência de sobra para um prazo de 30 dias.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.trash import TIPOS, TRASH_RETENTION_DAYS


class Command(BaseCommand):
    help = "Apaga definitivamente os itens que estão na lixeira há mais de N dias."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dias",
            type=int,
            default=TRASH_RETENTION_DAYS,
            help=f"Idade mínima, em dias, para apagar (padrão: {TRASH_RETENTION_DAYS}).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Só conta o que seria apagado, sem apagar nada.",
        )

    def handle(self, *args, **options):
        dias = options["dias"]
        simular = options["dry_run"]
        corte = timezone.now() - timedelta(days=dias)

        total = 0
        resumo = []

        # Ordem importa: os filhos primeiro. Apagar a categoria antes levaria
        # as pastas junto pela cascata do banco e o relatório sairia mentindo
        # sobre quantos itens de cada tipo foram removidos.
        for tipo in reversed(list(TIPOS)):
            modelo, _ = TIPOS[tipo]
            alvo = modelo.objects.filter(deleted_at__lt=corte)
            quantos = alvo.count()
            if not quantos:
                continue

            if not simular:
                with transaction.atomic():
                    # `hard_delete` (e não `delete`) é o ponto do comando:
                    # `delete` só remarcaria a data e nada sairia do banco.
                    # Item a item, e não em massa, para o `post_delete` de
                    # Document rodar e levar o arquivo do disco junto.
                    for obj in alvo:
                        obj.hard_delete()

            total += quantos
            resumo.append(f"{quantos} {tipo}(s)")

        prefixo = "[simulação] " if simular else ""
        if total:
            self.stdout.write(
                self.style.SUCCESS(
                    f"{prefixo}{total} item(ns) apagados definitivamente "
                    f"(na lixeira há mais de {dias} dias): {', '.join(resumo)}."
                )
            )
        else:
            self.stdout.write(f"{prefixo}Nada na lixeira com mais de {dias} dias.")
