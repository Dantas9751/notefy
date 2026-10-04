"""Os testes não podem escrever na pasta de arquivos do app.

Ver `core/testrunner.py`: antes dele, cada execução da suíte largava
centenas de arquivos em `backend/media`, ao lado dos uploads de verdade.
"""

import tempfile
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase


class MidiaDosTestesTests(SimpleTestCase):
    def test_a_pasta_de_midia_dos_testes_nao_e_a_do_app(self):
        self.assertNotEqual(Path(settings.MEDIA_ROOT), Path(settings.DATA_DIR) / "media")

    def test_ela_mora_na_pasta_temporaria_do_sistema(self):
        self.assertTrue(
            Path(settings.MEDIA_ROOT).resolve().is_relative_to(Path(tempfile.gettempdir()).resolve()),
            settings.MEDIA_ROOT,
        )

    def test_e_um_path_como_o_resto_do_codigo_espera(self):
        self.assertIsInstance(settings.MEDIA_ROOT, Path)
