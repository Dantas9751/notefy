"""O schema OpenAPI (`/api/docs/`) sai sem erro nem aviso.

Uma view nova sem `extend_schema` some da documentação em silêncio (o
drf-spectacular só avisa no console). Este teste é o que transforma o
aviso em falha.
"""

import os

from django.core.management import call_command
from django.test import SimpleTestCase


class SchemaTests(SimpleTestCase):
    def test_schema_gera_sem_avisos(self):
        call_command("spectacular", "--file", os.devnull, "--fail-on-warn", "--validate")
