"""Cifra a chave de IA guardada no banco.

A coluna é a MESMA (`db_column="ai_key"`); o que muda é o conteúdo, que
passa a ser `fernet:...` em vez de texto puro.

`AlterField` + migração de dados, e NÃO `RemoveField` + `AddField`: os
dois últimos reconstroem a tabela no SQLite sem copiar a coluna, e toda
chave já configurada some. Foi o que a versão gerada automaticamente
fazia.

A ida cifra o que está puro; a volta decifra. Reverter esta migração
devolve as chaves legíveis em vez de deixá-las ilegíveis para o código
antigo.
"""

from django.db import migrations, models


def cifrar_existentes(apps, schema_editor):
    from users.cripto import cifrar

    Preferencias = apps.get_model("users", "userpreferences")
    for prefs in Preferencias.objects.exclude(ai_key_cifrada="").iterator():
        # `cifrar` ignora o que já tem o prefixo, então rodar de novo
        # (ou numa base parcialmente migrada) não cifra duas vezes.
        cifrada = cifrar(prefs.ai_key_cifrada)
        if cifrada != prefs.ai_key_cifrada:
            Preferencias.objects.filter(pk=prefs.pk).update(ai_key_cifrada=cifrada)


def decifrar_existentes(apps, schema_editor):
    from users.cripto import decifrar

    Preferencias = apps.get_model("users", "userpreferences")
    for prefs in Preferencias.objects.exclude(ai_key_cifrada="").iterator():
        Preferencias.objects.filter(pk=prefs.pk).update(
            ai_key_cifrada=decifrar(prefs.ai_key_cifrada)
        )


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0005_userpreferences_ai_base_url_and_more"),
    ]

    operations = [
        migrations.RenameField(
            model_name="userpreferences",
            old_name="ai_key",
            new_name="ai_key_cifrada",
        ),
        migrations.AlterField(
            model_name="userpreferences",
            name="ai_key_cifrada",
            field=models.CharField(
                blank=True,
                db_column="ai_key",
                default="",
                max_length=1024,
                verbose_name="chave de IA (cifrada)",
            ),
        ),
        migrations.RunPython(cifrar_existentes, decifrar_existentes),
    ]
