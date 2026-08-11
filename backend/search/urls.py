from django.urls import path

from .views import GlobalSearchView, SearchFacetsView

urlpatterns = [
    path("search/", GlobalSearchView.as_view(), name="global-search"),
    path("search/facets/", SearchFacetsView.as_view(), name="search-facets"),
]
