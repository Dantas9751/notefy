"""Configuração do backend headless do Notefy.

Tudo que muda entre ambientes vem de variáveis de ambiente (arquivo .env
na raiz de backend/). Ver .env.example.
"""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    CORS_ALLOWED_ORIGINS=(list, ["http://localhost:5173", "http://127.0.0.1:5173"]),
    ACCESS_TOKEN_LIFETIME_MINUTES=(int, 30),
    REFRESH_TOKEN_LIFETIME_DAYS=(int, 14),
    MAX_UPLOAD_SIZE_MB=(int, 50),
)

environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY", default="django-insecure-dev-only-change-me")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")


# ---------------------------------------------------------------------------
# Apps
# ---------------------------------------------------------------------------

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
]

LOCAL_APPS = [
    "core",
    "users",
    "organization",
    "content",
    "planner",
    "search",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # CorsMiddleware precisa vir antes de CommonMiddleware para que os
    # headers sobrevivam a redirects.
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "setup.urls"
WSGI_APPLICATION = "setup.wsgi.application"
ASGI_APPLICATION = "setup.asgi.application"

# Templates existem apenas para o /admin — o frontend é servido pelo Vite.
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# ---------------------------------------------------------------------------
# Banco de dados — SQLite, um arquivo só
#
# O Notefy é um app de uma pessoa só, rodando na máquina dela: um arquivo
# que o usuário pode copiar, levar num pendrive e restaurar vale mais aqui
# do que um servidor de banco. É também o que permite empacotar tudo num
# .exe — não há serviço para instalar junto.
#
# `NOTEFY_DATA_DIR` existe por causa desse empacotamento: instalado em
# Arquivos de Programas, o diretório do código é somente leitura, e tanto o
# banco quanto os uploads precisam ir para a pasta do usuário. Em
# desenvolvimento o padrão continua sendo a própria pasta do backend.
# ---------------------------------------------------------------------------

DATA_DIR = Path(env("NOTEFY_DATA_DIR", default=str(BASE_DIR)))
DATA_DIR.mkdir(parents=True, exist_ok=True)

#: Ligado quando o backend roda embutido no aplicativo de desktop, e não
#: atrás de um servidor web. Muda o pouco que um deploy normal delegaria a
#: outra peça: entregar os uploads e aceitar a origem da janela do Tauri.
DESKTOP_MODE = env.bool("NOTEFY_DESKTOP", default=False)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": DATA_DIR / "db.sqlite3",
        "OPTIONS": {
            # WAL deixa leitura e escrita conviverem: sem ele, salvar uma
            # nota tranca o banco inteiro e as requisições paralelas do
            # frontend batem em "database is locked".
            "init_command": (
                "PRAGMA journal_mode=WAL;"
                "PRAGMA synchronous=NORMAL;"
                "PRAGMA foreign_keys=ON;"
                "PRAGMA busy_timeout=5000;"
            ),
            # Pega o lock de escrita já na abertura da transação, em vez de
            # descobrir o conflito no meio dela e ter que desfazer.
            "transaction_mode": "IMMEDIATE",
        },
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "users.User"


# ---------------------------------------------------------------------------
# Autenticação
# ---------------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# ---------------------------------------------------------------------------
# DRF + JWT
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    # Fechado por padrão: um endpoint novo nasce protegido, e abrir acesso
    # exige um gesto explícito no viewset.
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "core.pagination.DefaultPagination",
    "PAGE_SIZE": 30,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": ("rest_framework.throttling.ScopedRateThrottle",),
    "DEFAULT_THROTTLE_RATES": {"auth": "20/min", "search": "120/min"},
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env("ACCESS_TOKEN_LIFETIME_MINUTES")),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env("REFRESH_TOKEN_LIFETIME_DAYS")),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Notefy API",
    "DESCRIPTION": "API do Notefy — notas, pastas, estudos e planner.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    # Document.Status e Task.Status compartilham o nome do campo mas têm
    # conjuntos diferentes; sem os nomes explícitos o gerador inventaria
    # rótulos como "Status6f3Enum".
    "ENUM_NAME_OVERRIDES": {
        "DocumentStatusEnum": "content.models.Document.Status",
        "TaskStatusEnum": "planner.models.Task.Status",
        "DocumentKindEnum": "content.models.Document.Kind",
        "FileKindEnum": "content.models.Document.FileKind",
    },
}


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True

if DESKTOP_MODE:
    # A janela do Tauri carrega o app de um protocolo próprio; para o
    # Django, essas são origens diferentes da do servidor, e sem elas
    # o navegador embutido bloqueia toda chamada à API.
    CORS_ALLOWED_ORIGINS = [
        *CORS_ALLOWED_ORIGINS,
        "http://tauri.localhost",
        "https://tauri.localhost",
    ]


# ---------------------------------------------------------------------------
# Internacionalização
# ---------------------------------------------------------------------------

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True


# ---------------------------------------------------------------------------
# Arquivos estáticos e mídia
# ---------------------------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
# Junto do banco, pelo mesmo motivo: os arquivos enviados são dados do
# usuário e precisam de um lugar gravável, não da pasta de instalação.
MEDIA_ROOT = DATA_DIR / "media"

MAX_UPLOAD_SIZE = env("MAX_UPLOAD_SIZE_MB") * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024


# ---------------------------------------------------------------------------
# Segurança (aplicada apenas fora de DEBUG)
# ---------------------------------------------------------------------------

#: No desktop, DEBUG é falso mas não há HTTPS: o servidor é o loopback da
#: própria máquina. Forçar SSL aqui redirecionaria toda chamada para uma
#: porta https que não existe, e o app não sairia da tela de login.
if not DEBUG and not DESKTOP_MODE:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_CONTENT_TYPE_NOSNIFF = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}