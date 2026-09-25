"""Testes dos endpoints do DocumentViewSet.

Cobre a duplicação, que tem armadilha própria: o título é único por
pasta/kind, e duplicar o MESMO item duas vezes geraria "(cópia)" duas
vezes — a segunda estourava a constraint como 500.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from organization.models import Category, Folder

from .models import Document

User = get_user_model()


class DuplicateTests(APITestCase):
    def setUp(self):
        self.usuario = User.objects.create_user(username="tester", password="senha123!")
        self.client.force_authenticate(self.usuario)
        self.categoria = Category.objects.create(name="Cat", owner=self.usuario)
        self.pasta = Folder.objects.create(name="Pasta", category=self.categoria, owner=self.usuario)
        self.nota = Document.objects.create(
            owner=self.usuario,
            folder=self.pasta,
            kind=Document.Kind.NOTE,
            title="Resumo",
            data={"sections": [{"id": "s1", "type": "text", "html": "<p>oi</p>"}]},
        )

    def duplicar(self):
        return self.client.post(f"/api/documents/{self.nota.id}/duplicate/")

    def test_primeira_duplicacao_copia(self):
        resposta = self.duplicar()
        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resposta.json()["title"], "Resumo (cópia)")

    def test_duplicar_o_mesmo_item_varias_vezes_nao_estoura(self):
        """Duplicar de novo é um clique normal — não pode virar 500."""
        for esperado in ("Resumo (cópia)", "Resumo (cópia 2)", "Resumo (cópia 3)"):
            with self.subTest(esperado=esperado):
                resposta = self.duplicar()
                self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
                self.assertEqual(resposta.json()["title"], esperado)

    def test_copia_nasce_sem_estrela_e_na_mesma_pasta(self):
        self.nota.is_favorite = True
        self.nota.save(update_fields=["is_favorite"])
        resposta = self.duplicar()
        corpo = resposta.json()
        self.assertFalse(corpo["is_favorite"])
        self.assertEqual(corpo["folder"], str(self.pasta.id))
