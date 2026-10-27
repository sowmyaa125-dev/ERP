from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)

    company = models.ForeignKey(
        'companies.Company',
        null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='users',
    )
    branch = models.ForeignKey(
        'companies.Branch',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='users',
    )
    department = models.ForeignKey(
        'companies.Department',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='users',
    )

    role = models.ForeignKey(
        'companies.Role',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='users',
    )
    designation = models.CharField(max_length=100, blank=True)

    email_verified = models.BooleanField(default=False)
    approval_status = models.CharField(
        max_length=10,
        choices=(
            ('PENDING', 'Pending'),
            ('APPROVED', 'Approved'),
            ('REJECTED', 'Rejected'),
        ),
        default='PENDING',
    )

    is_super_admin = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    must_change_password = models.BooleanField(default=True)

    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip() or self.email

import secrets
from django.utils import timezone
from datetime import timedelta


class RegistrationOTP(models.Model):
    """
    One-time code emailed to a user. REGISTRATION verifies a self-registered
    Main Company's email before Super Admin approval; PASSWORD_CHANGE
    authorises the forced password change on first login.
    """
    PURPOSE_CHOICES = (
        ('REGISTRATION', 'Registration'),
        ('PASSWORD_CHANGE', 'Password Change'),
    )
    MAX_ATTEMPTS = 5

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='otps')
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default='REGISTRATION')
    code = models.CharField(max_length=6)
    attempts = models.PositiveSmallIntegerField(default=0)
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(minutes=10)
        super().save(*args, **kwargs)

    def is_valid(self):
        return not self.is_used and self.attempts < self.MAX_ATTEMPTS and timezone.now() < self.expires_at

    @staticmethod
    def generate_code():
        return f'{secrets.randbelow(1000000):06d}'

    def __str__(self):
        return f'{self.user.email} - {self.code}'