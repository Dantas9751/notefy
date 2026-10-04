"""Executor de testes que não escreve no `media/` de verdade.

Sem isto a suíte gravava os uploads dos testes na MESMA pasta dos arquivos
do usuário (`MEDIA_ROOT` aponta para `backend/media`). O banco dos testes é
descartável, mas o disco não: cada execução deixava para trás centenas de
arquivos de teste, cada um numa pasta com o id de um usuário que já não
existia. Quando alguém abria a pasta, não havia como distinguir o que era do
app do que era resto de teste.

A pasta temporária nasce no começo da suíte e some no fim, mesmo quando um
teste falha.
"""

import shutil
import tempfile
from pathlib import Path

from django.test import override_settings
from django.test.runner import DiscoverRunner


class ExecutorComMidiaTemporaria(DiscoverRunner):
    def setup_test_environment(self, **kwargs):
        super().setup_test_environment(**kwargs)
        self._pasta_de_midia = tempfile.mkdtemp(prefix="notefy-teste-media-")
        # `Path`, e não `str`: o código e os testes fazem `MEDIA_ROOT / nome`.
        self._sobrescrita = override_settings(MEDIA_ROOT=Path(self._pasta_de_midia))
        self._sobrescrita.enable()

    def teardown_test_environment(self, **kwargs):
        self._sobrescrita.disable()
        shutil.rmtree(self._pasta_de_midia, ignore_errors=True)
        super().teardown_test_environment(**kwargs)
