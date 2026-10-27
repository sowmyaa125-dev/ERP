from django.db import transaction
from rest_framework import serializers

from .scoping import check_branch_access, check_company_access, check_same_company
from .services import is_inter_state, next_document_number

LINE_FIELDS = [
    'id', 'product', 'product_name', 'unit_name', 'description', 'hsn_code',
    'quantity', 'rate', 'discount_percent', 'gst_percent',
    'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total_amount',
]
LINE_READ_ONLY = ['id', 'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total_amount']

DOCUMENT_FIELDS = [
    'id', 'company', 'company_name', 'branch', 'number', 'date', 'notes',
    'is_inter_state', 'place_of_supply',
    'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'tax_amount',
    'round_off', 'grand_total', 'created_at', 'updated_at',
]
DOCUMENT_READ_ONLY = [
    'id', 'number', 'is_inter_state', 'place_of_supply',
    'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount',
    'round_off', 'grand_total', 'created_at', 'updated_at',
]


class TaxLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    unit_name = serializers.CharField(source='product.unit.short_name', read_only=True, allow_null=True)

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('Quantity must be greater than zero.')
        return value

    def validate_rate(self, value):
        if value < 0:
            raise serializers.ValidationError('Rate cannot be negative.')
        return value


class TaxDocumentSerializer(serializers.ModelSerializer):
    """
    Base for GST documents with nested `items`. Subclasses declare:
      number_prefix      e.g. 'INV-'
      party_field        'customer' or 'supplier'
      line_parent_field  FK name on the line model pointing back at the document
      company_fields     header FKs that must belong to the same company
      editable_statuses  statuses in which the document may still be edited
    and may override after_create() for side effects such as stock posting.
    """

    number_prefix = None
    party_field = None
    line_parent_field = None
    company_fields = ()
    editable_statuses = ()

    company_name = serializers.CharField(source='company.name', read_only=True)
    tax_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    def _current(self, attrs, field):
        if field in attrs:
            return attrs[field]
        return getattr(self.instance, field, None) if self.instance else None

    def validate(self, attrs):
        user = self.context['request'].user

        if self.instance is not None:
            if self.instance.status not in self.editable_statuses:
                raise serializers.ValidationError(
                    f'{self.instance.number} is {self.instance.get_status_display()} and can no longer be edited.'
                )
            if 'company' in attrs and attrs['company'] != self.instance.company:
                raise serializers.ValidationError({'company': 'Company cannot be changed after creation.'})

        company = self._current(attrs, 'company')
        check_company_access(user, company)
        check_branch_access(user, company, self._current(attrs, 'branch'))
        check_same_company(company, **{f: self._current(attrs, f) for f in (self.party_field, *self.company_fields)})

        items = attrs.get('items')
        if items is None and self.instance is None:
            raise serializers.ValidationError({'items': 'At least one line item is required.'})
        if items is not None:
            if not items:
                raise serializers.ValidationError({'items': 'At least one line item is required.'})
            for item in items:
                if item['product'].company_id != company.id:
                    raise serializers.ValidationError(
                        {'items': f"{item['product'].name} does not belong to the selected company."}
                    )
        return attrs

    def create(self, validated_data):
        items = validated_data.pop('items')
        user = self.context['request'].user
        model = self.Meta.model
        with transaction.atomic():
            validated_data['number'] = next_document_number(model, validated_data['company'], self.number_prefix)
            doc = model.objects.create(**validated_data, created_by=user, updated_by=user)
            lines = self.write_lines(doc, items)
            self.after_create(doc, lines)
        return doc

    def update(self, instance, validated_data):
        items = validated_data.pop('items', None)
        with transaction.atomic():
            for key, value in validated_data.items():
                setattr(instance, key, value)
            instance.updated_by = self.context['request'].user
            instance.save()
            if items is not None:
                instance.items.all().delete()
                self.write_lines(instance, items)
            else:
                # Party or branch may have changed, which can flip IGST/CGST.
                self.recompute_lines(instance)
        return instance

    def _apply_place_of_supply(self, doc):
        party = getattr(doc, self.party_field)
        doc.is_inter_state = is_inter_state(doc.company, doc.branch, party)
        doc.place_of_supply = party.state or ''
        doc.save(update_fields=['is_inter_state', 'place_of_supply'])

    def write_lines(self, doc, items):
        self._apply_place_of_supply(doc)
        line_model = self.fields['items'].child.Meta.model
        lines = []
        for item in items:
            if not item.get('hsn_code'):
                item['hsn_code'] = item['product'].hsn_code
            line = line_model(**{self.line_parent_field: doc}, **item)
            line.compute(doc.is_inter_state)
            line.save()
            lines.append(line)
        doc.recalculate_totals()
        return lines

    def recompute_lines(self, doc):
        self._apply_place_of_supply(doc)
        for line in doc.items.all():
            line.compute(doc.is_inter_state)
            line.save()
        doc.recalculate_totals()

    def after_create(self, doc, lines):
        pass
