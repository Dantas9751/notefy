"""Troca o identificador de login: e-mail sai, nome de usuário entra.

A ordem das operações não pode ser condensada, e não é só pelo caminho de
ida — é pelo de volta.

Na ida: o campo nasce aceitando nulo e sem unicidade, porque as linhas que
já existem precisam de um valor antes que a restrição possa valer; só depois
de preenchido ele vira único e obrigatório, e aí o e-mail pode sair.

Na volta, o Django desfaz as operações de baixo para cima. Se o
`RemoveField` do e-mail fosse desfeito de uma vez, ele recriaria a coluna
como NOT NULL numa tabela cheia de linhas sem e-mail nenhum, e a reversão
morreria com "NOT NULL constraint failed". Por isso o campo é afrouxado
(passo 4) ANTES de sair (passo 6), com o RunPython que reconstrói os
endereços entre os dois (passo 5): assim, ao voltar, a coluna reaparece
aceitando nulo, é preenchida, e só então volta a ser obrigatória.

O nome de usuário de quem já tinha conta vem da parte antes do "@" do
e-mail — é o que a pessoa reconhece como sendo dela. Se dois e-mails
diferentes colidirem nessa parte (ana@a.com e ana@b.com), o segundo ganha
um sufixo numérico em vez de quebrar a migração.
"""

from django.db import migrations, models


def preencher_username(apps, schema_editor):
    User = apps.get_model("users", "User")
    usados = set()
    for user in User.objects.all().order_by("date_joined"):
        base = (user.email or "").split("@")[0].strip() or "usuario"
        base = base[:140]
        nome = base
        n = 2
        while nome.lower() in usados:
            nome = f"{base}{n}"
            n += 1
        usados.add(nome.lower())
        user.username = nome
        user.save(update_fields=["username"])


def restaurar_email(apps, schema_editor):
    """Reconstrói um e-mail a partir do nome de usuário.

    Não recupera o endereço original: ele deixou de existir no banco quando
    a coluna saiu. O que este reverso garante é que a estrutura volte a um
    estado válido — quem precisa dos endereços de verdade restaura um
    backup anterior à migração.
    """
    User = apps.get_model("users", "User")
    for user in User.objects.all():
        user.email = f"{user.username}@local.invalid"
        user.save(update_fields=["email"])


class Migration(migrations.Migration):

    dependencies = [("users", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="user",
            name="username",
            field=models.CharField(
                max_length=150, null=True, verbose_name="nome de usuário"
            ),
        ),
        migrations.RunPython(preencher_username, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="username",
            field=models.CharField(
                db_index=True,
                max_length=150,
                unique=True,
                verbose_name="nome de usuário",
            ),
        ),
        # Afrouxa o e-mail antes de removê-lo: é isto que permite recriá-lo
        # aceitando nulo na reversão.
        migrations.AlterField(
            model_name="user",
            name="email",
            field=models.EmailField(
                db_index=True,
                max_length=254,
                null=True,
                unique=True,
                verbose_name="e-mail",
            ),
        ),
        # Só existe pelo reverso: na ida não faz nada, na volta é quem
        # preenche os e-mails entre a recriação da coluna e o momento em
        # que ela volta a ser obrigatória.
        migrations.RunPython(migrations.RunPython.noop, restaurar_email),
        migrations.RemoveField(model_name="user", name="email"),
        migrations.AlterModelOptions(
            name="user",
            options={
                "ordering": ("username",),
                "verbose_name": "usuário",
                "verbose_name_plural": "usuários",
            },
        ),
    ]
