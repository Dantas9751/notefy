"""Servidor embutido do Notefy Desktop.

No navegador, o Django roda num terminal e o Vite faz proxy. No aplicativo
empacotado não há terminal nem Vite: este módulo é o que o Tauri executa
como processo filho (sidecar). Ele prepara a pasta de dados do usuário,
aplica as migrations e serve a API — tudo sem `manage.py`, que depende da
árvore de arquivos do projeto e não sobrevive ao empacotamento.

O servidor é o `waitress`: o `runserver` do Django é de desenvolvimento,
recarrega arquivos e imprime avisos que não fazem sentido dentro de um
aplicativo de desktop.
"""

import os
import sys
from pathlib import Path

#: Porta fixa. O frontend é compilado apontando para ela, então mudar aqui
#: exige recompilar o frontend — por isso o valor mora em um lugar só.
PORT = 8756
HOST = "127.0.0.1"


def data_dir() -> Path:
    """Onde ficam o banco e os arquivos enviados.

    Em `%APPDATA%\\Notefy`, e não junto do executável: a pasta de
    instalação costuma ser somente leitura, e os dados do usuário
    precisam sobreviver a uma reinstalação.
    """
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    path = Path(base) / "Notefy"
    path.mkdir(parents=True, exist_ok=True)
    return path


def bundle_dir() -> Path:
    """Raiz dos arquivos embutidos — difere entre empacotado e código solto."""
    # `_MEIPASS` só existe dentro de um executável do PyInstaller.
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))


def main() -> None:
    folder = data_dir()
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "setup.settings")
    os.environ["NOTEFY_DATA_DIR"] = str(folder)
    os.environ["NOTEFY_DESKTOP"] = "True"
    os.environ.setdefault("DEBUG", "False")
    # A janela do Tauri carrega o app de `tauri.localhost`; o host da API é
    # sempre o loopback.
    os.environ.setdefault("ALLOWED_HOSTS", "127.0.0.1,localhost")

    # Uma chave por instalação, guardada junto dos dados. Fixá-la no código
    # faria todas as cópias do app compartilharem o segredo que assina os
    # tokens de sessão.
    key_file = folder / "secret.key"
    if not key_file.exists():
        from django.core.management.utils import get_random_secret_key

        key_file.write_text(get_random_secret_key(), encoding="utf-8")
    os.environ["SECRET_KEY"] = key_file.read_text(encoding="utf-8").strip()

    import django

    django.setup()

    from django.core.management import call_command

    # Primeira execução (ou versão nova do app): cria/atualiza o banco.
    call_command("migrate", interactive=False, verbosity=0)

    # Faxina da lixeira. No desktop não existe cron, então o arranque é a
    # única oportunidade recorrente — e uma vez por abertura do app é
    # frequência de sobra para um prazo de 30 dias. Falhar aqui não pode
    # impedir o app de abrir: no pior caso a lixeira fica maior.
    try:
        call_command("cleanup_trash", verbosity=0)
    except Exception as exc:  # noqa: BLE001
        print(f"Notefy: faxina da lixeira falhou ({exc})", flush=True)

    from django.core.wsgi import get_wsgi_application
    from waitress import serve

    print(f"Notefy: servindo em http://{HOST}:{PORT}", flush=True)
    serve(get_wsgi_application(), host=HOST, port=PORT, threads=8, _quiet=True)


if __name__ == "__main__":
    main()
