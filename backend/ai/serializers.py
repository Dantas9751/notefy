"""Payloads dos endpoints de IA."""

from rest_framework import serializers

from .tarefas import TAREFAS


class ChatMessageSerializer(serializers.Serializer):
    # Só user/assistant: mensagens "system" vindas do cliente seriam um
    # vetor de prompt injection — o system prompt é montado no backend.
    role = serializers.ChoiceField(choices=("user", "assistant"))
    content = serializers.CharField(max_length=12000)


class ChatRequestSerializer(serializers.Serializer):
    messages = ChatMessageSerializer(many=True, allow_empty=False)
    # Documento cujo conteúdo vira contexto do sistema. Opcional: sem ele
    # o assistente responde só do que o usuário escreveu.
    document_id = serializers.UUIDField(required=False)


class RunRequestSerializer(serializers.Serializer):
    """Pedido do endpoint único de IA.

    `task` escolhe a instrução (catálogo em tarefas.py); o resto é o
    material: o documento aberto, um texto avulso, o histórico de chat e
    o que fazer com o resultado.
    """

    task = serializers.ChoiceField(choices=sorted(TAREFAS))
    #: Documento que entra como contexto (o aberto na tela).
    document_id = serializers.UUIDField(required=False)
    #: Texto extra: a pergunta, o idioma da tradução, o trecho selecionado.
    input = serializers.CharField(required=False, allow_blank=True, max_length=12000)
    #: Histórico, só para a tarefa de chat.
    messages = ChatMessageSerializer(many=True, required=False)
    #: Onde gravar o resultado quando a tarefa gera documento:
    #: `replace` sobrescreve o `target_id`; `create` cria um item novo na
    #: pasta; vazio devolve o conteúdo sem gravar (pré-visualização).
    apply = serializers.ChoiceField(
        choices=("replace", "create"), required=False, allow_blank=True
    )
    target_id = serializers.UUIDField(required=False)
    folder_id = serializers.UUIDField(required=False)
    title = serializers.CharField(required=False, allow_blank=True, max_length=200)
    #: Tipo do documento a criar em "Criar a partir de".
    kind = serializers.ChoiceField(
        choices=("note", "spreadsheet", "diagram", "canvas"), required=False
    )

    def validate(self, dados):
        if dados.get("apply") == "replace" and not dados.get("target_id"):
            raise serializers.ValidationError(
                {"target_id": "Obrigatório para gravar sobre um documento."}
            )
        if dados.get("apply") == "create" and not dados.get("folder_id"):
            raise serializers.ValidationError(
                {"folder_id": "Obrigatório para criar um documento."}
            )
        return dados