from datetime import date
import math
import re

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Budget, Expense
from .expenses import ALLOWED_CATEGORIES

budgets_bp = Blueprint("budgets", __name__)
ALLOWED_BUDGET_CATEGORIES = ALLOWED_CATEGORIES | {"Overall"}


def parse_month(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", value):
        raise ValueError
    return date.fromisoformat(f"{value}-01")


def _monthly_spend(user_id, month_start, category=None):
    next_month = date(month_start.year + (month_start.month == 12), month_start.month % 12 + 1, 1)
    query = db.session.query(db.func.sum(Expense.amount)).filter(
        Expense.user_id == user_id,
        Expense.date >= month_start,
        Expense.date < next_month,
    )
    if category is not None:
        query = query.filter(Expense.category == category)
    return round(float(query.scalar() or 0), 2)


def _purchase_impact(budget, spent, purchase_amount):
    if budget is None:
        return {
            "budget": None,
            "spent_before": spent,
            "remaining_before": None,
            "remaining_after": None,
            "would_exceed": None,
        }
    remaining_before = round(budget.amount - spent, 2)
    projected_spend = round(spent + purchase_amount, 2)
    return {
        "budget": round(budget.amount, 2),
        "spent_before": spent,
        "remaining_before": remaining_before,
        "remaining_after": round(remaining_before - purchase_amount, 2),
        "would_exceed": projected_spend > round(budget.amount, 2),
    }


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


@budgets_bp.post("/simulate")
@login_required
def simulate_purchase():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Enter purchase details as a JSON object"}), 400

    amount_value = data.get("amount")
    if isinstance(amount_value, bool):
        return jsonify({"error": "Enter a valid purchase amount"}), 400
    try:
        amount = float(amount_value)
    except (TypeError, ValueError):
        return jsonify({"error": "Enter a valid purchase amount"}), 400
    if not math.isfinite(amount):
        return jsonify({"error": "Enter a valid purchase amount"}), 400
    if amount <= 0:
        return jsonify({"error": "Purchase amount must be greater than zero"}), 400
    if amount > 100000000:
        return jsonify({"error": "Purchase amount cannot exceed ₹100,000,000"}), 400
    amount = round(amount, 2)
    if amount <= 0:
        return jsonify({"error": "Purchase amount must be at least one cent"}), 400

    category = data.get("category")
    if not isinstance(category, str) or category.strip() not in ALLOWED_CATEGORIES:
        return jsonify({"error": "Choose a valid purchase category"}), 400
    category = category.strip()

    purchase_name = data.get("name", "")
    if not isinstance(purchase_name, str) or len(purchase_name.strip()) > 80:
        return jsonify({"error": "Purchase name must be 80 characters or fewer"}), 400
    purchase_name = purchase_name.strip() or None

    month = data.get("month")
    if not isinstance(month, str) or not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", month):
        return jsonify({"error": "Choose a valid month"}), 400
    try:
        month_start = parse_month(month)
    except ValueError:
        return jsonify({"error": "Choose a valid month"}), 400

    category_budget = Budget.query.filter_by(
        user_id=current_user.id,
        category=category,
        month=month_start,
    ).first()
    overall_budget = Budget.query.filter_by(
        user_id=current_user.id,
        category="Overall",
        month=month_start,
    ).first()
    category_spent = _monthly_spend(current_user.id, month_start, category)
    overall_spent = _monthly_spend(current_user.id, month_start)

    return jsonify({
        "purchase_name": purchase_name,
        "purchase_amount": amount,
        "category": category,
        "month": month,
        "category_impact": _purchase_impact(category_budget, category_spent, amount),
        "overall_impact": (
            _purchase_impact(overall_budget, overall_spent, amount)
            if overall_budget is not None
            else None
        ),
    })


@budgets_bp.post("")
@login_required
def save_budget():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400
    category = str(data.get("category", "")).strip()
    amount_value = data.get("amount")
    if isinstance(amount_value, bool):
        return jsonify({"error": "Enter a valid amount and month"}), 400
    try:
        amount = round(float(amount_value), 2)
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