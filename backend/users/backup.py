"""Exportar e importar o conteúdo de uma conta como um arquivo .zip.

Por que não `dumpdata`/`loaddata`: o backup do Notefy é de UMA conta, não do
banco inteiro. O arquivo precisa poder ir para outro computador, onde já
existe outro usuário com outros ids, e mesmo assim entrar sem colidir. E
precisa levar os arquivos enviados junto — um JSON com o caminho de um PDF
que ficou para trás não restaura nada.

Formato: um zip com `notefy.json` na raiz e os arquivos sob `media/`, no
mesmo caminho relativo que têm em MEDIA_ROOT.
"""

import json
import zipfile
from datetime import datetime, timezone as dt_timezone
from io import BytesIO

from django.core.files.base import ContentFile
from django.db import transaction

from content.models import Document
from organization.models import Category, Folder
from planner.models import ChecklistItem, Task

from .models import UserPreferences

#: Sobe quando o formato mudar de um jeito que a leitura antiga não entenda.
FORMATO = 1

MANIFESTO = "notefy.json"
PASTA_MEDIA = "media/"


def _iso(valor):
    return valor.isoformat() if valor else None


# ---------------------------------------------------------------------------
# Exportação
# ---------------------------------------------------------------------------
def exportar(user):
    """Devolve os bytes de um .zip com tudo que pertence a `user`."""
    categorias = list(Category.objects.filter(owner=user).order_by("position", "name"))
    # `path` ordena a árvore de cima para baixo: o pai sempre aparece antes
    # do filho, e a importação pode criar na ordem em que lê.
    pastas = list(Folder.objects.filter(owner=user).order_by("path"))
    documentos = list(Document.objects.filter(owner=user).order_by("created_at"))
    tarefas = list(Task.objects.filter(owner=user).order_by("created_at"))
    checklist = list(
        ChecklistItem.objects.filter(task__owner=user).order_by("task_id", "position")
    )

    prefs = UserPreferences.objects.filter(user=user).first()

    dados = {
        "notefy_backup": FORMATO,
        "exportado_em": datetime.now(dt_timezone.utc).isoformat(),
        "username": user.username,
        "preferencias": (
            {
                "theme": prefs.theme,
                "default_view": prefs.default_view,
                "sidebar_collapsed": prefs.sidebar_collapsed,
                "accent_color": prefs.accent_color,
                "editor_font_size": prefs.editor_font_size,
                "week_starts_on_monday": prefs.week_starts_on_monday,
            }
            if prefs
            else None
        ),
        "categorias": [
            {
                "id": str(c.id),
                "name": c.name,
                "color": c.color,
                "icon": c.icon,
                "description": c.description,
                "position": c.position,
            }
            for c in categorias
        ],
        "pastas": [
            {
                "id": str(f.id),
                "name": f.name,
                "parent": str(f.parent_id) if f.parent_id else None,
                "category": str(f.category_id) if f.category_id else None,
                "description": f.description,
                "color": f.color,
                "icon": f.icon,
                "position": f.position,
            }
            for f in pastas
        ],
        "documentos": [
            {
                "id": str(d.id),
                "kind": d.kind,
                "title": d.title,
                "folder": str(d.folder_id) if d.folder_id else None,
                "attached_to": str(d.attached_to_id) if d.attached_to_id else None,
                "status": d.status,
                "color": d.color,
                "icon": d.icon,
                "is_favorite": d.is_favorite,
                "is_archived": d.is_archived,
                "position": d.position,
                "content": d.content,
                "content_format": d.content_format,
                "data": d.data,
                "arquivo": d.file.name or None,
                "original_name": d.original_name,
                "mime_type": d.mime_type,
                "file_kind": d.file_kind,
            }
            for d in documentos
        ],
        "tarefas": [
            {
                "id": str(t.id),
                "title": t.title,
                "description": t.description,
                "status": t.status,
                "priority": t.priority,
                "starts_at": _iso(t.starts_at),
                "ends_at": _iso(t.ends_at),
                "all_day": t.all_day,
                "reminder_at": _iso(t.reminder_at),
                "completed_at": _iso(t.completed_at),
                "recurrence_rule": t.recurrence_rule,
                "document": str(t.document_id) if t.document_id else None,
                "folder": str(t.folder_id) if t.folder_id else None,
                "categories": [str(c.id) for c in t.categories.all()],
                "color": t.color,
                "position": t.position,
            }
            for t in tarefas
        ],
        "checklist": [
            {
                "task": str(i.task_id),
                "text": i.text,
                "is_done": i.is_done,
                "position": i.position,
            }
            for i in checklist
        ],
    }

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(MANIFESTO, json.dumps(dados, ensure_ascii=False, indent=1))
        for documento in documentos:
            if not documento.file:
                continue
            try:
                with documento.file.open("rb") as fh:
                    zf.writestr(PASTA_MEDIA + documento.file.name, fh.read())
            except (FileNotFoundError, OSError):
                # Arquivo sumiu do disco: o backup continua, e o item volta
                # como registro sem anexo. Perder o resto por causa de um
                # arquivo faltando seria pior do que restaurar quase tudo.
                continue

    return buffer.getvalue()


