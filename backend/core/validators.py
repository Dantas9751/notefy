"""Validadores reutilizáveis."""

from django.core.validators import RegexValidator

hex_color_validator = RegexValidator(
    regex=r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$",
    message="Informe uma cor hexadecimal válida (ex.: #4F46E5).",
)

icon_name_validator = RegexValidator(
    regex=r"^[a-z0-9-]{1,64}$",
    message="Ícone deve ser um identificador kebab-case (ex.: 'book-open').",
)
