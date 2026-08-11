"""Busca global — nome, categoria, data e tipo de item, tudo ao mesmo tempo.

Com nota, arquivo, planilha, diagrama e canvas na mesma tabela, a busca
tem apenas três ramos (documento, pasta, tarefa) em vez de um por formato,
e um tipo novo de documento passa a ser encontrável sem tocar aqui.
"""

from django.conf import settings
from django.contrib.postgres.search import SearchQuery, SearchRank
from django.db.models import Count, F, Q
from django.utils.dateparse import parse_date
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from content.models import Document
from organization.models import Category, Folder
from planner.models import Task

from .serializers import GlobalSearchResponseSerializer, SearchFacetsResponseSerializer

#: Tipos aceitos em ?type= — os cinco de documento mais pasta e tarefa.
DOCUMENT_TYPES = tuple(Document.Kind.values)
ITEM_TYPES = DOCUMENT_TYPES + ("folder", "task")

#: Ícone e rota do frontend por tipo de documento.
_DOCUMENT_UI = {
    Document.Kind.NOTE: ("file-text", "/notes"),
    Document.Kind.FILE: ("paperclip", "/files"),
    Document.Kind.SPREADSHEET: ("table", "/sheets"),
    Document.Kind.DIAGRAM: ("workflow", "/diagrams"),
    Document.Kind.CANVAS: ("layout-dashboard", "/canvas"),
}

MAX_PER_TYPE = 50