def nome_do_arquivo(user):
    carimbo = datetime.now().strftime("%Y%m%d-%H%M")
    return f"notefy-{user.username}-{carimbo}.zip"


# ---------------------------------------------------------------------------
# Importação
# ---------------------------------------------------------------------------
class BackupInvalido(Exception):
    """O zip não é um backup do Notefy (ou é de uma versão que não sei ler)."""


def _nome_livre(nome, ocupados):
    """Acha um nome que ainda não existe entre `ocupados`.

    Importar ADICIONANDO num perfil que já tem o mesmo conteúdo é o caso
    normal — a pessoa restaura o backup sem lembrar que aquilo já estava
    lá. Categoria e pasta têm nome único (sem diferenciar maiúsculas), e
    sem isto a importação inteira morria com IntegrityError. Renomear para
    "Estudos (2)" preserva as duas versões e deixa a escolha para depois.
    """
    if nome.lower() not in ocupados:
        ocupados.add(nome.lower())
        return nome
    n = 2
    while f"{nome} ({n})".lower() in ocupados:
        n += 1
    novo = f"{nome} ({n})"
    ocupados.add(novo.lower())
    return novo


def _ler_manifesto(zf):
    try:
        bruto = zf.read(MANIFESTO)
    except KeyError as exc:
        raise BackupInvalido(
            "O arquivo não parece um backup do Notefy: falta o notefy.json."
        ) from exc
    try:
        dados = json.loads(bruto.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BackupInvalido("O notefy.json do backup está corrompido.") from exc

    formato = dados.get("notefy_backup")
    if formato is None:
        raise BackupInvalido("O arquivo não parece um backup do Notefy.")
    if formato > FORMATO:
        raise BackupInvalido(
            "Este backup veio de uma versão mais nova do Notefy. Atualize o app."
        )
    return dados


@transaction.atomic
def importar(user, arquivo, substituir=False):
    """Recria o conteúdo do backup na conta de `user`.

    `substituir=False` (padrão) ADICIONA: tudo entra com ids novos, e o que
    já existia continua onde estava. É o comportamento seguro — nenhuma
    importação pode apagar o que a pessoa tem hoje.

    `substituir=True` limpa o conteúdo atual antes. É o "restaurar" de
    verdade, e por isso a tela pede confirmação explícita antes de mandar.
    """
    with zipfile.ZipFile(arquivo) as zf:
        dados = _ler_manifesto(zf)

        if substituir:
            # Só o conteúdo: a conta, a senha e as sessões continuam.
            # Documentos e pastas caem por cascata a partir da categoria,
            # mas apagamos explicitamente para alcançar também o que ficou
            # sem categoria por algum caminho antigo.
            #
            # `hard_delete` e não `delete`: substituir precisa SUBSTITUIR.
            # Com a exclusão suave, o conteúdo antigo continuaria no banco
            # (na lixeira) e uma restauração deixaria a conta com duas
            # cópias de tudo — uma visível e outra esperando na lixeira.
            Document.objects.filter(owner=user).hard_delete()
            Folder.objects.filter(owner=user).hard_delete()
            Category.objects.filter(owner=user).hard_delete()
            Task.objects.filter(owner=user).hard_delete()

        # De id do backup para o objeto recém-criado.
        categorias = {}
        pastas = {}
        documentos = {}

        # Nomes já ocupados na conta, para não esbarrar na unicidade.
        # Depois de `substituir` o conjunto nasce vazio, e nada é renomeado.
        nomes_categoria = {
            n.lower() for n in Category.objects.filter(owner=user).values_list("name", flat=True)
        }
        #: Um conjunto de nomes por pai (None = raiz da categoria).
        nomes_pasta = {}
        for pai, nome in Folder.objects.filter(owner=user).values_list("parent_id", "name"):
            nomes_pasta.setdefault(pai, set()).add(nome.lower())

        for item in dados.get("categorias", []):
            categorias[item["id"]] = Category.objects.create(
                owner=user,
                name=_nome_livre(item["name"], nomes_categoria),
                color=item.get("color", ""),
                icon=item.get("icon", ""),
                description=item.get("description", ""),
                position=item.get("position", 0),
            )

        for item in dados.get("pastas", []):
            categoria = categorias.get(item.get("category"))
            if categoria is None:
                # Pasta sem categoria conhecida não tem onde morar; ignorar
                # aqui é melhor do que criar uma órfã que a navegação nunca
                # mostraria.
                continue
            pai = pastas.get(item.get("parent"))
            # Pasta raiz é única dentro da categoria; subpasta, dentro do
            # pai. A chave do conjunto acompanha essa diferença: uma
            # categoria nova nunca colide, uma subpasta só colide com as
            # irmãs.
            escopo = pai.id if pai else f"raiz:{categoria.id}"
            pastas[item["id"]] = Folder.objects.create(
                owner=user,
                category=categoria,
                parent=pai,
                name=_nome_livre(item["name"], nomes_pasta.setdefault(escopo, set())),
                description=item.get("description", ""),
                color=item.get("color", ""),
                icon=item.get("icon", ""),
                position=item.get("position", 0),
            )

        # Duas passadas: `attached_to` aponta para outro documento, que
        # pode aparecer depois no arquivo.
        pendentes_anexo = []
        for item in dados.get("documentos", []):
            pasta = pastas.get(item.get("folder"))
            if pasta is None:
                continue
            documento = Document(
                owner=user,
                folder=pasta,
                kind=item.get("kind", Document.Kind.NOTE),
                title=item.get("title", "Sem título"),
                status=item.get("status", Document.Status.DRAFT),
                color=item.get("color", ""),
                icon=item.get("icon", ""),
                is_favorite=item.get("is_favorite", False),
                is_archived=item.get("is_archived", False),
                position=item.get("position", 0),
                content=item.get("content", ""),
                content_format=item.get("content_format", "html"),
                data=item.get("data") or {},
                original_name=item.get("original_name", ""),
            )

            caminho = item.get("arquivo")
            if caminho:
                try:
                    conteudo = zf.read(PASTA_MEDIA + caminho)
                except KeyError:
                    conteudo = None
                if conteudo is not None:
                    nome = item.get("original_name") or caminho.rsplit("/", 1)[-1]
                    # Atribuir o ContentFile, e NÃO chamar `file.save(...)`:
                    # o save() do model só recalcula tamanho, mime, tipo e
                    # checksum enquanto o arquivo está "não commitado", e
                    # `file.save()` commita antes da hora — o item voltava
                    # com os bytes certos no disco e 0 byte no banco.
                    documento.file = ContentFile(conteudo, name=nome)

            documento.save()
            documentos[item["id"]] = documento
            if item.get("attached_to"):
                pendentes_anexo.append((documento, item["attached_to"]))

        for documento, alvo in pendentes_anexo:
            pai = documentos.get(alvo)
            if pai is not None:
                documento.attached_to = pai
                documento.save(update_fields=["attached_to"])

        tarefas_criadas = 0
        tarefas_por_id = {}
        for item in dados.get("tarefas", []):
            tarefa = Task.objects.create(
                owner=user,
                title=item.get("title", "Sem título"),
                description=item.get("description", ""),
                status=item.get("status", Task.Status.TODO),
                priority=item.get("priority", 1),
                starts_at=item.get("starts_at"),
                ends_at=item.get("ends_at"),
                all_day=item.get("all_day", False),
                reminder_at=item.get("reminder_at"),
                completed_at=item.get("completed_at"),
                recurrence_rule=item.get("recurrence_rule", ""),
                document=documentos.get(item.get("document")),
                folder=pastas.get(item.get("folder")),
                color=item.get("color", ""),
                position=item.get("position", 0),
            )
            vinculadas = [
                categorias[cid] for cid in item.get("categories", []) if cid in categorias
            ]
            if vinculadas:
                tarefa.categories.set(vinculadas)
            tarefas_por_id[item["id"]] = tarefa
            tarefas_criadas += 1

        for item in dados.get("checklist", []):
            tarefa = tarefas_por_id.get(item.get("task"))
            if tarefa is None:
                continue
            ChecklistItem.objects.create(
                task=tarefa,
                text=item.get("text", ""),
                is_done=item.get("is_done", False),
                position=item.get("position", 0),
            )

        prefs = dados.get("preferencias")
        if prefs:
            UserPreferences.objects.update_or_create(user=user, defaults=prefs)

    return {
        "categorias": len(categorias),
        "pastas": len(pastas),
        "documentos": len(documentos),
        "tarefas": tarefas_criadas,
    }
