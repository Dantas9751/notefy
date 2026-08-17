# -*- mode: python ; coding: utf-8 -*-
"""Empacota o backend do Notefy num executável único.

O Django descobre quase tudo em tempo de execução — apps pelo nome em
INSTALLED_APPS, migrations varrendo pastas, backends de banco por string.
Nada disso aparece num `import`, então o PyInstaller não encontraria
sozinho: daí a lista explícita abaixo.

Um arquivo só (`onefile`) porque o Tauri espera um binário para o sidecar.
O preço é um segundo a mais no primeiro arranque, enquanto o executável se
descompacta — o processo Rust espera a porta responder antes de abrir a
janela.
"""

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

#: Apps do projeto: as migrations não são importadas por ninguém, o Django
#: as carrega pelo nome do módulo.
LOCAL_APPS = ("core", "users", "organization", "content", "planner", "search", "setup")

hiddenimports = []
for package in (
    "django",
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "environ",
    "waitress",
    "xhtml2pdf",
    "reportlab",
    "pygments",
    "PIL",
    *LOCAL_APPS,
):
    hiddenimports += collect_submodules(package)

datas = []
for package in ("django", "rest_framework", "drf_spectacular", "xhtml2pdf", "reportlab"):
    datas += collect_data_files(package)

a = Analysis(
    ["desktop_server.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    # Nada de Tk nem de ferramentas de teste dentro do app do usuário.
    excludes=["tkinter", "pytest", "PyInstaller"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="notefy-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    # Sem janela de console: o servidor é um detalhe interno do aplicativo.
    console=False,
)
