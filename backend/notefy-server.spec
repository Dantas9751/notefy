# -*- mode: python ; coding: utf-8 -*-
"""Empacota o backend do Notefy numa pasta com o executável.

O Django descobre quase tudo em tempo de execução — apps pelo nome em
INSTALLED_APPS, migrations varrendo pastas, backends de banco por string.
Nada disso aparece num `import`, então o PyInstaller não encontraria
sozinho: daí a lista explícita abaixo.

Pasta (`onedir`), e não arquivo único: o `onefile` se descompactava a
cada abertura — 4.700 arquivos no Temp, uns 14 s com o antivírus olhando
cada um — e, encerrado à força ao fechar o app, deixava a pasta lá (3 GB
acumulados em poucos dias). A pasta vai no instalador como recurso, e o
processo Rust a inicia pelo caminho.
"""

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

#: Apps do projeto: as migrations não são importadas por ninguém, o Django
#: as carrega pelo nome do módulo.
LOCAL_APPS = ("core", "users", "organization", "content", "planner", "search", "ai", "setup")

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
    [],
    exclude_binaries=True,
    name="notefy-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    # Sem janela de console: o servidor é um detalhe interno do aplicativo.
    console=False,
)

coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="notefy-server")
