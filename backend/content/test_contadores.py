"""Os números que a listagem anuncia.

A exclusão neste projeto é suave: a linha continua no banco com
`deleted_at` preenchido. Todo `Count()` sobre um relacionamento tem, por
isso, que filtrar o que está vivo — senão o contador só sobe, e a
interface promete um anexo que já não abre.
"""

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from core.testutils import make_category, make_document, make_folder, make_user

from .models import Document


class ContadorDeAnexosTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.folder = make_folder(self.user, category=make_category(self.user))
        self.doc = make_document(self.user, folder=self.folder, title="Aula 3")
        self.client.force_authenticate(self.user)

    def anexar(self, title):
        # Só arquivo pode ser anexo (`_validate_attachment`).
        return Document.objects.create(
            owner=self.user,
            folder=self.folder,
            attached_to=self.doc,
            kind=Document.Kind.FILE,
            title=title,
            file=SimpleUploadedFile(title, b"conteudo"),
        )

    def contagem(self):
        listagem = self.client.get("/api/documents/").json()["results"]
        return next(d["attachment_count"] for d in listagem if d["id"] == str(self.doc.id))

    def test_anexo_excluido_sai_da_conta(self):
        primeiro = self.anexar("nota-de-aula.png")
        self.anexar("slides.pdf")
        self.assertEqual(self.contagem(), 2)

        self.client.delete(f"/api/documents/{primeiro.id}/")
        self.assertEqual(self.contagem(), 1)
