"""Item na lixeira responde 410; item que não existe para a conta, 404.

O app mostrava "Este item foi movido para a lixeira" para qualquer 404 —
inclusive para o item de OUTRA conta (que sobrava no navegador depois de
trocar de conta) e para o apagado de vez. Com o 410, ele só diz "lixeira"
quando é verdade.
"""

from rest_framework.test import APITestCase

from core.testutils import make_document, make_user


class LixeiraOuInexistente(APITestCase):
    def setUp(self):
        self.dona = make_user("dona")
        self.outra = make_user("outra")
        self.doc = make_document(self.dona, title="Cálculo")

    def test_item_na_lixeira_da_propria_conta_e_410(self):
        self.doc.delete()
        self.client.force_authenticate(self.dona)
        self.assertEqual(self.client.get(f"/api/documents/{self.doc.id}/").status_code, 410)

    def test_item_de_outra_conta_e_404_mesmo_na_lixeira(self):
        # Dizer "está na lixeira" para quem não é dono já revela que o item existe.
        self.client.force_authenticate(self.outra)
        self.assertEqual(self.client.get(f"/api/documents/{self.doc.id}/").status_code, 404)
        self.doc.delete()
        self.assertEqual(self.client.get(f"/api/documents/{self.doc.id}/").status_code, 404)

    def test_item_vivo_continua_200(self):
        self.client.force_authenticate(self.dona)
        self.assertEqual(self.client.get(f"/api/documents/{self.doc.id}/").status_code, 200)
