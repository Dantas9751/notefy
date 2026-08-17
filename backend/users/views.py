import zipfile

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema

from . import backup
from .models import UserPreferences
from .serializers import (
    BackupImportSerializer,
    ChangePasswordSerializer,
    DeleteAccountSerializer,
    LogoutSerializer,
    NotefyTokenObtainPairSerializer,
    NotefyTokenRefreshSerializer,
    RegisterSerializer,
    UserPreferencesSerializer,
    UserSerializer,
)


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        # Já devolvemos os tokens: o usuário entra direto no app após o
        # cadastro, sem uma segunda ida à tela de login.
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": UserSerializer(user, context=self.get_serializer_context()).data,
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    serializer_class = NotefyTokenObtainPairSerializer
    throttle_scope = "auth"


@extend_schema(request=LogoutSerializer, responses={204: None})
class LogoutView(APIView):
    """Invalida o refresh token enviado (requer token_blacklist)."""

    permission_classes = [IsAuthenticated]
    serializer_class = LogoutSerializer

    def post(self, request):
        token = request.data.get("refresh")
        if not token:
            return Response(
                {"refresh": "Campo obrigatório."}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            RefreshToken(token).blacklist()
        except TokenError:
            # Token já expirado ou revogado: do ponto de vista do cliente o
            # logout teve o efeito desejado.
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotefyTokenRefreshView(TokenRefreshView):
    """Renovação de sessão que devolve 401, e não 500, para token órfão."""

    serializer_class = NotefyTokenRefreshSerializer


class MeView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH o perfil; DELETE apaga a conta e tudo que há nela."""

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    # Multipart além de JSON: a foto de perfil sobe pelo mesmo PATCH que
    # troca o nome de usuário, e não por uma rota separada — é um formulário
    # só na tela, e deve ser uma requisição só aqui.
    parser_classes = (JSONParser, MultiPartParser, FormParser)

    def get_object(self):
        user = self.request.user
        user.last_seen_at = timezone.now()
        user.save(update_fields=["last_seen_at"])
        return user

    @extend_schema(request=DeleteAccountSerializer, responses={204: None})
    def delete(self, request, *args, **kwargs):
        """Exclui a conta — categorias, pastas, itens, tarefas e arquivos.

        A cascata é a mesma das pastas: está declarada no banco, e por isso
        as chaves são CASCADE e não PROTECT — com PROTECT o coletor do
        Django travaria aqui e a conta seria impossível de apagar. Os
        arquivos em disco saem pelo `post_delete` de Document.
        """
        serializer = DeleteAccountSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        user = request.user
        # Revoga as sessões antes de apagar: sem isso, um refresh token
        # ainda válido continuaria circulando por aí.
        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)

        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PreferencesView(generics.RetrieveUpdateAPIView):
    serializer_class = UserPreferencesSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        prefs, _ = UserPreferences.objects.get_or_create(user=self.request.user)
        return prefs


class BackupExportView(APIView):
    """Baixa todo o conteúdo da conta como um .zip."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.BINARY})
    def get(self, request):
        conteudo = backup.exportar(request.user)
        response = HttpResponse(conteudo, content_type="application/zip")
        response["Content-Disposition"] = (
            f'attachment; filename="{backup.nome_do_arquivo(request.user)}"'
        )
        response["Content-Length"] = str(len(conteudo))
        return response


class BackupImportView(APIView):
    """Restaura um .zip gerado pela exportação."""

    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    @extend_schema(request=BackupImportSerializer, responses={200: OpenApiTypes.OBJECT})
    def post(self, request):
        serializer = BackupImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            resumo = backup.importar(
                request.user,
                serializer.validated_data["file"],
                substituir=serializer.validated_data["replace"],
            )
        except backup.BackupInvalido as exc:
            return Response({"file": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except zipfile.BadZipFile:
            return Response(
                {"file": "O arquivo enviado não é um .zip válido."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(resumo)


@extend_schema(request=ChangePasswordSerializer, responses={204: None})
class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChangePasswordSerializer
    throttle_scope = "auth"

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)
