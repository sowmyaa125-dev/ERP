from decimal import Decimal

from rest_framework import serializers

from companies.models import Company


def next_document_number(model, company, prefix):
    """
    Next sequential number for this company, e.g. INV-00042.
    Must be called inside transaction.atomic(): the company row is locked
    so two users saving at once cannot get the same number.
    """
    Company.objects.select_for_update().get(pk=company.pk)
    last = (
        model.objects.filter(company=company, number__startswith=prefix)
        .order_by('-id').values_list('number', flat=True).first()
    )
    suffix = last[len(prefix):] if last else ''
    seq = int(suffix) + 1 if suffix.isdigit() else 1
    return f'{prefix}{seq:05d}'


def is_inter_state(company, branch, party):
    """IGST applies when the party's state differs from our (branch or company) state."""
    our_state = (branch.state if branch and branch.state else company.state) or ''
    their_state = party.state or ''
    return bool(our_state and their_state and our_state.strip().lower() != their_state.strip().lower())


def post_stock(*, company, product, warehouse, quantity, movement_type, note, user):
    """
    Write one stock ledger row. Negative quantities are checked against the
    current balance (row-locked) so stock can never go below zero.
    Services carry no stock and are skipped.
    """
    from stock.models import Stock, StockMovement

    if product.product_type == 'SERVICE' or not quantity:
        return None
    quantity = Decimal(quantity)
    if quantity < 0:
        stock = Stock.objects.select_for_update().filter(product=product, warehouse=warehouse).first()
        available = stock.quantity if stock else Decimal('0')
        if available + quantity < 0:
            raise serializers.ValidationError(
                f'Insufficient stock for {product.name} at {warehouse.name}: '
                f'available {available}, required {-quantity}.'
            )
    return StockMovement.objects.create(
        company=company, product=product, warehouse=warehouse,
        movement_type=movement_type, quantity=quantity,
        reference_note=note, created_by=user,
    )
