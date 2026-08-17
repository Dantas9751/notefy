"""Categorias (tags globais) e Pastas hierárquicas.

`Folder` é auto-relacionável em profundidade arbitrária. Para que isso não
vire um problema de performance nem de integridade, o modelo mantém um
**caminho materializado** (`path`) além do ponteiro `parent`:

    parent  -> integridade relacional e navegação para cima
    path    -> subárvore inteira em UMA query (`path__startswith`)

O `path` também é o que torna a detecção de ciclos barata: mover A para
dentro de B é ilegal se e somente se `B.path` começa com `A.path`.
"""

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models.functions import Lower

from core.models import BaseModel, SoftDeleteQuerySet
from core.validators import hex_color_validator, icon_name_validator

#: Profundidade máxima de aninhamento. Existe para proteger a UI (a sidebar
#: renderiza recursivamente) e para dar um teto ao tamanho de `path`.
MAX_FOLDER_DEPTH = 12

#: 36 chars de UUID + separador, vezes a profundidade máxima.
PATH_MAX_LENGTH = (36 + 1) * MAX_FOLDER_DEPTH


class Category(BaseModel):
    """Tag/categoria global do usuário, aplicável a pastas, notas e tarefas."""

    name = models.CharField("nome", max_length=120)
    color = models.CharField(
        "cor", max_length=7, default="#4F46E5", validators=[hex_color_validator]
    )
    icon = models.CharField(
        "ícone", max_length=64, blank=True, validators=[icon_name_validator]
    )
    description = models.TextField("descrição", blank=True)
    is_pinned = models.BooleanField("fixada", default=False)
    position = models.PositiveIntegerField("posição", default=0)

    class Meta:
        verbose_name = "categoria"
        verbose_name_plural = "categorias"
        ordering = ("-is_pinned", "position", "name")
        constraints = [
            # Case-insensitive: "Estudos" e "estudos" seriam duas tags
            # visualmente idênticas na sidebar — proibido.
            #
            # `deleted_at__isnull=True` restringe a regra ao que está VIVO.
            # Com o soft delete, excluir "Estudos" só marca a data: a linha
            # continua na tabela e, sem esta condição, seguia reservando o
            # nome. Criar outra "Estudos" estourava IntegrityError por causa
            # de uma categoria que o usuário já mandou para a lixeira.
            models.UniqueConstraint(
                "owner",
                Lower("name"),
                name="unique_category_name_per_owner",
                condition=models.Q(deleted_at__isnull=True),
            )
        ]
        indexes = [models.Index(fields=["owner", "position"])]

    def __str__(self):
        return self.name

    def delete(self, *args, **kwargs):
        """Manda a categoria e tudo dentro dela para a lixeira.

        A cascata do banco só existe no DELETE de verdade. Sem repeti-la
        aqui, as pastas e os itens continuariam "vivos" e apareceriam na
        busca e nas listagens depois de a categoria ter sumido da sidebar.
        """
        from content.models import Document

        pastas = list(Folder.objects.filter(category=self).values_list("pk", flat=True))
        if pastas:
            Document.objects.filter(folder_id__in=pastas).delete()
            Folder.objects.filter(pk__in=pastas).delete()
        super().delete(*args, **kwargs)


class FolderQuerySet(SoftDeleteQuerySet):
    def roots(self):
        return self.filter(parent__isnull=True)

    def active(self):
        return self.filter(is_archived=False)

    def descendants_of(self, folder, include_self=False):
        # Sem path gravado a pasta ainda não está na árvore; `startswith('')`
        # casaria com a tabela inteira, então devolvemos vazio.
        if not folder.path:
            return self.none()
        qs = self.filter(path__startswith=folder.path)
        if not include_self:
            qs = qs.exclude(pk=folder.pk)
        return qs


