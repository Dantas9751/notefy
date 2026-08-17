from django.apps import AppConfig


class ContentConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "content"
    verbose_name = "Conteúdo"

    def ready(self):
        # O texto de busca é derivado dentro do próprio `Document.save()`;
        # o que sobra para os signals é apagar o arquivo do disco quando o
        # documento some.
        from . import signals  # noqa: F401
