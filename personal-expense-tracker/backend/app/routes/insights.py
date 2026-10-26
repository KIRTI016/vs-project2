from datetime import date, timedelta

from flask import Blueprint, jsonify
from flask_login import current_user, login_required
from sqlalchemy import func

from ..extensions import db
from ..models import Expense

insights_bp = Blueprint("insights", __name__)


def _category_totals(start, end):
    rows = db.session.query(
        Expense.category,
        func.sum(Expense.amount),
        func.count(Expense.id),
    ).filter(
        Expense.user_id == current_user.id,
        Expense.date >= start,
        Expense.date <= end,
    ).group_by(Expense.category).all()
    return {
        category: {"amount": float(amount), "count": count}
        for category, amount, count in rows
    }


@insights_bp.get("")
@login_required
def spending_insights():
    today = date.today()
    current_start = today.replace(day=1)
    previous_start = (current_start - timedelta(days=1)).replace(day=1)
    previous_end = min(
        current_start - timedelta(days=1),
        previous_start + timedelta(days=today.day - 1),
    )

    current_totals = _category_totals(current_start, today)
    previous_totals = _category_totals(previous_start, previous_end)
    comparison_available = sum(item["count"] for item in previous_totals.values()) > 0
    current_total = round(sum(item["amount"] for item in current_totals.values()), 2)
    previous_total = round(sum(item["amount"] for item in previous_totals.values()), 2)

    categories = []
    for category in sorted(current_totals.keys() | previous_totals.keys()):
        current_amount = round(current_totals.get(category, {}).get("amount", 0), 2)
        previous_amount = round(previous_totals.get(category, {}).get("amount", 0), 2)
        change = round(current_amount - previous_amount, 2)
        categories.append({
            "category": category,
            "current_amount": current_amount,
            "previous_amount": previous_amount if comparison_available else None,
            "change_amount": change if comparison_available else None,
            "change_percent": (
                round(change / previous_amount * 100, 1)
                if comparison_available and previous_amount > 0
                else None
            ),
        })

    return jsonify({
        "current_month": {
            "start": current_start.isoformat(),
            "end": today.isoformat(),
            "total": current_total,
            "expense_count": sum(item["count"] for item in current_totals.values()),
        },
        "previous_month": {
            "start": previous_start.isoformat(),
            "end": previous_end.isoformat(),
            "total": previous_total if comparison_available else None,
            "expense_count": sum(item["count"] for item in previous_totals.values()),
        },
        "comparison_available": comparison_available,
        "comparison_basis": "Matching day range in the previous month",
        "categories": categories,
    })
