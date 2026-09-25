"""Cifragem da chave de IA.

O que não pode acontecer de novo: uma migração que apaga a chave já
gravada. O teste da migração vive junto porque é ela que tem histórico
de erro.
"""

from django.test import TestCase

from .cripto import PREFIXO, cifrar, decifrar
from .models import UserPreferences
from core.testutils import make_user


class CifragemTests(TestCase):
    def test_ida_e_volta(self):
        chave = "sk-proj-abc123XYZ"
        self.assertEqual(decifrar(cifrar(chave)), chave)

    def test_cifrado_nao_contem_o_texto_puro(self):
        """É o ponto todo: quem abrir o db.sqlite3 não lê a chave."""
        chave = "sk-segredo-do-usuario"
        self.assertNotIn(chave, cifrar(chave))

    def test_vazio_continua_vazio(self):
        self.assertEqual(cifrar(""), "")
        self.assertEqual(decifrar(""), "")

    def test_cifrar_duas_vezes_nao_estraga(self):
        """`save()` roda em todo PATCH das preferências."""
        uma = cifrar("sk-abc")
        self.assertEqual(cifrar(uma), uma)
        self.assertEqual(decifrar(cifrar(uma)), "sk-abc")

    def test_chave_antiga_sem_prefixo_continua_valendo(self):
        """Gravada antes desta mudança: recusá-la desligaria a IA de
        quem já tinha configurado."""
        self.assertEqual(decifrar("sk-texto-puro-antigo"), "sk-texto-puro-antigo")


class PropriedadeTests(TestCase):
    def setUp(self):
        self.prefs = make_user().preferences

    def test_o_que_vai_ao_disco_esta_cifrado(self):
        self.prefs.ai_key = "sk-minha-chave"
        self.prefs.save()
        self.prefs.refresh_from_db()

        self.assertTrue(self.prefs.ai_key_cifrada.startswith(PREFIXO))
        self.assertNotIn("sk-minha-chave", self.prefs.ai_key_cifrada)
        # E quem lê não percebe nada: `providers.py` não mudou uma linha.
        self.assertEqual(self.prefs.ai_key, "sk-minha-chave")

    def test_apagar_a_chave(self):
        self.prefs.ai_key = "sk-abc"
        self.prefs.save()
        self.prefs.ai_key = ""
        self.prefs.save()
        self.prefs.refresh_from_db()
        self.assertEqual(self.prefs.ai_key, "")

    def test_ai_key_set_continua_funcionando(self):
        """O serializer usa `bool(obj.ai_key)` para dizer se há chave."""
        self.assertFalse(bool(self.prefs.ai_key))
        self.prefs.ai_key = "sk-abc"
        self.prefs.save()
        self.assertTrue(bool(self.prefs.ai_key))
