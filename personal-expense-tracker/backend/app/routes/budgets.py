from datetime import date
import math

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Budget, Expense
from .expenses import ALLOWED_CATEGORIES

budgets_bp = Blueprint("budgets", __name__)
ALLOWED_BUDGET_CATEGORIES = ALLOWED_CATEGORIES | {"Overall"}


def parse_month(value):
    return date.fromisoformat(f"{value}-01")


@budgets_bp.get("")
@login_required
def list_budgets():
    month = request.args.get("month", date.today().strftime("%Y-%m"))
    try:
        month_start = parse_month(month)
    except (TypeError, ValueError):
        return jsonify({"error": "Month must use YYYY-MM format"}), 400
    budgets = Budget.query.filter_by(user_id=current_user.id, month=month_start).order_by(Budget.category).all()
    next_month = date(month_start.year + (month_start.month == 12), month_start.month % 12 + 1, 1)
    totals = db.session.query(Expense.category, db.func.sum(Expense.amount)).filter(
        Expense.user_id == current_user.id,
        Expense.date >= month_start,
        Expense.date < next_month,
    ).group_by(Expense.category).all()
    spent_by_category = dict(totals)
    overall_spent = sum(float(amount) for amount in spent_by_category.values())
    return jsonify({"budgets": [
        {**budget.to_dict(), "spent": round(overall_spent if budget.category == "Overall" else float(spent_by_category.get(budget.category, 0)), 2)}
        for budget in budgets
    ]})


@budgets_bp.post("")
@login_required
def save_budget():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400
    category = str(data.get("category", "")).strip()
    try:
        amount = round(float(data.get("amount")), 2)
        month = parse_month(str(data.get("month", "")))
    except (TypeError, ValueError):
        return jsonify({"error": "Enter a valid amount and month"}), 400
    if category not in ALLOWED_BUDGET_CATEGORIES or not math.isfinite(amount) or amount <= 0 or amount > 100000000:
        return jsonify({"error": "Choose a valid category and an amount greater than zero"}), 400
    budget = Budget.query.filter_by(user_id=current_user.id, category=category, month=month).first()
    if budget is None:
        budget = Budget(user_id=current_user.id, category=category, month=month, amount=amount)
        db.session.add(budget)
    else:
        budget.amount = amount
    db.session.commit()
    return jsonify({"budget": budget.to_dict()}), 201


@budgets_bp.delete("/<int:budget_id>")
@login_required
def delete_budget(budget_id):
    budget = Budget.query.filter_by(id=budget_id, user_id=current_user.id).first_or_404()
    db.session.delete(budget)
    db.session.commit()
    return jsonify({"message": "Budget deleted"})