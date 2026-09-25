"""Entradas que o usuário escolhe e o servidor obedece.

Dois lugares deste app pegam um valor de fora e agem por conta própria:
o endereço do provedor de IA (o backend chama, levando a chave junto) e
o .zip do backup (a única entrada que não passa por serializer nenhum).
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APITestCase

from users.backup import CAMPOS_DE_PREFERENCIA
from users.models import UserPreferences

User = get_user_model()


class EnderecoDaIaTests(APITestCase):
    """`ai_base_url` decide para onde o backend manda a chave de IA."""

    def setUp(self):
        self.usuario = User.objects.create_user(username="tester", password="senha123!")
        self.client.force_authenticate(self.usuario)
        self.client.default_format = "json"

    def definir(self, url):
        return self.client.patch("/api/me/preferences/", {"ai_base_url": url})

    def test_metadados_da_nuvem_e_recusado(self):
        """169.254.169.254 serve as credenciais da máquina na AWS/GCP/Azure."""
        for url in (
            "http://169.254.169.254/latest/meta-data",
            "http://169.254.170.2/v2/credentials",
        ):
            self.assertEqual(self.definir(url).status_code, 400, url)

    def test_esquema_estranho_e_recusado(self):
        # `URLField` do Django aceita ftp/ftps por padrão.
        for url in ("ftp://exemplo.com/v1", "file:///etc/passwd"):
            self.assertEqual(self.definir(url).status_code, 400, url)

    def test_ia_local_continua_funcionando(self):
        """O recurso existe para apontar para um modelo na própria máquina.

        Bloquear loopback fecharia a porta que ele veio abrir — o padrão
        do Ollama é `http://localhost:11434/v1`.
        """
        for url in ("http://localhost:11434/v1", "http://127.0.0.1:1234/v1"):
            self.assertEqual(self.definir(url).status_code, 200, url)

    def test_provedor_normal_continua_funcionando(self):
        self.assertEqual(self.definir("https://api.openai.com/v1").status_code, 200)


class PreferenciasDoBackupTests(TestCase):
    """O .zip do backup vem de qualquer lugar."""

    def test_a_lista_nao_carrega_nada_de_ia(self):
        """Chave, provedor e endereço não viajam em backup — e um arquivo
        de fora não pode escolher para onde o backend chama."""
        for proibido in ("ai_key", "ai_key_cifrada", "ai_provider", "ai_base_url", "ai_model"):
            self.assertNotIn(proibido, CAMPOS_DE_PREFERENCIA)

    def test_a_lista_so_tem_campos_que_existem(self):
        campos = {f.name for f in UserPreferences._meta.get_fields()}
        for campo in CAMPOS_DE_PREFERENCIA:
            self.assertIn(campo, campos, campo)

    def test_user_id_nao_esta_na_lista(self):
        """Era o pior caso: `defaults` ia cru para o `update_or_create`,
        que faz `setattr` de toda chave — inclusive da chave primária."""
        self.assertNotIn("user_id", CAMPOS_DE_PREFERENCIA)
        self.assertNotIn("user", CAMPOS_DE_PREFERENCIA)
