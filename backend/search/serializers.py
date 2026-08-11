"""Serializers de documentação da busca.

A busca global não persiste nada: estes serializers existem para que o
schema OpenAPI (e o cliente gerado a partir dele) descreva o formato real
da resposta em vez de um objeto opaco.
"""

from rest_framework import serializers


class SearchResultSerializer(serializers.Serializer):
    type = serializers.ChoiceField(
        choices=["note", "file", "spreadsheet", "diagram", "canvas", "folder", "task"]
    )
    id = serializers.CharField()
    title = serializers.CharField()
    subtitle = serializers.CharField(allow_blank=True)
    snippet = serializers.CharField(allow_blank=True)
    status = serializers.CharField(allow_blank=True)
    color = serializers.CharField(allow_null=True)
    icon = serializers.CharField()
    url = serializers.CharField()
    updated_at = serializers.DateTimeField()
    score = serializers.FloatField()


class GlobalSearchResponseSerializer(serializers.Serializer):
    query = serializers.CharField(allow_blank=True)
    counts = serializers.DictField(child=serializers.IntegerField())
    total = serializers.IntegerField()
    results = SearchResultSerializer(many=True)


class FacetOptionSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()


class FacetCategorySerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    color = serializers.CharField()
    icon = serializers.CharField(allow_blank=True)


class SearchFacetsResponseSerializer(serializers.Serializer):
    categories = FacetCategorySerializer(many=True)
    types = FacetOptionSerializer(many=True)
    document_statuses = FacetOptionSerializer(many=True)
    task_statuses = FacetOptionSerializer(many=True)
    task_priorities = FacetOptionSerializer(many=True)