@extend_schema(
    responses=GlobalSearchResponseSerializer,
    parameters=[
        OpenApiParameter("q", str, description="Termo livre."),
        OpenApiParameter("type", str, many=True, enum=ITEM_TYPES),
        OpenApiParameter("category", str, many=True, description="UUID de categoria."),
        OpenApiParameter("status", str, description="Status de documento ou tarefa."),
        OpenApiParameter("date_from", str, description="YYYY-MM-DD."),
        OpenApiParameter("date_to", str, description="YYYY-MM-DD."),
        OpenApiParameter("limit", int, description=f"Máximo por grupo (teto {MAX_PER_TYPE})."),
    ],
)
class GlobalSearchView(APIView):
    """GET /api/search/ — resultados de todos os tipos num formato só."""

    permission_classes = [IsAuthenticated]
    throttle_scope = "search"

    def get(self, request):
        params = request.query_params
        term = params.get("q", "").strip()
        types = [t for t in params.getlist("type") if t in ITEM_TYPES] or list(ITEM_TYPES)
        category_ids = params.getlist("category")
        status_filter = params.get("status", "").strip()
        date_from = parse_date(params.get("date_from", "") or "")
        date_to = parse_date(params.get("date_to", "") or "")

        try:
            limit = min(int(params.get("limit", 20)), MAX_PER_TYPE)
        except ValueError:
            limit = 20

        ctx = {
            "user": request.user,
            "term": term,
            "category_ids": category_ids,
            "status": status_filter,
            "date_from": date_from,
            "date_to": date_to,
            "limit": limit,
            "request": request,
        }

        results = []
        counts = dict.fromkeys(types, 0)

        document_kinds = [t for t in types if t in DOCUMENT_TYPES]
        if document_kinds:
            items, per_kind = self._search_documents(ctx, document_kinds)
            results.extend(items)
            counts.update(per_kind)

        if "folder" in types:
            items, total = self._search_folders(ctx)
            results.extend(items)
            counts["folder"] = total

        if "task" in types:
            items, total = self._search_tasks(ctx)
            results.extend(items)
            counts["task"] = total

        # Sem termo de busca não há relevância a comparar entre tipos, então
        # ordenamos por recência; com termo, o rank manda.
        results.sort(key=lambda r: (r["score"], r["updated_at"]), reverse=True)

        return Response(
            {
                "query": term,
                "counts": counts,
                "total": sum(counts.values()),
                "results": results,
            }
        )

    # ------------------------------------------------------------------
    # Filtros comuns
    # ------------------------------------------------------------------
    @staticmethod
    def _apply_common(qs, ctx, category_field="categories"):
        if ctx["date_from"]:
            qs = qs.filter(created_at__date__gte=ctx["date_from"])
        if ctx["date_to"]:
            qs = qs.filter(created_at__date__lte=ctx["date_to"])
        if ctx["category_ids"]:
            qs = qs.filter(**{f"{category_field}__id__in": ctx["category_ids"]}).distinct()
        return qs

    @staticmethod
    def _document_ui(document):
        icon, route = _DOCUMENT_UI.get(document.kind, ("file", "/notes"))
        return document.icon or icon, route

    # ------------------------------------------------------------------
    # Documentos (nota, arquivo, planilha, diagrama, canvas)
    # ------------------------------------------------------------------
    def _search_documents(self, ctx, kinds):
        qs = (
            Document.objects.filter(owner=ctx["user"], kind__in=kinds)
            .loose()
            .select_related("folder", "folder__category")
        )
        # A categoria do item vem da pasta — não há M2M para atravessar.
        qs = self._apply_common(qs, ctx, category_field="folder__category")
        if ctx["status"] in Document.Status.values:
            qs = qs.filter(status=ctx["status"])

        ranked = False
        if ctx["term"]:
            # Full-text primeiro (usa o índice GIN); se o termo não casar
            # com nenhum lexema — prefixo curto, palavra parcial — caímos
            # para icontains para não devolver tela vazia enquanto o
            # usuário ainda está digitando.
            query = SearchQuery(ctx["term"], config=settings.SEARCH_CONFIG)
            fts = qs.filter(search_vector=query).annotate(
                # F(), não a string: com string o Django embrulha em
                # SearchVector() e gera to_tsvector(search_vector::text),
                # reindexando o tsvector pronto como se fosse texto — o que
                # destrói os pesos A/B e zera o rank.
                rank=SearchRank(F("search_vector"), query)
            )
            if fts.exists():
                qs, ranked = fts.order_by("-rank"), True
            else:
                qs = qs.filter(
                    Q(title__icontains=ctx["term"]) | Q(search_text__icontains=ctx["term"])
                ).order_by("-updated_at")
        else:
            qs = qs.order_by("-updated_at")

        # Uma contagem por tipo, e não uma query por tipo: o frontend usa
        # esses números nos chips de filtro.
        #
        # `.order_by()` limpo é obrigatório: qualquer ordenação pendente
        # entraria no GROUP BY e quebraria o agrupamento (e `rank` sequer
        # existe fora do SELECT agregado).
        per_kind = dict.fromkeys(kinds, 0)
        for row in qs.order_by().values("kind").annotate(total=Count("id")):
            per_kind[row["kind"]] = row["total"]

        items = []
        for doc in qs[: ctx["limit"] * len(kinds)]:
            icon, route = _DOCUMENT_UI.get(doc.kind, ("file", "/notes"))
            items.append(
                {
                    "type": doc.kind,
                    "id": str(doc.id),
                    "title": doc.title,
                    "subtitle": doc.folder.name if doc.folder_id else "Sem pasta",
                    "snippet": doc.excerpt,
                    "status": doc.status,
                    "color": doc.color or None,
                    "icon": doc.icon or icon,
                    "url": f"{route}/{doc.id}",
                    "updated_at": doc.updated_at.isoformat(),
                    "score": float(getattr(doc, "rank", 0)) if ranked else 0.0,
                }
            )
        return items, per_kind

    # ------------------------------------------------------------------
    # Pastas
    # ------------------------------------------------------------------
    def _search_folders(self, ctx):
        qs = Folder.objects.filter(owner=ctx["user"]).select_related("category")
        qs = self._apply_common(qs, ctx, category_field="category")
        if ctx["term"]:
            qs = qs.filter(
                Q(name__icontains=ctx["term"]) | Q(description__icontains=ctx["term"])
            )
        total = qs.count()
        items = [
            {
                "type": "folder",
                "id": str(f.id),
                "title": f.name,
                "subtitle": f.category.name if f.category_id else "Sem categoria",
                "snippet": f.description[:200],
                "status": "archived" if f.is_archived else "active",
                "color": f.color or (f.category.color if f.category_id else None),
                "icon": f.icon or "folder",
                "url": f"/folders/{f.id}",
                "updated_at": f.updated_at.isoformat(),
                "score": 0.0,
            }
            for f in qs.order_by("-updated_at")[: ctx["limit"]]
        ]
        return items, total

    # ------------------------------------------------------------------
    # Tarefas
    # ------------------------------------------------------------------
    def _search_tasks(self, ctx):
        qs = Task.objects.filter(owner=ctx["user"]).prefetch_related("categories")
        qs = self._apply_common(qs, ctx)
        if ctx["status"] in Task.Status.values:
            qs = qs.filter(status=ctx["status"])
        if ctx["term"]:
            qs = qs.filter(
                Q(title__icontains=ctx["term"]) | Q(description__icontains=ctx["term"])
            )
        total = qs.count()
        items = [
            {
                "type": "task",
                "id": str(t.id),
                "title": t.title,
                "subtitle": t.starts_at.strftime("%d/%m/%Y %H:%M") if t.starts_at else "Sem data",
                "snippet": t.description[:200],
                "status": t.status,
                "color": t.color or None,
                "icon": "check-square",
                "url": f"/board?task={t.id}",
                "updated_at": t.updated_at.isoformat(),
                "score": 0.0,
            }
            for t in qs.order_by("-updated_at")[: ctx["limit"]]
        ]
        return items, total


@extend_schema(responses=SearchFacetsResponseSerializer)
class SearchFacetsView(APIView):
    """Opções para montar os dropdowns de filtro sem hardcode no frontend."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        categories = Category.objects.filter(owner=request.user).values(
            "id", "name", "color", "icon"
        )
        return Response(
            {
                "categories": [{**c, "id": str(c["id"])} for c in categories],
                "types": [
                    *[{"value": v, "label": l} for v, l in Document.Kind.choices],
                    {"value": "folder", "label": "Pastas"},
                    {"value": "task", "label": "Tarefas"},
                ],
                "document_statuses": [
                    {"value": v, "label": l} for v, l in Document.Status.choices
                ],
                "task_statuses": [
                    {"value": v, "label": l} for v, l in Task.Status.choices
                ],
                "task_priorities": [
                    {"value": v, "label": l} for v, l in Task.Priority.choices
                ],
            }
        )
