import zipfile

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
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

from core.excecoes import JSONParserSeguro
from core.idioma import texto
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer

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
    parser_classes = (JSONParserSeguro, MultiPartParser, FormParser)

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
        revogar_sessoes(user)

        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PreferencesView(generics.RetrieveUpdateAPIView):
    serializer_class = UserPreferencesSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        prefs, _ = UserPreferences.objects.get_or_create(user=self.request.user)
        return prefs


#: Onde cada foto do Início fica guardada: `?para=` escolhe.
FOTOS_DO_INICIO = {"capa": "home_cover", "fundo": "home_background", "foto": "home_photo"}


class CapaDoInicioView(APIView):
    """As fotos do Início: a capa, o papel de parede e a do relógio
    (`?para=capa|fundo|foto`, capa sem nada), enviadas do computador ou
    arrastadas para elas.

    Ficam nas preferências, e não como arquivo numa pasta: não são conteúdo,
    e um arquivo solto apareceria na pasta, na busca e nos recentes. Uma de
    cada por conta — enviar outra apaga a anterior do disco.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def campo(self, request):
        return FOTOS_DO_INICIO.get(request.query_params.get("para", "capa"))

    @extend_schema(
        parameters=[OpenApiParameter("para", str, enum=list(FOTOS_DO_INICIO), required=False)],
        request=inline_serializer("CapaDoInicio", {"imagem": serializers.ImageField()}),
        responses={201: inline_serializer("CapaDoInicioUrl", {"url": serializers.URLField()})},
    )
    def post(self, request):
        nome = self.campo(request)
        if not nome:
            return Response({"para": [texto("Destino desconhecido.", "Unknown target.")]}, status=status.HTTP_400_BAD_REQUEST)
        campo = serializers.ImageField()
        try:
            imagem = campo.run_validation(request.data.get("imagem"))
        except serializers.ValidationError as erro:
            return Response({"imagem": erro.detail}, status=status.HTTP_400_BAD_REQUEST)
        if imagem.size > settings.MAX_UPLOAD_SIZE:
            limite = settings.MAX_UPLOAD_SIZE // (1024 * 1024)
            return Response(
                {"imagem": [texto(f"A imagem passa do limite de {limite} MB.", f"The image is over the {limite} MB limit.")]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        prefs, _ = UserPreferences.objects.get_or_create(user=request.user)
        antiga = getattr(prefs, nome)
        if antiga:
            antiga.delete(save=False)
        setattr(prefs, nome, imagem)
        prefs.save(update_fields=[nome])
        return Response({"url": request.build_absolute_uri(getattr(prefs, nome).url)}, status=status.HTTP_201_CREATED)

    @extend_schema(
        parameters=[OpenApiParameter("para", str, enum=list(FOTOS_DO_INICIO), required=False)],
        responses={204: None},
    )
    def delete(self, request):
        nome = self.campo(request)
        prefs = UserPreferences.objects.filter(user=request.user).first()
        if nome and prefs and getattr(prefs, nome):
            getattr(prefs, nome).delete(save=False)
            setattr(prefs, nome, None)
            prefs.save(update_fields=[nome])
        return Response(status=status.HTTP_204_NO_CONTENT)


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
def revogar_sessoes(user):
    """Invalida todo refresh token já emitido para `user`.

    O access token continua valendo até expirar (é assinado, não
    consultado), mas dura minutos. É o refresh, que dura dias, que precisa
    morrer: é ele que mantém dentro quem levou a sessão.
    """
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


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

        # Trocar a senha é o gesto de quem desconfia que alguém entrou. Sem
        # revogar, a sessão roubada seguia renovando o próprio token como
        # se nada tivesse acontecido. Quem trocou recebe um par novo e
        # continua logado; todo o resto cai.
        revogar_sessoes(request.user)
        novo = RefreshToken.for_user(request.user)
        return Response({"access": str(novo.access_token), "refresh": str(novo)})
