from django.apps import AppConfig


class ContentConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "content"
    verbose_name = "Conteúdo"

    def ready(self):
        # O texto de busca é derivado dentro do próprio `Document.save()`;
        # o que sobra para os signals é apagar o arquivo do disco quando o
        # documento some.
        from django.db.models.signals import post_migrate

        from . import signals

        post_migrate.connect(signals.garantir_indice_de_busca, sender=self)
