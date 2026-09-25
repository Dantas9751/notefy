"""Usuário e preferências de interface."""

import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from .cripto import cifrar, decifrar
from django.utils import timezone


def avatar_upload_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
    return f"avatars/{instance.pk}/{uuid.uuid4().hex}.{ext}"


class UserManager(BaseUserManager):
    """Manager com nome de usuário como identificador de login."""

    use_in_migrations = True

    def _create_user(self, username, password, **extra_fields):
        if not username:
            raise ValueError("O nome de usuário é obrigatório.")
        username = self.model.normalize_username(username).strip()
        user = self.model(username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, username, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(username, password, **extra_fields)

    def create_superuser(self, username, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superusuário precisa de is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superusuário precisa de is_superuser=True.")
        return self._create_user(username, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Usuário do Notefy — login por nome de usuário e senha, e nada mais.

    Não há e-mail: o Notefy roda como aplicativo de desktop, sobre um banco
    local. Não existe servidor para onde mandar confirmação, recuperação de
    senha nem notificação, então pedir e-mail seria coletar um dado que o
    app não tem como usar — e mais um campo entre o usuário e a entrada.
    """

    #: Sem validador de "letras e números": o dono do aplicativo é quem
    #: escolhe como se chamar no próprio computador, e recusar um acento ou
    #: um espaço aqui só criaria um erro sem propósito.
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(
        "nome de usuário", max_length=150, unique=True, db_index=True
    )
    full_name = models.CharField("nome completo", max_length=150, blank=True)
    avatar = models.ImageField("avatar", upload_to=avatar_upload_path, blank=True, null=True)

    is_active = models.BooleanField("ativo", default=True)
    is_staff = models.BooleanField("equipe", default=False)
    date_joined = models.DateTimeField("entrou em", default=timezone.now)
    last_seen_at = models.DateTimeField("visto por último", null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = "usuário"
        verbose_name_plural = "usuários"
        ordering = ("username",)

    def __str__(self):
        return self.full_name or self.username

    def get_full_name(self):
        return self.full_name or self.username

    def get_short_name(self):
        return (self.full_name or self.username).split(" ")[0]


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

    # Desenho à mão livre do canvas. Ficam aqui, e não no payload do
    # documento, porque são preferência de FERRAMENTA: quem gosta de caneta
    # fina quer caneta fina no próximo quadro também, não só naquele.
    # Os limites são validados no serializer (MinValue/MaxValue), não aqui,
    # para a mensagem de erro chegar ao cliente em vez de virar 500.
    canvas_pen_size = models.PositiveSmallIntegerField(default=3)
    #: Percentual (10-80). Guardado inteiro para não depender de float no
    #: SQLite; o frontend divide por 100 na hora de desenhar.
    canvas_highlighter_opacity = models.PositiveSmallIntegerField(default=35)
    canvas_eraser_radius = models.PositiveSmallIntegerField(default=20)

    # ------------------------------------------------------------------
    # Inteligência Artificial — configurada pelo usuário nas Configurações.
    # A chave fica no banco local do usuário (o app é desktop, SQLite
    # local), nunca no frontend. O serializer a expõe só como write-only:
    # o GET devolve `ai_key_set` (booleano) em vez da chave.
    # ------------------------------------------------------------------

    class AIProvider(models.TextChoices):
        OPENAI = "openai", "OpenAI"
        ANTHROPIC = "anthropic", "Anthropic"
        OLLAMA = "ollama", "Ollama (local)"
        CUSTOM = "custom", "Personalizado (compatível com OpenAI)"

    #: Vazio = IA desativada. Sem chave o backend recusa as chamadas.
    ai_provider = models.CharField(
        "provedor de IA", max_length=16, choices=AIProvider.choices, blank=True, default=""
    )
    #: A chave CIFRADA, como vai para o disco. Quem lê e escreve usa a
    #: propriedade `ai_key` logo abaixo e nunca vê este campo — é por
    #: isso que `providers.py` e `views.py` não mudaram uma linha.
    #:
    #: `max_length` maior: o Fernet cresce o texto (base64 + cabeçalho +
    #: HMAC), e uma chave de 200 caracteres passava de 512 cifrada.
    ai_key_cifrada = models.CharField(
        "chave de IA (cifrada)", max_length=1024, blank=True, default="", db_column="ai_key"
    )
    #: Modelo opcional — vazio usa o padrão do provedor.
    ai_model = models.CharField("modelo de IA", max_length=64, blank=True, default="")
    #: Só para `custom` (e para apontar o Ollama fora do padrão): a URL
    #: base da API compatível com OpenAI, terminando ou não em `/v1`.
    ai_base_url = models.URLField("URL base da IA", max_length=300, blank=True, default="")

    @property
    def ai_key(self):
        """A chave em texto puro. Cifra e decifra ficam invisíveis daqui."""
        return decifrar(self.ai_key_cifrada)

    @ai_key.setter
    def ai_key(self, valor):
        self.ai_key_cifrada = cifrar(valor or "")

    class Meta:
        verbose_name = "preferências"
        verbose_name_plural = "preferências"

    def __str__(self):
        return f"Preferências de {self.user.username}"
