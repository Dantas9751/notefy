"""Usuário e preferências de interface."""

import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


def avatar_upload_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
    return f"avatars/{instance.pk}/{uuid.uuid4().hex}.{ext}"


class UserManager(BaseUserManager):
    """Manager com e-mail como identificador de login."""

    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("O e-mail é obrigatório.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superusuário precisa de is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superusuário precisa de is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Usuário do Notefy — login por e-mail, sem username."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField("e-mail", unique=True, db_index=True)
    full_name = models.CharField("nome completo", max_length=150, blank=True)
    avatar = models.ImageField("avatar", upload_to=avatar_upload_path, blank=True, null=True)

    is_active = models.BooleanField("ativo", default=True)
    is_staff = models.BooleanField("equipe", default=False)
    date_joined = models.DateTimeField("entrou em", default=timezone.now)
    last_seen_at = models.DateTimeField("visto por último", null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = "usuário"
        verbose_name_plural = "usuários"
        ordering = ("email",)

    def __str__(self):
        return self.full_name or self.email

    def get_full_name(self):
        return self.full_name or self.email

    def get_short_name(self):
        return (self.full_name or self.email).split(" ")[0]


class UserPreferences(models.Model):
    """Preferências de UI persistidas para a tela de Configurações."""

    class Theme(models.TextChoices):
        LIGHT = "light", "Claro"
        DARK = "dark", "Escuro"
        SYSTEM = "system", "Sistema"

    class DefaultView(models.TextChoices):
        DASHBOARD = "dashboard", "Dashboard"
        CALENDAR = "calendar", "Calendário"
        BOARD = "board", "Kanban"

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="preferences", primary_key=True
    )
    theme = models.CharField(max_length=10, choices=Theme.choices, default=Theme.SYSTEM)
    default_view = models.CharField(
        max_length=16, choices=DefaultView.choices, default=DefaultView.DASHBOARD
    )
    sidebar_collapsed = models.BooleanField(default=False)
    accent_color = models.CharField(max_length=7, default="#4F46E5")
    editor_font_size = models.PositiveSmallIntegerField(default=16)
    week_starts_on_monday = models.BooleanField(default=True)

    class Meta:
        verbose_name = "preferências"
        verbose_name_plural = "preferências"

    def __str__(self):
        return f"Preferências de {self.user.email}"
