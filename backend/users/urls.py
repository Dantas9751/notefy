from django.urls import path
from rest_framework_simplejwt.views import TokenVerifyView

from .views import (
    BackupExportView,
    BackupImportView,
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    NotefyTokenRefreshView,
    PreferencesView,
    RegisterView,
)

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", NotefyTokenRefreshView.as_view(), name="auth-refresh"),
    path("auth/verify/", TokenVerifyView.as_view(), name="auth-verify"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("me/", MeView.as_view(), name="me"),
    path("me/preferences/", PreferencesView.as_view(), name="me-preferences"),
    path("me/backup/", BackupExportView.as_view(), name="me-backup-export"),
    path("me/backup/import/", BackupImportView.as_view(), name="me-backup-import"),
]
