from datetime import date, timedelta
import math
import re

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import RecurringExpense
from .expenses import ALLOWED_CATEGORIES

recurring_bp = Blueprint("recurring", __name__)
ALLOWED_FREQUENCIES = {"weekly", "monthly", "yearly"}


def _parse_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        raise ValueError
    return date.fromisoformat(value)


def parse_recurring_expense(data):
    if not isinstance(data, dict):
        return None, "Enter recurring expense details as a JSON object"

    name_value = data.get("name")
    if not isinstance(name_value, str):
        return None, "Enter a name for this recurring payment"
    name = name_value.strip()
    if not name or len(name) > 100:
        return None, "Name must be between 1 and 100 characters"

    amount_value = data.get("amount")
    if isinstance(amount_value, bool):
        return None, "Enter a valid amount"
    try:
        amount = float(amount_value)
    except (TypeError, ValueError):
        return None, "Enter a valid amount"
    if not math.isfinite(amount) or amount <= 0 or amount > 100000000:
        return None, "Amount must be greater than zero and no more than ₹100,000,000"
    amount = round(amount, 2)
    if amount <= 0:
        return None, "Amount must be at least one paisa"

    category = data.get("category")
    if not isinstance(category, str) or category.strip() not in ALLOWED_CATEGORIES:
        return None, "Choose a valid category"
    category = category.strip()

    frequency = data.get("frequency")
    if not isinstance(frequency, str) or frequency not in ALLOWED_FREQUENCIES:
        return None, "Choose weekly, monthly, or yearly frequency"

    try:
        start_date = _parse_date(data.get("start_date"))
        next_due_date = _parse_date(data.get("next_due_date"))
    except (TypeError, ValueError):
        return None, "Enter valid start and next due dates using YYYY-MM-DD"
    if next_due_date < start_date:
        return None, "Next due date cannot be before the start date"

    notes_value = data.get("notes", "")
    if not isinstance(notes_value, str):
        return None, "Notes must be text"
    notes = notes_value.strip()
    if len(notes) > 240:
        return None, "Keep notes under 240 characters"

    is_active = data.get("is_active", True)
    if not isinstance(is_active, bool):
        return None, "Choose whether this recurring payment is active"

    return {
        "name": name,
        "amount": amount,
        "category": category,
        "frequency": frequency,
        "start_date": start_date,
        "next_due_date": next_due_date,
        "notes": notes,
        "is_active": is_active,
    }, None


def _monthly_estimate(item):
    if item.frequency == "weekly":
        return item.amount * 52 / 12
    if item.frequency == "yearly":
        return item.amount / 12
    return item.amount


@recurring_bp.get("")
@login_required
def list_recurring_expenses():
    items = RecurringExpense.query.filter_by(user_id=current_user.id).order_by(
        RecurringExpense.next_due_date,
        RecurringExpense.id,
    ).all()
    today = date.today()
    upcoming_end = today + timedelta(days=30)
    active_items = [item for item in items if item.is_active]
    upcoming_items = [
        item for item in active_items
        if today <= item.next_due_date <= upcoming_end
    ]
    return jsonify({
        "recurring_expenses": [item.to_dict() for item in items],
        "summary": {
            "monthly_estimate": round(sum(_monthly_estimate(item) for item in active_items), 2),
            "upcoming_count": len(upcoming_items),
            "upcoming_total": round(sum(item.amount for item in upcoming_items), 2),
            "upcoming_through": upcoming_end.isoformat(),
        },
    })


@recurring_bp.post("")
@login_required
def create_recurring_expense():
    data, error = parse_recurring_expense(request.get_json(silent=True))
    if error:
        return jsonify({"error": error}), 400
    item = RecurringExpense(user_id=current_user.id, **data)
    db.session.add(item)
    db.session.commit()
    return jsonify({"recurring_expense": item.to_dict()}), 201


@recurring_bp.put("/<int:item_id>")
@login_required
def update_recurring_expense(item_id):
    item = RecurringExpense.query.filter_by(id=item_id, user_id=current_user.id).first_or_404()
    data, error = parse_recurring_expense(request.get_json(silent=True))
    if error:
        return jsonify({"error": error}), 400
    for key, value in data.items():
        setattr(item, key, value)
    db.session.commit()
    return jsonify({"recurring_expense": item.to_dict()})


@recurring_bp.delete("/<int:item_id>")
@login_required
def delete_recurring_expense(item_id):
    item = RecurringExpense.query.filter_by(id=item_id, user_id=current_user.id).first_or_404()
    db.session.delete(item)
    db.session.commit()
    return jsonify({"message": "Recurring payment deleted"})
