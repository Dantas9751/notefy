from django.contrib.auth import get_user_model, password_validation
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)

from .models import User, UserPreferences


class UserPreferencesSerializer(serializers.ModelSerializer):
    # Os limites moram aqui e não no model: assim um valor fora da faixa
    # volta como 400 com a mensagem do campo, em vez de estourar no banco.
    canvas_pen_size = serializers.IntegerField(min_value=1, max_value=20, required=False)
    canvas_highlighter_opacity = serializers.IntegerField(
        min_value=10, max_value=80, required=False
    )
    canvas_eraser_radius = serializers.IntegerField(
        min_value=10, max_value=80, required=False
    )

    class Meta:
        model = UserPreferences
        fields = (
            "theme",
            "default_view",
            "sidebar_collapsed",
            "accent_color",
            "editor_font_size",
            "week_starts_on_monday",
            "canvas_pen_size",
            "canvas_highlighter_opacity",
            "canvas_eraser_radius",
        )


class UserSerializer(serializers.ModelSerializer):
    preferences = UserPreferencesSerializer(read_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "full_name", "avatar", "date_joined", "preferences")
        read_only_fields = ("id", "date_joined")

    def validate_username(self, value):
        """Trocar o próprio nome de usuário na tela de perfil.

        Editável, ao contrário do e-mail que estava aqui antes: o nome é só
        um rótulo local, e o dono do aplicativo pode querer mudá-lo. A
        unicidade continua valendo — checada sem diferenciar maiúsculas,
        porque "Ana" e "ana" seriam a mesma pessoa procurando entrar.
        """
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Informe um nome de usuário.")
        outros = User.objects.filter(username__iexact=value)
        if self.instance is not None:
            outros = outros.exclude(pk=self.instance.pk)
        if outros.exists():
            raise serializers.ValidationError("Este nome de usuário já está em uso.")
        return value


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    password_confirm = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ("id", "username", "password", "password_confirm")
        read_only_fields = ("id",)

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Informe um nome de usuário.")
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Já existe uma conta com este nome de usuário.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "As senhas não conferem."})
        password_validation.validate_password(attrs["password"])
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        validated_data.pop("password_confirm")
        return User.objects.create_user(**validated_data)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class BackupImportSerializer(serializers.Serializer):
    """Envio do .zip de backup."""

    file = serializers.FileField()
    #: Padrão `False` de propósito: importar ADICIONA. Só apaga o que já
    #: existe quando a tela manda `replace=true`, depois de confirmar — um
    #: backup restaurado por engano não pode custar o trabalho de hoje.
    replace = serializers.BooleanField(default=False)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Senha atual incorreta.")
        return value

    def validate_new_password(self, value):
        password_validation.validate_password(value, self.context["request"].user)
        return value


class DeleteAccountSerializer(serializers.Serializer):
    """Confirmação da exclusão da conta.

    Pede a senha porque a ação é irreversível e leva tudo junto — quem
    deixou o app aberto não perde os dados por um clique errado.
    """

    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Senha incorreta.")
        return value


class NotefyTokenRefreshSerializer(TokenRefreshSerializer):
    """Renovação de sessão de uma conta que pode não existir mais.

    A versão da biblioteca busca o dono do token com `.get()` e deixa o
    `DoesNotExist` subir, virando 500. Isso acontece de verdade: a conta é
    excluída numa aba e outra aba, ainda aberta, tenta renovar. O certo é
    401 — o token realmente não vale mais, e é assim que o frontend sabe
    que deve mandar para a tela de login em vez de mostrar erro de servidor.
    """

    def validate(self, attrs):
        try:
            return super().validate(attrs)
        except get_user_model().DoesNotExist as exc:
            raise InvalidToken("O token é inválido") from exc


class NotefyTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Devolve o usuário junto dos tokens.

    Poupa o frontend de um segundo request a /me logo após o login, que
    provocaria um flash de layout vazio.
    """

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user, context=self.context).data
        return data