class Folder(BaseModel):
    """Pasta com aninhamento infinito (limitado a MAX_FOLDER_DEPTH)."""

    name = models.CharField("nome", max_length=180)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
        verbose_name="pasta pai",
    )
    category = models.ForeignKey(
        Category,
        # CASCADE no banco, recusa na API.
        #
        # A regra que o usuário vê — "categoria com pastas não pode ser
        # excluída" — é checada explicitamente na view. No banco a relação
        # cascateia porque PROTECT tornaria impossível apagar uma CONTA:
        # o coletor do Django não atravessa chaves protegidas, e a exclusão
        # do usuário morreria em ProtectedError antes de qualquer signal.
        on_delete=models.CASCADE,
        related_name="folders",
        verbose_name="categoria",
    )

    description = models.TextField("descrição", blank=True)
    color = models.CharField(
        "cor", max_length=7, blank=True, validators=[hex_color_validator]
    )
    icon = models.CharField(
        "ícone", max_length=64, blank=True, validators=[icon_name_validator]
    )

    is_favorite = models.BooleanField("favorita", default=False)
    is_archived = models.BooleanField("arquivada", default=False)
    position = models.PositiveIntegerField("posição", default=0)

    # Derivados — mantidos pelo save(), nunca editáveis pela API.
    path = models.CharField(max_length=PATH_MAX_LENGTH, editable=False, db_index=True)
    depth = models.PositiveSmallIntegerField(default=0, editable=False)

    objects = FolderQuerySet.as_manager()

    class Meta:
        verbose_name = "pasta"
        verbose_name_plural = "pastas"
        ordering = ("position", "name")
        constraints = [
            # `deleted_at__isnull=True` em ambas: pasta na lixeira não pode
            # continuar segurando o nome (ver a nota em Category.Meta).
            models.UniqueConstraint(
                "owner", "parent", Lower("name"),
                name="unique_folder_name_per_parent",
                condition=models.Q(parent__isnull=False, deleted_at__isnull=True),
            ),
            # Pastas raiz são únicas DENTRO da categoria: "Provas" pode
            # existir em Biologia e em Cálculo ao mesmo tempo.
            models.UniqueConstraint(
                "owner", "category", Lower("name"),
                name="unique_root_folder_name_per_category",
                condition=models.Q(parent__isnull=True, deleted_at__isnull=True),
            ),
            # Rede de segurança no nível do banco contra auto-referência
            # direta. Ciclos maiores são barrados em clean().
            models.CheckConstraint(
                condition=~models.Q(parent=models.F("id")),
                name="folder_cannot_be_its_own_parent",
            ),
        ]
        indexes = [
            models.Index(fields=["owner", "parent"]),
            models.Index(fields=["owner", "is_archived"]),
        ]

    def __str__(self):
        return self.name

    def delete(self, *args, **kwargs):
        """Leva a subárvore inteira para a lixeira junto."""
        from content.models import Document

        subarvore = list(
            Folder.objects.descendants_of(self, include_self=True).values_list("pk", flat=True)
        )
        Document.objects.filter(folder_id__in=subarvore).delete()
        # A própria pasta sai pelo super(); as descendentes, aqui.
        Folder.objects.filter(pk__in=subarvore).exclude(pk=self.pk).delete()
        super().delete(*args, **kwargs)

    # ------------------------------------------------------------------
    # Hierarquia
    # ------------------------------------------------------------------
    def build_path(self):
        """`<uuid pai>/.../<uuid próprio>/` — sempre com barra final.

        A barra final é o que impede falso positivo em `startswith`: sem
        ela, o path de um irmão cujo UUID começasse com o mesmo prefixo
        seria confundido com um descendente.
        """
        prefix = self.parent.path if self.parent_id else ""
        return f"{prefix}{self.pk}/"

    def clean(self):
        super().clean()
        self._validate_hierarchy()
        
    def _validate_hierarchy(self):
        parent = self.parent

        if parent is None:
            # Pasta raiz precisa escolher a categoria; é ela que define o
            # topo da hierarquia categoria → pasta → conteúdo.
            if self.category_id and self.category.owner_id != self.owner_id:
                raise ValidationError({"category": "A categoria pertence a outro usuário."})
            return

        if parent.pk == self.pk:
            raise ValidationError({"parent": "Uma pasta não pode ser pai de si mesma."})

        if parent.owner_id != self.owner_id:
            raise ValidationError({"parent": "A pasta pai pertence a outro usuário."})

        # Ciclo: o pai pretendido está dentro da própria subárvore.
        # Comparamos contra `self.path` — o caminho ATUAL, já gravado — e
        # não contra o caminho pretendido, que embutiria o novo pai e faria
        # a comparação sempre falhar.
        if self.path and parent.path.startswith(self.path):
            raise ValidationError(
                {"parent": "Movimento inválido: isso criaria um ciclo de pastas."}
            )

        new_depth = parent.depth + 1
        if new_depth >= MAX_FOLDER_DEPTH:
            raise ValidationError(
                {"parent": f"Profundidade máxima de {MAX_FOLDER_DEPTH} níveis atingida."}
            )

        # Mover a pasta empurra toda a subárvore para baixo; o galho mais
        # profundo não pode estourar o limite.
        if self.pk:
            deepest = (
                Folder.objects.descendants_of(self)
                .aggregate(models.Max("depth"))["depth__max"]
            )
            if deepest is not None and (deepest - self.depth) + new_depth >= MAX_FOLDER_DEPTH:
                raise ValidationError(
                    {"parent": "A subárvore desta pasta excederia a profundidade máxima."}
                )

    @transaction.atomic
    def save(self, *args, **kwargs):
        self._validate_hierarchy()

        previous_path = None
        previous_category = None
        if not self._state.adding:
            previous = (
                Folder.objects.filter(pk=self.pk)
                .values("path", "category_id")
                .first()
            )
            if previous:
                previous_path = previous["path"]
                previous_category = previous["category_id"]

        # Subpasta não escolhe categoria: herda a do pai. É o que impede
        # uma subpasta de "Biologia" morar dentro de uma pasta de "Cálculo"
        # e faz a categoria de qualquer item ser lida direto de sua pasta,
        # sem subir a árvore.
        if self.parent_id:
            self.category_id = self.parent.category_id

        self.path = self.build_path()
        self.depth = self.parent.depth + 1 if self.parent_id else 0

        # `update_fields` explícito precisa incluir os derivados, senão a
        # reparentização seria gravada sem atualizar path/depth/categoria.
        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            kwargs["update_fields"] = set(update_fields) | {
                "path", "depth", "category", "updated_at",
            }

        super().save(*args, **kwargs)

        if previous_path and previous_path != self.path:
            self._rebuild_subtree(previous_path)
        elif previous_category and previous_category != self.category_id:
            # Trocar a categoria de uma pasta raiz sem movê-la: a subárvore
            # continua no mesmo caminho, mas precisa acompanhar a categoria.
            Folder.objects.descendants_of(self).update(category_id=self.category_id)

    def _rebuild_subtree(self, previous_path):
        """Reescreve path, depth e categoria dos descendentes após a pasta
        ser movida — mover para outra categoria leva a subárvore junto."""
        descendants = Folder.objects.filter(path__startswith=previous_path).exclude(pk=self.pk)
        depth_delta = self.depth - (previous_path.count("/") - 1)
        for descendant in descendants.iterator():
            descendant.path = self.path + descendant.path[len(previous_path):]
            descendant.depth += depth_delta
            descendant.category_id = self.category_id
            super(Folder, descendant).save(update_fields=["path", "depth", "category"])

    # ------------------------------------------------------------------
    # Acessos de leitura usados pela API
    # ------------------------------------------------------------------
    @property
    def ancestors(self):
        """Breadcrumb — uma única query, sem subir a árvore em N passos."""
        ids = [uid for uid in self.path.split("/") if uid and uid != str(self.pk)]
        if not ids:
            return Folder.objects.none()
        return Folder.objects.filter(pk__in=ids).order_by("depth")

    @property
    def descendants(self):
        return Folder.objects.descendants_of(self)