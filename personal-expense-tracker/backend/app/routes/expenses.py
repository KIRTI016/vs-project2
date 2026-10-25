from datetime import date
import math
import re

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Expense

expenses_bp = Blueprint("expenses", __name__)
ALLOWED_CATEGORIES = {
    "Food", "Transport", "Shopping", "Bills", "Health", "Education", "Entertainment", "Other",
    "Housing", "Utilities",
}
ALLOWED_PAYMENTS = {"Cash", "UPI", "Card", "Bank Transfer", "Bank transfer", "Mobile payment", "Other"}


def parse_expense(data):
    if not isinstance(data, dict):
        return None, "Enter expense details as a JSON object"
    amount_value = data.get("amount")
    if isinstance(amount_value, bool):
        return None, "Enter a valid amount and date"
    try:
        amount = float(amount_value)
        date_value = data.get("date")
        if not isinstance(date_value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", date_value):
            raise ValueError
        expense_date = date.fromisoformat(date_value)
    except (TypeError, ValueError):
        return None, "Enter a valid amount and date"
    category = str(data.get("category", "")).strip()
    payment_value = data.get("payment_method")
    payment_method = payment_value.strip() if isinstance(payment_value, str) else ""
    if not math.isfinite(amount) or amount <= 0 or amount > 100000000:
        return None, "Amount must be greater than zero"
    if category not in ALLOWED_CATEGORIES:
        return None, "Choose a valid category"
    if payment_method not in ALLOWED_PAYMENTS:
        return None, "Choose a valid payment method"
    description_value = data.get("description", "")
    if not isinstance(description_value, str):
        return None, "Description must be text"
    description = description_value.strip()
    if len(description) > 240:
        return None, "Keep the description under 240 characters"
    amount = round(amount, 2)
    if amount <= 0:
        return None, "Amount must be at least one cent"
    return {
        "amount": amount,
        "date": expense_date,
        "category": category,
        "payment_method": payment_method,
        "description": description,
    }, None


@expenses_bp.get("")
@login_required
def list_expenses():
    query = Expense.query.filter_by(user_id=current_user.id)
    category = request.args.get("category")
    start = request.args.get("start")
    end = request.args.get("end")
    start_date = None
    end_date = None
    if category:
        if category not in ALLOWED_CATEGORIES:
            return jsonify({"error": "Choose a valid category"}), 400
        query = query.filter_by(category=category)
    try:
        if start:
            if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", start):
                raise ValueError
            start_date = date.fromisoformat(start)
            query = query.filter(Expense.date >= start_date)
        if end:
            if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", end):
                raise ValueError
            end_date = date.fromisoformat(end)
            query = query.filter(Expense.date <= end_date)
    except ValueError:
        return jsonify({"error": "Dates must use YYYY-MM-DD format"}), 400
    if start_date and end_date and start_date > end_date:
        return jsonify({"error": "Start date must be on or before end date"}), 400
    expenses = query.order_by(Expense.date.desc(), Expense.id.desc()).all()
    return jsonify({"expenses": [expense.to_dict() for expense in expenses]})


@expenses_bp.post("")
@login_required
def create_expense():
    data, error = parse_expense(request.get_json(silent=True) or {})
    if error:
        return jsonify({"error": error}), 400
    expense = Expense(user_id=current_user.id, **data)
    db.session.add(expense)
    db.session.commit()
    return jsonify({"expense": expense.to_dict()}), 201


@expenses_bp.put("/<int:expense_id>")
@login_required
def update_expense(expense_id):
    expense = Expense.query.filter_by(id=expense_id, user_id=current_user.id).first_or_404()
    data, error = parse_expense(request.get_json(silent=True) or {})
    if error:
        return jsonify({"error": error}), 400
    for key, value in data.items():
        setattr(expense, key, value)
    db.session.commit()
    return jsonify({"expense": expense.to_dict()})


@expenses_bp.delete("/<int:expense_id>")
@login_required
def delete_expense(expense_id):
    expense = Expense.query.filter_by(id=expense_id, user_id=current_user.id).first_or_404()
    db.session.delete(expense)
    db.session.commit()
    return jsonify({"message": "Expense deleted"})