"""Roteamento da API do Notefy.

Todo o backend vive sob /api/ — não há view que devolva HTML de aplicação;
o frontend é servido separadamente pelo Vite.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from content.views import DocumentViewSet, FavoritesView
from core.trash import TrashItemView, TrashView
from organization.views import CategoryViewSet, FolderViewSet
from planner.views import BoardViewSet, ChecklistItemViewSet, TaskViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("folders", FolderViewSet, basename="folder")
# Uma rota só para nota, arquivo, planilha, diagrama e canvas — o `kind`
# distingue, e filtros como ?kind=spreadsheet dão as visões por tipo.
router.register("documents", DocumentViewSet, basename="document")
router.register("boards", BoardViewSet, basename="board")
router.register("tasks", TaskViewSet, basename="task")
router.register("checklist-items", ChecklistItemViewSet, basename="checklist-item")

api_urlpatterns = [
    *router.urls,
    path("favorites/", FavoritesView.as_view(), name="favorites"),
    path("trash/", TrashView.as_view(), name="trash"),
    path("trash/<str:tipo>/<uuid:item_id>/", TrashItemView.as_view(), name="trash-item"),
    path("", include("users.urls")),
    path("", include("search.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(api_urlpatterns)),
]

if settings.DEBUG or settings.DESKTOP_MODE:
    # Servidor web na frente do Django existe quando há deploy; no
    # aplicativo de desktop não há nginx nem S3, e os uploads do usuário
    # estão no disco dele — quem os entrega é o próprio Django.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
