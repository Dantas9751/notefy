from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import User, UserPreferences


@receiver(post_save, sender=User)
def create_user_preferences(sender, instance, created, **kwargs):
    """Todo usuário nasce com um registro de preferências, para que o
    frontend nunca precise tratar o caso 'ainda não existe'."""
    if created:
        UserPreferences.objects.get_or_create(user=instance)
