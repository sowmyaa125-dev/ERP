from django.core.exceptions import ValidationError
from django.db import models


class Company(models.Model):

    COMPANY_TYPE_CHOICES = (
        ("MAIN", "Main Company"),
        ("SUB", "Sub Company"),
    )

    STATUS_CHOICES = (
        ("PENDING", "Pending"),
        ("ACTIVE", "Active"),
        ("INACTIVE", "Inactive"),
        ("REJECTED", "Rejected"),
    )

    name = models.CharField(max_length=200)
    legal_name = models.CharField(max_length=250, blank=True, null=True)
    company_type = models.CharField(max_length=10, choices=COMPANY_TYPE_CHOICES)

    parent_company = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        related_name="sub_companies",
        blank=True,
        null=True,
    )

    # The registered (top-level) company this one was created under. The
    # registered company itself has owner=None. A registered company can
    # own further Main companies, and Sub companies hang off any of them.
    owner = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        related_name="owned_companies",
        blank=True,
        null=True,
    )

    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    location = models.CharField(max_length=150, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    pin_code = models.CharField(max_length=10, blank=True, null=True)
    gst_number = models.CharField(max_length=30, blank=True, null=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")

    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Companies"

    def __str__(self):
        return self.name

    @property
    def registered_company(self):
        """Top of this company's group: owner if set, else walk up from a Sub, else itself."""
        if self.owner_id:
            return self.owner
        if self.company_type == "SUB" and self.parent_company_id:
            return self.parent_company.registered_company
        return self

    @property
    def is_registered_company(self):
        return self.company_type == "MAIN" and not self.owner_id

    def group_queryset(self):
        """Every company in this company's registered group, including the registered company."""
        root = self.registered_company
        return Company.objects.filter(
            models.Q(pk=root.pk) | models.Q(owner=root) | models.Q(parent_company=root)
        )

    def clean(self):
        if self.company_type == "MAIN" and self.parent_company_id:
            raise ValidationError("A Main Company cannot have a parent company.")
        if self.company_type == "SUB" and not self.parent_company_id:
            raise ValidationError("A Sub-Company must have a parent Main Company.")
        if self.parent_company_id and self.parent_company.company_type != "MAIN":
            raise ValidationError("Sub-Companies can only be attached to a Main Company.")


class Branch(models.Model):

    STATUS_CHOICES = (
        ("ACTIVE", "Active"),
        ("INACTIVE", "Inactive"),
    )

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="branches")
    branch_code = models.CharField(max_length=50)
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True, null=True)
    location = models.CharField(max_length=150, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    pin_code = models.CharField(max_length=10, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    gst_number = models.CharField(max_length=30, blank=True, null=True)

    branch_manager = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="managed_branches"
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")

    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "branch_code"], name="unique_branch_code_per_company")
        ]

    def __str__(self):
        return f"{self.company.name} - {self.name}"


class Department(models.Model):

    STATUS_CHOICES = (
        ("ACTIVE", "Active"),
        ("INACTIVE", "Inactive"),
    )

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="departments")
    branch = models.ForeignKey(
        Branch, on_delete=models.SET_NULL, related_name="departments", blank=True, null=True
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)

    department_head = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="headed_departments"
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")

    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "code"], name="unique_department_code_per_company")
        ]

    def __str__(self):
        return self.name

    def clean(self):
        if self.branch_id and self.branch.company_id != self.company_id:
            raise ValidationError("Department branch must belong to the same company as the department.")


class Role(models.Model):
    """
    A role belongs to a company and defines a data-visibility scope.
    Full feature-level permissions (who can edit vs view) can layer on
    top of this later — this phase focuses on company/branch scope,
    which is the immediate need per the spec.
    """

    SCOPE_CHOICES = (
        ("COMPANY_WIDE", "Company-wide"),
        ("SELECTED_BRANCHES", "Selected Branches"),
        ("OWN_BRANCH", "Own Branch"),
        ("SELECTED_SUB_COMPANIES", "Selected Sub-Companies"),
    )

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="roles")
    name = models.CharField(max_length=100)
    scope = models.CharField(max_length=30, choices=SCOPE_CHOICES, default="OWN_BRANCH")

    scoped_branches = models.ManyToManyField(
        Branch,
        blank=True,
        related_name="+",
        help_text="Used only when scope=SELECTED_BRANCHES.",
    )
    scoped_sub_companies = models.ManyToManyField(
        Company,
        blank=True,
        related_name="+",
        help_text="Used only when scope=SELECTED_SUB_COMPANIES (Main Company roles only).",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="unique_role_name_per_company")
        ]

    def __str__(self):
        return f"{self.name} ({self.company.name})"